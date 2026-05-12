from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.gemini_keys import GeminiKeyManager
from app.core.logging import append_job_log
from app.core.paths import job_config_path, job_log_path, job_workspace
from app.models.job_models import JobStatus
from app.pipeline.chunk_pipeline import rebuild_lesson_chunks, run_extract_and_split_chunks_for_book
from app.services.job_service import ensure_job_exists, update_job_state
from app.services.lesson_service import _build_lesson_pdfs, _build_topic_pdfs, _write_bundle_manifest
from app.services.progress_service import update_progress, update_result
from app.utils.files import read_json, write_json
from app.utils.time import utc_now_iso


def _workspace_file(job_id: str, name: str) -> Path:
    return job_workspace(job_id) / name


def _chunk_log_path(job_id: str) -> Path:
    return job_workspace(job_id) / "logs" / "chunks.log"


def _log(job_id: str, message: str) -> None:
    line = f"{utc_now_iso()} {message}"
    append_job_log(_chunk_log_path(job_id), line)
    append_job_log(job_log_path(job_id), f"{utc_now_iso()} [chunks] {message}")


def _extract_items(payload: Any, key: str) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        items = payload.get(key, payload.get("items", []))
    else:
        items = payload
    return [dict(item) for item in items or [] if isinstance(item, dict)]


def _chunk_number(value: Any, fallback: int) -> str:
    if value is None:
        return str(fallback)
    text = str(value)
    match = re.search(r"\d+", text)
    return match.group(0) if match else str(fallback)


def _find_bundle(job_id: str) -> tuple[dict[str, Any], str, Path]:
    state_path = _workspace_file(job_id, "extraction_state.json")
    if not state_path.exists():
        raise FileNotFoundError("extraction_state.json not found. Topic/lesson stages must run first.")
    state = read_json(state_path)
    book_stem = state.get("book_stem")
    if not book_stem:
        raise FileNotFoundError("book_stem missing in extraction_state.json.")
    bundle_dir = Path(state.get("bundle_path") or state.get("rebuilt_bundle_path") or job_workspace(job_id) / book_stem)
    return state, book_stem, bundle_dir


def _lesson_pdf_map(bundle_dir: Path) -> dict[str, Path]:
    return {pdf.stem: pdf for pdf in sorted((bundle_dir / "Lesson").rglob("*.pdf"))}


def _normalize_chunk(meta: dict[str, Any], index: int, lesson_lookup: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    lesson_stem = str(meta.get("lesson_stem") or "")
    chunk = str(meta.get("chunk") or meta.get("chunk_num") or f"chunk_{index + 1:02d}")
    if not chunk.startswith("chunk_"):
        chunk = f"chunk_{int(_chunk_number(chunk, index + 1)):02d}"
    lesson_info = (lesson_lookup or {}).get(lesson_stem, {})
    chunk_num = _chunk_number(meta.get("chunk_num") or chunk, index + 1)
    title = meta.get("title") or meta.get("chunk_name") or ""
    pdf_path = meta.get("pdf_path") or meta.get("chunk_pdf")
    metadata_path = meta.get("metadata_path")
    out = {
        **meta,
        "chunk_id": meta.get("chunk_id") or meta.get("id") or f"{lesson_stem}:{chunk}",
        "id": meta.get("id") or meta.get("chunk_id") or f"{lesson_stem}:{chunk}",
        "lesson_stem": lesson_stem,
        "lesson_num": meta.get("lesson_num") or lesson_info.get("lesson_num", ""),
        "lesson_name": meta.get("lesson_name") or lesson_info.get("lesson_name", ""),
        "chunk": chunk,
        "chunk_num": chunk_num,
        "chunk_name": meta.get("chunk_name") or title or chunk,
        "heading": meta.get("heading") or "",
        "title": title,
        "start": int(meta.get("start") or 1),
        "end": int(meta.get("end") or meta.get("start") or 1),
        "content_head": bool(meta.get("content_head", False)),
        "pdf_path": str(pdf_path) if pdf_path else None,
        "chunk_pdf": str(pdf_path) if pdf_path else meta.get("chunk_pdf"),
        "metadata_path": str(metadata_path) if metadata_path else meta.get("metadata_path"),
    }
    return out


def _lesson_lookup(job_id: str, bundle_dir: Path) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    approved_path = _workspace_file(job_id, "approved_lessons.json")
    lessons = _extract_items(read_json(approved_path), "lessons") if approved_path.exists() else []
    pdfs = _lesson_pdf_map(bundle_dir)
    for lesson in lessons:
        name = lesson.get("name")
        stem = ""
        if name:
            matches = [pdf_stem for pdf_stem in pdfs if pdf_stem.endswith(str(name))]
            stem = matches[0] if matches else ""
        if stem:
            lookup[stem] = lesson
    return lookup


def _collect_chunk_metas(bundle_dir: Path, job_id: str) -> list[dict[str, Any]]:
    lookup = _lesson_lookup(job_id, bundle_dir)
    chunks = []
    for meta_path in sorted((bundle_dir / "Chunk").rglob("*.json")):
        if meta_path.name.endswith(".keywords.json"):
            continue
        try:
            meta = read_json(meta_path)
        except Exception:
            continue
        if not meta.get("lesson_stem") or not meta.get("chunk"):
            continue
        meta["metadata_path"] = str(meta_path)
        chunks.append(_normalize_chunk(meta, len(chunks), lookup))
    chunks.sort(key=lambda item: (item.get("lesson_stem", ""), item.get("chunk", "")))
    return chunks


def _group_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    index_by_stem: dict[str, int] = {}
    for chunk in chunks:
        stem = str(chunk.get("lesson_stem") or "")
        if stem not in index_by_stem:
            index_by_stem[stem] = len(groups)
            groups.append(
                {
                    "lesson_num": str(chunk.get("lesson_num") or ""),
                    "lesson_name": str(chunk.get("lesson_name") or ""),
                    "lesson_stem": stem,
                    "chunks": [],
                }
            )
        groups[index_by_stem[stem]]["chunks"].append(chunk)
    return groups


def _write_chunks_partial(job_id: str, chunks: list[dict[str, Any]]) -> dict[str, Any]:
    payload = {
        "chunks": chunks,
        "grouped_by_lesson": _group_chunks(chunks),
        "updated_at": utc_now_iso(),
    }
    write_json(_workspace_file(job_id, "chunks_partial.json"), payload)
    return payload


def ensure_chunk_preconditions(job_id: str) -> None:
    ensure_job_exists(job_id)
    config = read_json(job_config_path(job_id))
    source_pdf = Path(config.get("source_pdf_path") or "")
    if not source_pdf.exists():
        raise FileNotFoundError(f"Source PDF not found: {source_pdf}")
    if not _workspace_file(job_id, "approved_lessons.json").exists():
        raise FileNotFoundError("approved_lessons.json not found. Approve lessons before extracting chunks.")
    _state, _book_stem, bundle_dir = _find_bundle(job_id)
    lesson_dir = bundle_dir / "Lesson"
    if not lesson_dir.exists():
        raise FileNotFoundError(f"Lesson directory not found: {lesson_dir}")
    if not list(lesson_dir.rglob("*.pdf")):
        raise FileNotFoundError(f"No lesson PDFs found under: {lesson_dir}")


def _rebuild_canonical_topic_lesson(job_id: str, bundle_dir: Path, book_stem: str, source_pdf: str) -> None:
    topics_payload = read_json(_workspace_file(job_id, "approved_topics.json")) if _workspace_file(job_id, "approved_topics.json").exists() else {}
    lessons_payload = read_json(_workspace_file(job_id, "approved_lessons.json"))
    topics = _extract_items(topics_payload, "topics")
    lessons = _extract_items(lessons_payload, "lessons")
    _log(job_id, "canonical Topic/ rebuild started")
    _build_topic_pdfs(bundle_dir, book_stem, source_pdf, topics)
    _log(job_id, f"canonical Topic/ rebuild completed count={len(topics)}")
    _log(job_id, "canonical Lesson/ rebuild started")
    _build_lesson_pdfs(bundle_dir, book_stem, source_pdf, lessons)
    _log(job_id, f"canonical Lesson/ rebuild completed count={len(lessons)}")
    _write_bundle_manifest(bundle_dir, book_stem, topics, lessons)
    _log(job_id, "bundle manifest updated")


def extract_chunks_for_job(job_id: str) -> None:
    try:
        ensure_chunk_preconditions(job_id)
        config = read_json(job_config_path(job_id))
        source_pdf = str(Path(config["source_pdf_path"]))
        state, book_stem, bundle_dir = _find_bundle(job_id)
        approved_lessons = _extract_items(read_json(_workspace_file(job_id, "approved_lessons.json")), "lessons")

        update_job_state(job_id, status=JobStatus.extracting_chunks, stage="extracting_chunks")
        update_progress(
            job_id,
            status=JobStatus.extracting_chunks,
            stage="extracting_chunks",
            message="Preparing chunk extraction.",
            percent=0,
            current=0,
            total=len(approved_lessons),
        )
        _log(job_id, "start extraction")
        _log(job_id, f"approved_lesson_count={len(approved_lessons)}")

        _rebuild_canonical_topic_lesson(job_id, bundle_dir, book_stem, source_pdf)
        lesson_pdf_count = len(list((bundle_dir / "Lesson").rglob("*.pdf")))
        _log(job_id, f"lesson_pdf_count={lesson_pdf_count}")

        key_manager = GeminiKeyManager.from_env()
        if key_manager.key_count() == 0:
            raise RuntimeError("No Gemini API keys configured. Set GEMINI_API_KEYS or GEMINI_API_KEY_1.")

        active = {"done": 0, "total": lesson_pdf_count}

        def status_cb(message: str) -> None:
            update_progress(
                job_id,
                status=JobStatus.extracting_chunks,
                stage="extracting_chunks",
                message=message[:300],
                percent=round(active["done"] * 100 / active["total"]) if active["total"] else 0,
                current=active["done"],
                total=active["total"],
            )
            _log(job_id, f"gemini: {message}")

        def progress_cb(done: int, total: int, lesson_pdf: Path) -> None:
            active["done"] = done
            active["total"] = total
            percent = round(done * 100 / total) if total else 0
            update_progress(
                job_id,
                status=JobStatus.extracting_chunks,
                stage="extracting_chunks",
                message=f"Extracting chunks {done}/{total}: {lesson_pdf.name}",
                percent=percent,
                current=done,
                total=total,
            )
            _log(job_id, f"chunk progress {done}/{total}: {lesson_pdf.name}")
            chunks = _collect_chunk_metas(bundle_dir, job_id)
            if chunks:
                _write_chunks_partial(job_id, chunks)

        summary = run_extract_and_split_chunks_for_book(
            key_manager,
            bundle_dir,
            model=get_settings().gemini_model,
            resume=False,
            progress_cb=progress_cb,
            status_cb=status_cb,
        )
        if summary.get("skipped_lessons"):
            raise RuntimeError(f"Chunk extraction failed for lessons: {summary['skipped_lessons']}")

        chunks = _collect_chunk_metas(bundle_dir, job_id)
        payload = _write_chunks_partial(job_id, chunks)
        _log(job_id, f"chunk_count={len(chunks)}")

        state["bundle_path"] = str(bundle_dir)
        state["book_stem"] = book_stem
        state["chunks_count"] = len(chunks)
        state["updated_at"] = utc_now_iso()
        write_json(_workspace_file(job_id, "extraction_state.json"), state)
        update_result(
            job_id,
            ok=True,
            status=JobStatus.reviewing_chunks,
            message="Chunk extraction completed. Waiting for review.",
            data={"bundle_path": str(bundle_dir), "book_stem": book_stem, **payload},
        )
        update_progress(
            job_id,
            status=JobStatus.reviewing_chunks,
            stage="reviewing_chunks",
            message="Chunk extraction completed. Waiting for review.",
            percent=100,
            current=lesson_pdf_count,
            total=lesson_pdf_count,
        )
        update_job_state(job_id, status=JobStatus.reviewing_chunks, stage="reviewing_chunks")
        _log(job_id, f"success chunks={len(chunks)} bundle_path={bundle_dir}")
    except Exception as exc:
        error = str(exc)
        try:
            update_job_state(job_id, status=JobStatus.error, stage="extracting_chunks", error=error)
            update_progress(job_id, status=JobStatus.error, stage="extracting_chunks", message=error, percent=0)
            update_result(job_id, ok=False, status=JobStatus.error, message="Chunk extraction failed.", error=error)
            _log(job_id, f"failure error={error}")
        except Exception:
            pass


def read_chunks(job_id: str) -> dict[str, Any]:
    ensure_job_exists(job_id)
    approved_path = _workspace_file(job_id, "approved_chunks.json")
    partial_path = _workspace_file(job_id, "chunks_partial.json")
    if approved_path.exists():
        raw = read_json(approved_path)
        chunks = _extract_items(raw, "chunks")
        return {"ok": True, "job_id": job_id, "approved": True, "chunks": chunks, "grouped_by_lesson": raw.get("grouped_by_lesson") or _group_chunks(chunks), "raw": raw}
    if partial_path.exists():
        raw = read_json(partial_path)
        chunks = _extract_items(raw, "chunks")
        return {"ok": True, "job_id": job_id, "approved": False, "chunks": chunks, "grouped_by_lesson": raw.get("grouped_by_lesson") or _group_chunks(chunks), "raw": raw}
    raise FileNotFoundError("No chunks found for this job.")


def save_chunks(job_id: str, chunks: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_job_exists(job_id)
    normalized = [_normalize_chunk(chunk, index) for index, chunk in enumerate(chunks)]
    payload = _write_chunks_partial(job_id, normalized)
    update_result(job_id, ok=True, status=JobStatus.reviewing_chunks, message="Chunks updated.", data=payload)
    update_progress(job_id, status=JobStatus.reviewing_chunks, stage="reviewing_chunks", message="Chunks updated. Waiting for approval.", percent=100, current=len(normalized), total=len(normalized))
    update_job_state(job_id, status=JobStatus.reviewing_chunks, stage="reviewing_chunks")
    _log(job_id, f"chunks updated count={len(normalized)}")
    return {"ok": True, "job_id": job_id, "approved": False, **payload}


def _rewrite_lesson_chunks_from_flat(job_id: str, lesson_stem: str, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    _state, _book_stem, bundle_dir = _find_bundle(job_id)
    lesson_pdfs = _lesson_pdf_map(bundle_dir)
    lesson_pdf = lesson_pdfs.get(lesson_stem)
    if not lesson_pdf:
        raise FileNotFoundError(f"Lesson PDF not found for lesson_stem={lesson_stem}")
    lesson_chunks = [chunk for chunk in chunks if chunk.get("lesson_stem") == lesson_stem]
    rebuilt = rebuild_lesson_chunks(
        lesson_pdf=lesson_pdf,
        lesson_stem=lesson_stem,
        chunk_root=bundle_dir / "Chunk",
        chunk_items=lesson_chunks,
    )
    merged = [chunk for chunk in chunks if chunk.get("lesson_stem") != lesson_stem] + rebuilt
    merged.sort(key=lambda item: (item.get("lesson_stem", ""), item.get("chunk", "")))
    _write_chunks_partial(job_id, merged)
    return merged


def add_chunk(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    current = read_chunks(job_id)["chunks"] if _workspace_file(job_id, "chunks_partial.json").exists() else []
    _state, _book_stem, bundle_dir = _find_bundle(job_id)
    lesson_stem = payload.get("lesson_stem")
    if not lesson_stem and payload.get("lesson_num") is not None:
        suffix = f"lesson_{int(_chunk_number(payload.get('lesson_num'), 1)):02d}"
        matches = [stem for stem in _lesson_pdf_map(bundle_dir) if stem.endswith(suffix)]
        lesson_stem = matches[0] if matches else None
    if not lesson_stem:
        raise ValueError("lesson_stem or lesson_num is required.")
    new_chunk = {
        **payload,
        "lesson_stem": lesson_stem,
        "chunk": payload.get("chunk_num") or f"chunk_{len([c for c in current if c.get('lesson_stem') == lesson_stem]) + 1:02d}",
        "title": payload.get("title") or payload.get("chunk_name") or "",
        "content_head": bool(payload.get("content_head", False)),
    }
    updated = current + [_normalize_chunk(new_chunk, len(current))]
    rebuilt = _rewrite_lesson_chunks_from_flat(job_id, lesson_stem, updated)
    return {"ok": True, "job_id": job_id, "chunks": rebuilt, "grouped_by_lesson": _group_chunks(rebuilt), "count": len(rebuilt)}


def delete_chunk(job_id: str, chunk_id: str) -> dict[str, Any]:
    chunks = read_chunks(job_id)["chunks"]
    target = next((chunk for chunk in chunks if chunk.get("chunk_id") == chunk_id or chunk.get("id") == chunk_id), None)
    if target is None:
        raise FileNotFoundError(f"Chunk not found: {chunk_id}")
    lesson_stem = target.get("lesson_stem")
    remaining = [chunk for chunk in chunks if chunk is not target and chunk.get("chunk_id") != chunk_id and chunk.get("id") != chunk_id]
    rebuilt = _rewrite_lesson_chunks_from_flat(job_id, lesson_stem, remaining)
    return {"ok": True, "job_id": job_id, "chunks": rebuilt, "grouped_by_lesson": _group_chunks(rebuilt), "count": len(rebuilt)}


def recut_chunk(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    chunks = read_chunks(job_id)["chunks"]
    lesson_stem = payload["lesson_stem"]
    target_id = payload.get("chunk_id")
    chunk_num = payload.get("chunk_num")
    updated = []
    found = False
    for chunk in chunks:
        same = chunk.get("lesson_stem") == lesson_stem and (
            (target_id and (chunk.get("chunk_id") == target_id or chunk.get("id") == target_id))
            or (chunk_num is not None and str(chunk.get("chunk_num")) == str(chunk_num))
        )
        if same:
            found = True
            updated.append({**chunk, **payload})
        else:
            updated.append(chunk)
    if not found:
        raise FileNotFoundError("Chunk to recut not found.")
    rebuilt = _rewrite_lesson_chunks_from_flat(job_id, lesson_stem, updated)
    return {"ok": True, "job_id": job_id, "chunks": rebuilt, "grouped_by_lesson": _group_chunks(rebuilt), "count": len(rebuilt)}


def approve_chunks(job_id: str, chunks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    ensure_job_exists(job_id)
    if chunks is None:
        chunks = read_chunks(job_id)["chunks"]
    if not chunks:
        raise ValueError("Chunk list is empty.")
    normalized = [_normalize_chunk(chunk, index) for index, chunk in enumerate(chunks)]
    payload = {"chunks": normalized, "grouped_by_lesson": _group_chunks(normalized), "approved": True, "approved_at": utc_now_iso()}
    write_json(_workspace_file(job_id, "approved_chunks.json"), payload)
    update_job_state(job_id, status=JobStatus.reviewing_chunks, stage="reviewing_chunks")
    update_result(job_id, ok=True, status=JobStatus.reviewing_chunks, message="Chunks approved.", data=payload)
    update_progress(job_id, status=JobStatus.reviewing_chunks, stage="reviewing_chunks", message="Chunks approved. Ready for bundle preparation.", percent=100, current=len(normalized), total=len(normalized))
    _log(job_id, f"chunks approved count={len(normalized)}")
    return {"ok": True, "job_id": job_id, "approved": True, **payload}
