from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, status

from app.models.chunk_models import ChunkAddPayload, ChunkListPayload, ChunkRecutPayload
from app.models.job_models import JobStatus
from app.services.chunk_service import (
    add_chunk as add_chunk_for_job,
    approve_chunks as approve_chunks_for_job,
    delete_chunk as delete_chunk_for_job,
    ensure_chunk_preconditions,
    extract_chunks_for_job,
    read_chunks,
    recut_chunk,
    save_chunks,
)
from app.services.job_service import update_job_state
from app.services.progress_service import update_progress

router = APIRouter(prefix="/api/jobs", tags=["chunks"])


@router.post("/{job_id}/extract/chunks")
def extract_chunks(job_id: str, background_tasks: BackgroundTasks):
    try:
        ensure_chunk_preconditions(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    update_job_state(job_id, status=JobStatus.extracting_chunks, stage="extracting_chunks")
    update_progress(
        job_id,
        status=JobStatus.extracting_chunks,
        stage="extracting_chunks",
        message="Đang trích xuất chunk, vui lòng chờ...",
        percent=5,
    )
    background_tasks.add_task(extract_chunks_for_job, job_id)
    return {
        "ok": True,
        "job_id": job_id,
        "status": JobStatus.extracting_chunks,
        "message": "Đang trích xuất chunk, vui lòng chờ...",
    }


@router.get("/{job_id}/chunks")
def get_chunks(job_id: str):
    try:
        return read_chunks(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/{job_id}/chunks")
def update_chunks(job_id: str, payload: ChunkListPayload):
    return save_chunks(
        job_id,
        [chunk.model_dump(mode="json", exclude_none=True) for chunk in payload.chunks],
    )


@router.post("/{job_id}/chunks/add")
def add_chunk(job_id: str, payload: ChunkAddPayload):
    try:
        return add_chunk_for_job(job_id, payload.model_dump(mode="json", exclude_none=True))
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{job_id}/chunks/{chunk_id}")
def delete_chunk(job_id: str, chunk_id: str):
    try:
        return delete_chunk_for_job(job_id, chunk_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{job_id}/chunks/recut")
def recut_chunks(job_id: str, payload: ChunkRecutPayload):
    try:
        return recut_chunk(job_id, payload.model_dump(mode="json", exclude_none=True))
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{job_id}/chunks/approve")
def approve_chunks(
    job_id: str,
    payload: ChunkListPayload | None = Body(default=None),
):
    try:
        chunks = None
        if payload is not None:
            chunks = [chunk.model_dump(mode="json", exclude_none=True) for chunk in payload.chunks]
        return approve_chunks_for_job(job_id, chunks)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
