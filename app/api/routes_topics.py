from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, status

from app.models.job_models import FutureEndpointResponse
from app.models.job_models import JobStatus
from app.models.topic_models import TopicListPayload
from app.services.job_service import ensure_job_exists, update_job_state
from app.services.progress_service import update_progress
from app.services.topic_service import (
    approve_topics as approve_topics_for_job,
    extract_topics_for_job,
    read_topics,
    save_topics,
)

router = APIRouter(prefix="/api/jobs", tags=["topics"])


def future() -> FutureEndpointResponse:
    return FutureEndpointResponse()


@router.post("/{job_id}/extract/topics")
def extract_topics(job_id: str, background_tasks: BackgroundTasks):
    ensure_job_exists(job_id)
    update_job_state(job_id, status=JobStatus.extracting_topics, stage="extracting_topics")
    update_progress(
        job_id,
        status=JobStatus.extracting_topics,
        stage="extracting_topics",
        message="Topic extraction queued.",
        percent=0,
    )
    background_tasks.add_task(extract_topics_for_job, job_id)
    return {
        "ok": True,
        "job_id": job_id,
        "status": JobStatus.extracting_topics,
        "message": "Topic extraction started",
    }


@router.get("/{job_id}/topics")
def get_topics(job_id: str):
    try:
        return read_topics(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/{job_id}/topics")
def update_topics(job_id: str, payload: TopicListPayload):
    return save_topics(
        job_id,
        [topic.model_dump(mode="json", exclude_none=True) for topic in payload.topics],
    )


@router.post("/{job_id}/topics/approve")
def approve_topics(
    job_id: str,
    payload: TopicListPayload | None = Body(default=None),
):
    try:
        topics = None
        if payload is not None:
            topics = [topic.model_dump(mode="json", exclude_none=True) for topic in payload.topics]
        return approve_topics_for_job(job_id, topics)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
