from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, status

from app.models.job_models import JobStatus
from app.models.lesson_models import LessonListPayload
from app.services.job_service import update_job_state
from app.services.lesson_service import (
    approve_lessons as approve_lessons_for_job,
    approve_lesson as approve_single_lesson_for_job,
    ensure_lesson_preconditions,
    extract_lessons_for_job,
    extract_lessons_for_topic,
    read_lessons,
    save_lessons,
)
from app.services.progress_service import update_progress

router = APIRouter(prefix="/api/jobs", tags=["lessons"])


@router.post("/{job_id}/extract/lessons")
def extract_lessons(
    job_id: str,
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] | None = Body(default=None),
):
    try:
        ensure_lesson_preconditions(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    topic_nums = payload.get("topic_nums") if isinstance(payload, dict) else None
    selected_topic_num = topic_nums[0] if isinstance(topic_nums, list) and len(topic_nums) == 1 else None
    stage = "extracting_lessons_for_topic" if selected_topic_num is not None else "extracting_lessons"
    message = (
        f"Đang trích xuất bài học cho Topic {int(selected_topic_num):02d}..."
        if selected_topic_num is not None and str(selected_topic_num).isdigit()
        else "Đang trích xuất bài học, vui lòng chờ..."
    )
    update_job_state(job_id, status=JobStatus.extracting_lessons, stage=stage)
    update_progress(
        job_id,
        status=JobStatus.extracting_lessons,
        stage=stage,
        message=message,
        percent=5,
    )
    if selected_topic_num is not None:
        background_tasks.add_task(extract_lessons_for_topic, job_id, selected_topic_num)
    else:
        background_tasks.add_task(extract_lessons_for_job, job_id)
    return {
        "ok": True,
        "job_id": job_id,
        "status": JobStatus.extracting_lessons,
        "message": message,
    }


@router.post("/{job_id}/topics/{topic_num}/extract-lessons")
def extract_lessons_for_selected_topic(job_id: str, topic_num: int, background_tasks: BackgroundTasks):
    try:
        ensure_lesson_preconditions(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    update_job_state(job_id, status=JobStatus.extracting_lessons, stage="extracting_lessons_for_topic")
    update_progress(
        job_id,
        status=JobStatus.extracting_lessons,
        stage="extracting_lessons_for_topic",
        message=f"Đang trích xuất bài học cho Topic {topic_num:02d}...",
        percent=5,
    )
    background_tasks.add_task(extract_lessons_for_topic, job_id, topic_num)
    return {
        "ok": True,
        "job_id": job_id,
        "status": JobStatus.extracting_lessons,
        "topic_num": topic_num,
        "message": f"Đang trích xuất bài học cho Topic {topic_num:02d}...",
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
    payload: dict[str, Any] | LessonListPayload | None = Body(default=None),
):
    try:
        lessons = None
        lesson_nums = None
        if payload is not None:
            if isinstance(payload, LessonListPayload):
                lessons = [lesson.model_dump(mode="json", exclude_none=True) for lesson in payload.lessons]
            elif isinstance(payload, dict):
                raw_lessons = payload.get("lessons")
                if isinstance(raw_lessons, list):
                    lessons = [dict(lesson) for lesson in raw_lessons if isinstance(lesson, dict)]
                raw_lesson_nums = payload.get("lesson_nums")
                if isinstance(raw_lesson_nums, list):
                    lesson_nums = raw_lesson_nums
        return approve_lessons_for_job(job_id, lessons=lessons, lesson_nums=lesson_nums)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{job_id}/lessons/{lesson_num}/approve")
def approve_lesson(job_id: str, lesson_num: int):
    try:
        return approve_single_lesson_for_job(job_id, lesson_num)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
