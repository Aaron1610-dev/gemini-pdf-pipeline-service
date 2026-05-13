from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, Response

from app.api.routes_assets import asset_head_response, validate_object_key, _stream_minio_object
from app.core.config import get_settings
from app.core.paths import job_config_path, job_result_path, job_source_pdf_path, job_state_path
from app.services.job_service import create_job, debug_job_files, get_job, get_status, list_jobs
from app.utils.files import read_json

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
def read_jobs():
    return list_jobs()


@router.post("")
async def create_pipeline_job(
    file: UploadFile = File(...),
    book_name: str = Form(...),
    class_name: str = Form(...),
    subject_name: str = Form(...),
    subject_type: str | None = Form(default=None),
    pipeline_mode: str = Form(default="review_first"),
    enable_kaggle: bool = Form(default=False),
    enable_keywords: bool = Form(default=True),
):
    return await create_job(
        file=file,
        book_name=book_name,
        class_name=class_name,
        subject_name=subject_name,
        subject_type=subject_type,
        pipeline_mode=pipeline_mode,
        enable_kaggle=enable_kaggle,
        enable_keywords=enable_keywords,
    )


@router.get("/{job_id}")
def read_job(job_id: str):
    return get_job(job_id)


@router.get("/{job_id}/status")
def read_job_status(job_id: str):
    return get_status(job_id)


@router.get("/{job_id}/debug-files")
def read_job_debug_files(job_id: str):
    return debug_job_files(job_id)


def _source_minio_key(job_id: str) -> str | None:
    state_path = job_state_path(job_id)
    if not state_path.exists():
        return None
    state = read_json(state_path)
    minio = state.get("minio") or {}
    return minio.get("subject_object_key")


def _source_bucket(job: dict) -> str:
    return ((job.get("minio") or {}).get("bucket")) or get_settings().minio_bucket


def _source_candidates(job_id: str, job: dict) -> list[Path]:
    candidates = [job_source_pdf_path(job_id)]
    if job.get("source_pdf_path"):
        candidates.append(Path(job["source_pdf_path"]))
    if job_config_path(job_id).exists():
        config = read_json(job_config_path(job_id))
        if config.get("source_pdf_path"):
            candidates.append(Path(config["source_pdf_path"]))
    if job_result_path(job_id).exists():
        result = read_json(job_result_path(job_id))
        data = result.get("data") or {}
        for key in ["source_pdf_path", "source_pdf"]:
            if data.get(key):
                candidates.append(Path(data[key]))
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in candidates:
        resolved = path.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(path)
    return unique


def _source_missing_response(job_id: str, checked: list[str], status_code: int = status.HTTP_404_NOT_FOUND) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "ok": False,
            "job_id": job_id,
            "message": "Không tìm thấy file sách gốc cho job này.",
            "checked": checked,
        },
    )


def _source_preview_response(job_id: str):
    job = get_job(job_id)
    checked: list[str] = []
    for source_path in _source_candidates(job_id, job):
        checked.append(str(source_path))
        if not source_path.exists():
            continue
        return FileResponse(
            path=source_path,
            media_type="application/pdf",
            filename=source_path.name,
            content_disposition_type="inline",
        )

    object_key = _source_minio_key(job_id)
    if object_key:
        checked.append(f"{_source_bucket(job)}/{object_key}")
        try:
            safe_key = validate_object_key(object_key)
            return _stream_minio_object(_source_bucket(job), safe_key)
        except HTTPException:
            raise
        except Exception:
            return _source_missing_response(job_id, checked)

    return _source_missing_response(job_id, checked)


@router.get("/{job_id}/source/preview")
def preview_source_pdf(job_id: str):
    return _source_preview_response(job_id)


@router.head("/{job_id}/source/preview")
def head_source_pdf(job_id: str):
    job = get_job(job_id)
    checked: list[str] = []
    for source_path in _source_candidates(job_id, job):
        checked.append(str(source_path))
        if not source_path.exists():
            continue
        return Response(
            status_code=status.HTTP_200_OK,
            headers={
                "Content-Type": "application/pdf",
                "Content-Length": str(source_path.stat().st_size),
                "Content-Disposition": f'inline; filename="{source_path.name}"',
            },
        )
    object_key = _source_minio_key(job_id)
    if object_key:
        safe_key = validate_object_key(object_key)
        return asset_head_response(_source_bucket(job), safe_key)
    return _source_missing_response(job_id, checked)
