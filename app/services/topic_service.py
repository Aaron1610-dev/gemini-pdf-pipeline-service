from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from app.core.config import get_settings
from app.core.gemini_keys import GeminiKeyManager
from app.core.logging import append_job_log
from app.core.paths import (
    job_config_path,
    job_log_path,
    job_workspace,
)
from app.models.job_models import JobStatus
from app.pipeline.les_top_pipeline import run_extract_save_split
from app.pipeline.pdf_output import flatten_manifest_items
from app.services.job_service import ensure_job_exists, update_job_state
from app.services.progress_service import update_progress, update_result
from app.utils.files import read_json, write_json
from app.utils.time import utc_now_iso


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^A-Za-z0-9]+", "-", ascii_text).strip("-")
    return slug or "book"


def _topic_log_path(job_id: str) -> Path:
    return job_workspace(job_id) / "logs" / "topics.log"


def _log(job_id: str, message: str) -> None:
    line = f"{utc_now_iso()} {message}"
    append_job_log(_topic_log_path(job_id), line)
    append_job_log(job_log_path(job_id), f"{utc_now_iso()} [topics] {message}")


def _workspace_file(job_id: str, name: str) -> Path:
    return job_workspace(job_id) / name


def _normalize_topic_for_api(item: dict[str, Any], index: int) -> dict[str, Any]:
    heading = item.get("heading") or item.get("raw_heading") or ""
    title = item.get("title") or item.get("raw_title") or item.get("topic_name") or ""
    return {
        **item,
        "topic_num": item.get("topic_num") or re.sub(r"\D+", "", str(heading)) or str(index + 1),
        "topic_name": item.get("topic_name") or title,
        "raw_heading": item.get("raw_heading") or heading,
        "raw_title": item.get("raw_title") or title,
    }


def extract_topics_for_job(job_id: str) -> None:
    try:
        ensure_job_exists(job_id)
        config = read_json(job_config_path(job_id))
        source_pdf = Path(config["source_pdf_path"])
        if not source_pdf.exists():
            raise FileNotFoundError(f"Source PDF not found: {source_pdf}")

        settings = get_settings()
        book_stem = f"{_slugify(config.get('book_name', source_pdf.stem))}_{job_id[:8]}"
        bundle_dir = job_workspace(job_id) / book_stem

        update_job_state(job_id, status=JobStatus.extracting_topics, stage="extracting_topics")
        update_progress(
            job_id,
            status=JobStatus.extracting_topics,
            stage="preparing_topics",
            message="Preparing topic extraction.",
            percent=0,
        )
        _log(job_id, "start extraction")
        _log(job_id, f"source_pdf={source_pdf}")
        _log(job_id, f"model={settings.gemini_model}")

        total_pages = len(PdfReader(str(source_pdf)).pages)
        _log(job_id, f"pdf_pages={total_pages}")

        key_manager = GeminiKeyManager.from_env()
        if key_manager.key_count() == 0:
            raise RuntimeError("No Gemini API keys configured. Set GEMINI_API_KEYS or GEMINI_API_KEY_1.")

        def progress_cb(stage: str, message: str, current: int = 0, total: int = 0) -> None:
            percent = round(current * 100 / total) if total else 0
            update_progress(
                job_id,
                status=JobStatus.extracting_topics,
                stage=stage,
                message=message[:300],
                percent=percent,
                current=current,
                total=total,
            )
            _log(job_id, f"{stage}: {message}")

        def status_cb(message: str) -> None:
            progress_cb("waiting_gemini_topics", message)

        progress_cb("uploading_pdf_to_gemini", "Building preview PDF and sending request to Gemini.")
        manifest, manifest_path, split_result = run_extract_save_split(
            key_manager,
            str(source_pdf),
            model=settings.gemini_model,
            output_root=bundle_dir,
            book_stem=book_stem,
            progress_cb=progress_cb,
            status_cb=status_cb,
        )

        topics = [
            _normalize_topic_for_api(item, index)
            for index, item in enumerate(flatten_manifest_items(manifest.get("list_topic", [])))
        ]
        raw_lessons = flatten_manifest_items(manifest.get("list_lesson", []))

        write_json(_workspace_file(job_id, "topics_partial.json"), {"topics": topics})
        write_json(
            _workspace_file(job_id, "extraction_state.json"),
            {
                "bundle_path": str(bundle_dir),
                "book_stem": book_stem,
                "manifest_path": manifest_path,
                "raw_lessons": raw_lessons,
                "topic_pdf_paths": split_result.get("topics", []),
                "lesson_pdf_paths": split_result.get("lessons", []),
                "updated_at": utc_now_iso(),
            },
        )

        update_result(
            job_id,
            ok=True,
            status=JobStatus.reviewing_topics,
            message="Topic extraction completed. Waiting for review.",
            data={
                "bundle_path": str(bundle_dir),
                "book_stem": book_stem,
                "topics": topics,
            },
        )
        update_progress(
            job_id,
            status=JobStatus.reviewing_topics,
            stage="reviewing_topics",
            message="Topic extraction completed. Waiting for review.",
            percent=100,
            current=len(topics),
            total=len(topics),
        )
        update_job_state(job_id, status=JobStatus.reviewing_topics, stage="reviewing_topics")
        _log(job_id, f"success topics={len(topics)} bundle_path={bundle_dir}")
    except Exception as exc:
        error = str(exc)
        try:
            update_job_state(job_id, status=JobStatus.error, stage="extracting_topics", error=error)
            update_progress(
                job_id,
                status=JobStatus.error,
                stage="extracting_topics",
                message=error,
                percent=0,
            )
            update_result(
                job_id,
                ok=False,
                status=JobStatus.error,
                message="Topic extraction failed.",
                error=error,
            )
            _log(job_id, f"failure error={error}")
        except Exception:
            pass


def read_topics(job_id: str) -> dict[str, Any]:
    ensure_job_exists(job_id)
    approved_path = _workspace_file(job_id, "approved_topics.json")
    partial_path = _workspace_file(job_id, "topics_partial.json")
    if approved_path.exists():
        data = read_json(approved_path)
        return {"ok": True, "job_id": job_id, "approved": True, "topics": data.get("topics", data)}
    if partial_path.exists():
        data = read_json(partial_path)
        return {"ok": True, "job_id": job_id, "approved": False, "topics": data.get("topics", data)}
    raise FileNotFoundError("No topics found for this job.")


def save_topics(job_id: str, topics: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_job_exists(job_id)
    payload = {"topics": topics, "updated_at": utc_now_iso()}
    write_json(_workspace_file(job_id, "topics_partial.json"), payload)
    update_result(
        job_id,
        ok=True,
        status=JobStatus.reviewing_topics,
        message="Topics updated.",
        data={"topics": topics},
    )
    update_progress(
        job_id,
        status=JobStatus.reviewing_topics,
        stage="reviewing_topics",
        message="Topics updated. Waiting for approval.",
        percent=100,
        current=len(topics),
        total=len(topics),
    )
    _log(job_id, f"topics updated count={len(topics)}")
    return {"ok": True, "job_id": job_id, "approved": False, "topics": topics}


def approve_topics(job_id: str, topics: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    ensure_job_exists(job_id)
    if topics is None:
        topics = read_topics(job_id)["topics"]
    if not topics:
        raise ValueError("Topic list is empty.")
    payload = {"topics": topics, "approved": True, "approved_at": utc_now_iso()}
    write_json(_workspace_file(job_id, "approved_topics.json"), payload)
    update_job_state(job_id, status=JobStatus.reviewing_topics, stage="reviewing_topics")
    update_result(
        job_id,
        ok=True,
        status=JobStatus.reviewing_topics,
        message="Topics approved.",
        data={"topics": topics, "approved": True},
    )
    _log(job_id, f"topics approved count={len(topics)}")
    return {"ok": True, "job_id": job_id, "approved": True, "topics": topics}

