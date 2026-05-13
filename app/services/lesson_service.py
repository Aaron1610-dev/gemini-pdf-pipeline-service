from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter

from app.core.logging import append_job_log
from app.core.paths import job_config_path, job_log_path, job_workspace
from app.models.job_models import JobStatus
from app.services.job_service import ensure_job_exists, update_job_state
from app.services.progress_service import update_progress, update_result
from app.utils.files import read_json, write_json
from app.utils.time import utc_now_iso


def _workspace_file(job_id: str, name: str) -> Path:
    return job_workspace(job_id) / name


def _lesson_log_path(job_id: str) -> Path:
    return job_workspace(job_id) / "logs" / "lessons.log"


def _log(job_id: str, message: str) -> None:
    line = f"{utc_now_iso()} {message}"
    append_job_log(_lesson_log_path(job_id), line)
    append_job_log(job_log_path(job_id), f"{utc_now_iso()} [lessons] {message}")


def _num_from_heading(heading: str) -> str:
    match = re.search(r"\d+", str(heading or ""))
    return match.group(0) if match else ""


def _safe_folder_name(value: str) -> str:
    return str(value).replace("/", "_").replace("\\", "_").strip()


def _extract_items(payload: Any, key: str) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        items = payload.get(key, payload.get("items", []))
    else:
        items = payload
    if not isinstance(items, list):
        return []
    return [dict(item) for item in items if isinstance(item, dict)]


def _normalize_topic(topic: dict[str, Any], index: int) -> dict[str, Any]:
    heading = topic.get("heading") or topic.get("raw_heading") or (
        f"Chủ đề {topic.get('topic_num')}." if topic.get("topic_num") else ""
    )
    title = topic.get("title") or topic.get("raw_title") or topic.get("topic_name") or ""
    name = topic.get("name") or f"topic_{index + 1:02d}"
    topic_num = str(topic.get("topic_num") or _num_from_heading(heading) or index + 1)
    return {
        **topic,
        "name": _safe_folder_name(name),
        "start": int(topic.get("start") or 1),
        "end": int(topic.get("end") or topic.get("start") or 1),
        "heading": str(heading or ""),
        "title": str(title or ""),
        "topic_num": topic_num,
        "topic_name": str(topic.get("topic_name") or title or ""),
        "raw_heading": str(topic.get("raw_heading") or heading or ""),
        "raw_title": str(topic.get("raw_title") or title or ""),
    }


def _normalize_lesson(
    lesson: dict[str, Any],
    index: int,
    topic: dict[str, Any] | None = None,
) -> dict[str, Any]:
    heading = lesson.get("heading") or lesson.get("raw_heading") or (
        f"Bài {lesson.get('lesson_num')}." if lesson.get("lesson_num") else ""
    )
    title = lesson.get("title") or lesson.get("raw_title") or lesson.get("lesson_name") or ""
    name = lesson.get("name") or f"lesson_{index + 1:02d}"
    lesson_num = str(lesson.get("lesson_num") or _num_from_heading(heading) or index + 1)
    topic_num = lesson.get("topic_num") or (topic or {}).get("topic_num")
    topic_name = lesson.get("topic_name") or (topic or {}).get("topic_name")
    return {
        **lesson,
        "name": _safe_folder_name(name),
        "start": int(lesson.get("start") or 1),
        "end": int(lesson.get("end") or lesson.get("start") or 1),
        "heading": str(heading or ""),
        "title": str(title or ""),
        "lesson_num": lesson_num,
        "lesson_name": str(lesson.get("lesson_name") or title or ""),
        "topic_num": str(topic_num or ""),
        "topic_name": str(topic_name or ""),
        "raw_heading": str(lesson.get("raw_heading") or heading or ""),
        "raw_title": str(lesson.get("raw_title") or title or ""),
    }


def _slice_pdf(source_pdf: str, start: int, end: int, out_path: Path) -> None:
    reader = PdfReader(source_pdf)
    total = len(reader.pages)
    safe_start = max(1, min(int(start), total))
    safe_end = max(safe_start, min(int(end), total))
    writer = PdfWriter()
    for page_index in range(safe_start - 1, safe_end):
        writer.add_page(reader.pages[page_index])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("wb") as file:
        writer.write(file)


def _build_topic_pdfs(bundle_dir: Path, book_stem: str, source_pdf: str, topics: list[dict[str, Any]]) -> None:
    topic_dir = bundle_dir / "Topic"
    if topic_dir.exists():
        shutil.rmtree(topic_dir)
    topic_dir.mkdir(parents=True, exist_ok=True)

    for index, topic in enumerate(topics):
        item = _normalize_topic(topic, index)
        safe_name = item["name"] if item["name"].startswith("topic_") else f"topic_{index + 1:02d}"
        folder = topic_dir / safe_name
        out_pdf = folder / f"{book_stem}_{safe_name}.pdf"
        _slice_pdf(source_pdf, item["start"], item["end"], out_pdf)
        meta = {
            "kind": "topic",
            "name": safe_name,
            "start": item["start"],
            "end": item["end"],
            "source_pdf": str(Path(source_pdf).resolve()),
            "pdf": str(out_pdf.resolve()),
            "topic_num": item["topic_num"],
            "topic_name": item["topic_name"],
            "heading": item["heading"],
            "title": item["title"],
            "raw_heading": item["raw_heading"],
            "raw_title": item["raw_title"],
        }
        out_pdf.with_suffix(".json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def _build_lesson_pdfs(bundle_dir: Path, book_stem: str, source_pdf: str, lessons: list[dict[str, Any]]) -> None:
    lesson_dir = bundle_dir / "Lesson"
    if lesson_dir.exists():
        shutil.rmtree(lesson_dir)
    lesson_dir.mkdir(parents=True, exist_ok=True)

    for index, lesson in enumerate(lessons):
        item = _normalize_lesson(lesson, index)
        safe_name = item["name"] if item["name"].startswith("lesson_") else f"lesson_{index + 1:02d}"
        folder = lesson_dir / safe_name
        out_pdf = folder / f"{book_stem}_{safe_name}.pdf"
        _slice_pdf(source_pdf, item["start"], item["end"], out_pdf)
        meta = {
            "kind": "lesson",
            "name": safe_name,
            "start": item["start"],
            "end": item["end"],
            "source_pdf": str(Path(source_pdf).resolve()),
            "pdf": str(out_pdf.resolve()),
            "lesson_num": item["lesson_num"],
            "lesson_name": item["lesson_name"],
            "topic_num": item["topic_num"],
            "topic_name": item["topic_name"],
            "heading": item["heading"],
            "title": item["title"],
            "raw_heading": item["raw_heading"],
            "raw_title": item["raw_title"],
        }
        out_pdf.with_suffix(".json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def _write_bundle_manifest(
    bundle_dir: Path,
    book_stem: str,
    topics: list[dict[str, Any]],
    lessons: list[dict[str, Any]],
) -> Path:
    list_topic = []
    for index, topic in enumerate(topics):
        item = _normalize_topic(topic, index)
        list_topic.append(
            {
                item["name"]: {
                    "start": item["start"],
                    "end": item["end"],
                    "heading": item["heading"],
                    "title": item["title"],
                }
            }
        )

    list_lesson = []
    for index, lesson in enumerate(lessons):
        item = _normalize_lesson(lesson, index)
        list_lesson.append(
            {
                item["name"]: {
                    "start": item["start"],
                    "end": item["end"],
                    "heading": item["heading"],
                    "title": item["title"],
                    "topic_num": item["topic_num"],
                    "topic_name": item["topic_name"],
                }
            }
        )

    manifest = {"offset": 0, "list_topic": list_topic, "list_lesson": list_lesson}
    bundle_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = bundle_dir / f"{book_stem}.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path


def _group_lessons(lessons: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    index_by_key: dict[tuple[str, str], int] = {}
    for lesson in lessons:
        key = (str(lesson.get("topic_num") or ""), str(lesson.get("topic_name") or ""))
        if key not in index_by_key:
            index_by_key[key] = len(groups)
            groups.append(
                {
                    "topic_num": key[0],
                    "topic_name": key[1],
                    "lessons": [],
                }
            )
        groups[index_by_key[key]]["lessons"].append(lesson)
    return groups


def _map_lessons_to_topics(
    approved_topics: list[dict[str, Any]],
    raw_lessons: list[dict[str, Any]],
    job_id: str,
) -> list[dict[str, Any]]:
    seen_raw_keys: set[tuple[int, int, str]] = set()
    lessons_out: list[dict[str, Any]] = []
    total = len(approved_topics)

    for topic_index, topic in enumerate(approved_topics):
        t_start = int(topic.get("start") or 1)
        t_end = int(topic.get("end") or t_start)
        topic_lessons: list[dict[str, Any]] = []

        for lesson in raw_lessons:
            l_start = int(lesson.get("start") or 0)
            l_end = int(lesson.get("end") or 0)
            raw_key = (l_start, l_end, str(lesson.get("name") or ""))
            if raw_key in seen_raw_keys:
                continue
            if l_end >= t_start and l_start <= t_end:
                seen_raw_keys.add(raw_key)
                topic_lessons.append(
                    _normalize_lesson(
                        {
                            **lesson,
                            "start": max(l_start, t_start),
                            "end": min(l_end, t_end),
                        },
                        len(lessons_out) + len(topic_lessons),
                        topic,
                    )
                )

        if not topic_lessons:
            topic_lessons.append(
                _normalize_lesson(
                    {
                        "name": f"lesson_{len(lessons_out) + 1:02d}",
                        "start": t_start,
                        "end": t_end,
                        "heading": topic.get("heading", ""),
                        "title": topic.get("title", ""),
                    },
                    len(lessons_out),
                    topic,
                )
            )

        lessons_out.extend(topic_lessons)
        pct = round((topic_index + 1) * 100 / total) if total else 100
        write_json(
            _workspace_file(job_id, "lessons_partial.json"),
            {
                "lessons": lessons_out,
                "grouped_by_topic": _group_lessons(lessons_out),
                "updated_at": utc_now_iso(),
            },
        )
        update_progress(
            job_id,
            status=JobStatus.extracting_lessons,
            stage="extracting_lessons",
            message=f"Đang ánh xạ bài học theo chủ đề {topic_index + 1}/{total}.",
            percent=pct,
            current=topic_index + 1,
            total=total,
        )
        _log(job_id, f"topic {topic_index + 1}/{total}: pages {t_start}-{t_end} -> {len(topic_lessons)} lessons")

    return lessons_out


def extract_lessons_for_job(job_id: str) -> None:
    try:
        ensure_lesson_preconditions(job_id)
        config = read_json(job_config_path(job_id))
        source_pdf = Path(config["source_pdf_path"])
        approved_payload = read_json(_workspace_file(job_id, "approved_topics.json"))
        state = read_json(_workspace_file(job_id, "extraction_state.json"))

        approved_topics = [
            _normalize_topic(topic, index)
            for index, topic in enumerate(_extract_items(approved_payload, "topics"))
        ]
        raw_lessons = _extract_items(state.get("raw_lessons", []), "lessons")
        book_stem = state.get("book_stem") or Path(source_pdf).stem
        bundle_dir = Path(state.get("bundle_path") or state.get("rebuilt_bundle_path") or job_workspace(job_id) / book_stem)

        update_job_state(job_id, status=JobStatus.extracting_lessons, stage="extracting_lessons")
        update_progress(
            job_id,
            status=JobStatus.extracting_lessons,
            stage="extracting_lessons",
            message="Chuẩn bị dữ liệu chủ đề đã duyệt...",
            percent=5,
            current=0,
            total=len(approved_topics),
        )
        _log(job_id, "start extraction")
        _log(job_id, f"approved_topic_count={len(approved_topics)}")
        _log(job_id, f"raw_lesson_count={len(raw_lessons)}")

        if not approved_topics:
            raise ValueError("approved_topics.json contains no topics.")
        if not raw_lessons:
            _log(job_id, "raw lessons missing; fallback lessons will be created from topic ranges")

        update_progress(
            job_id,
            status=JobStatus.extracting_lessons,
            stage="mapping_lessons",
            message="Đang ánh xạ bài học vào từng chủ đề...",
            percent=15,
            current=0,
            total=len(approved_topics),
        )
        lessons_out = _map_lessons_to_topics(approved_topics, raw_lessons, job_id)
        if not lessons_out:
            raise ValueError("No lessons produced from approved topics.")

        _log(job_id, "rebuild Topic/ started")
        update_progress(
            job_id,
            status=JobStatus.extracting_lessons,
            stage="rebuilding_topic_pdfs",
            message="Đang cắt lại PDF theo chủ đề đã duyệt...",
            percent=35,
            current=0,
            total=len(approved_topics),
        )
        _build_topic_pdfs(bundle_dir, book_stem, str(source_pdf), approved_topics)
        _log(job_id, f"rebuild Topic/ completed count={len(approved_topics)}")

        _log(job_id, "rebuild Lesson/ started")
        update_progress(
            job_id,
            status=JobStatus.extracting_lessons,
            stage="rebuilding_lesson_pdfs",
            message="Đang cắt PDF theo bài học...",
            percent=65,
            current=0,
            total=len(lessons_out),
        )
        _build_lesson_pdfs(bundle_dir, book_stem, str(source_pdf), lessons_out)
        _log(job_id, f"rebuild Lesson/ completed count={len(lessons_out)}")

        manifest_path = _write_bundle_manifest(bundle_dir, book_stem, approved_topics, lessons_out)
        _log(job_id, f"manifest rewrite completed path={manifest_path}")
        update_progress(
            job_id,
            status=JobStatus.extracting_lessons,
            stage="writing_lessons",
            message="Đang ghi dữ liệu bài học...",
            percent=90,
            current=len(lessons_out),
            total=len(lessons_out),
        )

        state["rebuilt_bundle_path"] = str(bundle_dir)
        state["bundle_path"] = str(bundle_dir)
        state["book_stem"] = book_stem
        state["lessons_count"] = len(lessons_out)
        state["updated_at"] = utc_now_iso()
        write_json(_workspace_file(job_id, "extraction_state.json"), state)

        payload = {
            "lessons": lessons_out,
            "grouped_by_topic": _group_lessons(lessons_out),
            "updated_at": utc_now_iso(),
        }
        write_json(_workspace_file(job_id, "lessons_partial.json"), payload)

        update_result(
            job_id,
            ok=True,
            status=JobStatus.reviewing_lessons,
            message="Đã trích xuất bài học, chờ duyệt.",
            data={
                "bundle_path": str(bundle_dir),
                "book_stem": book_stem,
                "lessons": lessons_out,
                "grouped_by_topic": payload["grouped_by_topic"],
            },
        )
        update_progress(
            job_id,
            status=JobStatus.reviewing_lessons,
            stage="reviewing_lessons",
            message="Đã trích xuất bài học, chờ duyệt.",
            percent=100,
            current=len(lessons_out),
            total=len(lessons_out),
        )
        update_job_state(job_id, status=JobStatus.reviewing_lessons, stage="reviewing_lessons")
        _log(job_id, f"success lessons={len(lessons_out)} bundle_path={bundle_dir}")
    except Exception as exc:
        error = str(exc)
        try:
            update_job_state(job_id, status=JobStatus.error, stage="extracting_lessons", error=error)
            update_progress(
                job_id,
                status=JobStatus.error,
                stage="extracting_lessons",
                message=error,
                percent=0,
            )
            update_result(
                job_id,
                ok=False,
                status=JobStatus.error,
                message="Lesson extraction failed.",
                error=error,
            )
            _log(job_id, f"failure error={error}")
        except Exception:
            pass


def ensure_lesson_preconditions(job_id: str) -> None:
    ensure_job_exists(job_id)
    config = read_json(job_config_path(job_id))
    source_pdf = Path(config.get("source_pdf_path") or "")
    if not source_pdf.exists():
        raise FileNotFoundError(f"Source PDF not found: {source_pdf}")
    if not _workspace_file(job_id, "approved_topics.json").exists():
        raise FileNotFoundError("approved_topics.json not found. Approve topics before extracting lessons.")
    if not _workspace_file(job_id, "extraction_state.json").exists():
        raise FileNotFoundError("extraction_state.json not found. Topic extraction must run first.")


def read_lessons(job_id: str) -> dict[str, Any]:
    ensure_job_exists(job_id)
    approved_path = _workspace_file(job_id, "approved_lessons.json")
    partial_path = _workspace_file(job_id, "lessons_partial.json")
    if approved_path.exists():
        raw = read_json(approved_path)
        lessons = _extract_items(raw, "lessons")
        return {
            "ok": True,
            "job_id": job_id,
            "approved": True,
            "lessons": lessons,
            "grouped_by_topic": raw.get("grouped_by_topic") or _group_lessons(lessons),
            "raw": raw,
        }
    if partial_path.exists():
        raw = read_json(partial_path)
        lessons = _extract_items(raw, "lessons")
        return {
            "ok": True,
            "job_id": job_id,
            "approved": False,
            "lessons": lessons,
            "grouped_by_topic": raw.get("grouped_by_topic") or _group_lessons(lessons),
            "raw": raw,
        }
    raise FileNotFoundError("No lessons found for this job.")


def save_lessons(job_id: str, lessons: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_job_exists(job_id)
    normalized = [_normalize_lesson(lesson, index) for index, lesson in enumerate(lessons)]
    payload = {
        "lessons": normalized,
        "grouped_by_topic": _group_lessons(normalized),
        "updated_at": utc_now_iso(),
    }
    write_json(_workspace_file(job_id, "lessons_partial.json"), payload)
    update_result(
        job_id,
        ok=True,
        status=JobStatus.reviewing_lessons,
        message="Lessons updated.",
        data=payload,
    )
    update_progress(
        job_id,
        status=JobStatus.reviewing_lessons,
        stage="reviewing_lessons",
        message="Lessons updated. Waiting for approval.",
        percent=100,
        current=len(normalized),
        total=len(normalized),
    )
    update_job_state(job_id, status=JobStatus.reviewing_lessons, stage="reviewing_lessons")
    _log(job_id, f"lessons updated count={len(normalized)}")
    return {"ok": True, "job_id": job_id, "approved": False, **payload}


def approve_lessons(job_id: str, lessons: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    ensure_job_exists(job_id)
    if lessons is None:
        lessons = read_lessons(job_id)["lessons"]
    if not lessons:
        raise ValueError("Lesson list is empty.")
    normalized = [_normalize_lesson(lesson, index) for index, lesson in enumerate(lessons)]
    payload = {
        "lessons": normalized,
        "grouped_by_topic": _group_lessons(normalized),
        "approved": True,
        "approved_at": utc_now_iso(),
    }
    write_json(_workspace_file(job_id, "approved_lessons.json"), payload)
    update_job_state(job_id, status=JobStatus.reviewing_lessons, stage="reviewing_lessons")
    update_result(
        job_id,
        ok=True,
        status=JobStatus.reviewing_lessons,
        message="Lessons approved.",
        data=payload,
    )
    update_progress(
        job_id,
        status=JobStatus.reviewing_lessons,
        stage="reviewing_lessons",
        message="Lessons approved. Waiting for chunk extraction.",
        percent=100,
        current=len(normalized),
        total=len(normalized),
    )
    _log(job_id, f"lessons approved count={len(normalized)}")
    return {"ok": True, "job_id": job_id, "approved": True, **payload}
