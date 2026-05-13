from fastapi import APIRouter, File, Form, UploadFile

from app.services.job_service import create_job, debug_job_files, get_job, get_status, list_jobs

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
