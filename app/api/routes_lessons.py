from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, status

from app.models.job_models import JobStatus
from app.models.lesson_models import LessonListPayload
from app.services.job_service import update_job_state
from app.services.lesson_service import (
    approve_lessons as approve_lessons_for_job,
    ensure_lesson_preconditions,
    extract_lessons_for_job,
    read_lessons,
    save_lessons,
)
from app.services.progress_service import update_progress

router = APIRouter(prefix="/api/jobs", tags=["lessons"])


@router.post("/{job_id}/extract/lessons")
def extract_lessons(job_id: str, background_tasks: BackgroundTasks):
    try:
        ensure_lesson_preconditions(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    update_job_state(job_id, status=JobStatus.extracting_lessons, stage="extracting_lessons")
    update_progress(
        job_id,
        status=JobStatus.extracting_lessons,
        stage="extracting_lessons",
        message="Lesson extraction queued.",
        percent=0,
    )
    background_tasks.add_task(extract_lessons_for_job, job_id)
    return {
        "ok": True,
        "job_id": job_id,
        "status": JobStatus.extracting_lessons,
        "message": "Lesson extraction started",
    }


@router.get("/{job_id}/lessons")
def get_lessons(job_id: str):
    try:
        return read_lessons(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/{job_id}/lessons")
def update_lessons(job_id: str, payload: LessonListPayload):
    return save_lessons(
        job_id,
        [lesson.model_dump(mode="json", exclude_none=True) for lesson in payload.lessons],
    )


@router.post("/{job_id}/lessons/approve")
def approve_lessons(
    job_id: str,
    payload: LessonListPayload | None = Body(default=None),
):
    try:
        lessons = None
        if payload is not None:
            lessons = [lesson.model_dump(mode="json", exclude_none=True) for lesson in payload.lessons]
        return approve_lessons_for_job(job_id, lessons)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
