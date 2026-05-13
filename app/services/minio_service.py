from __future__ import annotations

from pathlib import Path
from urllib.parse import quote, urlparse

from app.core.config import get_settings


def _endpoint_host(endpoint: str) -> str:
    parsed = urlparse(endpoint)
    if parsed.scheme:
        return parsed.netloc
    return endpoint.replace("http://", "").replace("https://", "").strip("/")


def get_minio_client():
    from minio import Minio

    settings = get_settings()
    return Minio(
        _endpoint_host(settings.minio_endpoint),
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket(bucket_name: str) -> None:
    client = get_minio_client()
    if not client.bucket_exists(bucket_name):
        client.make_bucket(bucket_name)


def file_size(local_path: str | Path) -> int:
    return Path(local_path).stat().st_size


def build_public_url(bucket: str, object_key: str) -> str:
    public_url = get_settings().minio_public_url.rstrip("/")
    encoded_key = quote(object_key, safe="/")
    return f"{public_url}/{bucket}/{encoded_key}"


def upload_file(
    local_path: str | Path,
    bucket: str,
    object_key: str,
    content_type: str = "application/octet-stream",
) -> dict:
    path = Path(local_path)
    if not path.exists():
        raise FileNotFoundError(f"Upload source not found: {path}")

    ensure_bucket(bucket)
    client = get_minio_client()
    size = file_size(path)
    client.fput_object(
        bucket_name=bucket,
        object_name=object_key,
        file_path=str(path),
        content_type=content_type,
    )
    return {
        "bucket": bucket,
        "object_key": object_key,
        "file_name": path.name,
        "url": build_public_url(bucket, object_key),
        "content_type": content_type,
        "size": size,
    }
