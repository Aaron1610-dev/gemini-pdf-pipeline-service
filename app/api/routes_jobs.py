from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response

from app.api.routes_assets import asset_head_response, validate_object_key, _stream_minio_object
from app.core.config import get_settings
from app.core.paths import job_source_pdf_path, job_state_path
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


def _source_preview_response(job_id: str):
    job = get_job(job_id)
    local_pdf = job_source_pdf_path(job_id)
    source_path = Path(job.get("source_pdf_path") or local_pdf)
    if source_path.exists():
        return FileResponse(
            path=source_path,
            media_type="application/pdf",
            filename=source_path.name,
            content_disposition_type="inline",
        )

    object_key = _source_minio_key(job_id)
    if object_key:
        safe_key = validate_object_key(object_key)
        bucket = ((job.get("minio") or {}).get("bucket")) or None
        return _stream_minio_object(bucket or get_settings().minio_bucket, safe_key)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Source PDF not found for job {job_id}.",
    )


@router.get("/{job_id}/source/preview")
def preview_source_pdf(job_id: str):
    return _source_preview_response(job_id)


@router.head("/{job_id}/source/preview")
def head_source_pdf(job_id: str):
    job = get_job(job_id)
    local_pdf = job_source_pdf_path(job_id)
    source_path = Path(job.get("source_pdf_path") or local_pdf)
    if source_path.exists():
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
        bucket = ((job.get("minio") or {}).get("bucket")) or get_settings().minio_bucket
        return asset_head_response(bucket, safe_key)
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Source PDF not found for job {job_id}.",
    )
