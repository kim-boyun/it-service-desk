# apps/api/app/core/storage.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import boto3
from urllib.parse import urlparse
from botocore.config import Config
import logging
from botocore.exceptions import ClientError

from .settings import settings

@dataclass(frozen=True)
class StorageConfig:
    endpoint_url: str
    bucket: str
    public_base_url: str | None

_logged_config = False


def get_storage_config() -> StorageConfig:
    global _logged_config
    if settings.STORAGE_BACKEND != "object":
        raise RuntimeError("Object storage is not enabled")
    if not all(
        [
            settings.OBJECT_STORAGE_ENDPOINT,
            settings.OBJECT_STORAGE_BUCKET,
        ]
    ):
        raise RuntimeError("Missing object storage configuration")
    cfg = StorageConfig(
        endpoint_url=settings.OBJECT_STORAGE_ENDPOINT or "",
        bucket=(settings.OBJECT_STORAGE_BUCKET or "").strip(),
        public_base_url=settings.OBJECT_STORAGE_PUBLIC_BASE_URL,
    )
    if not _logged_config:
        logging.getLogger("storage").info(
            "Object storage config loaded: endpoint=%s bucket=%s public_base=%s",
            cfg.endpoint_url,
            cfg.bucket,
            cfg.public_base_url or "",
        )
        _logged_config = True
    return cfg

def get_s3_client():
    cfg = get_storage_config()
    return boto3.client(
        "s3",
        endpoint_url=cfg.endpoint_url,
        config=Config(s3={"addressing_style": "path"}),
    )

def upload_fileobj(*, fileobj, key: str, content_type: str):
    cfg = get_storage_config()
    s3 = get_s3_client()
    try:
        s3.upload_fileobj(
            Fileobj=fileobj,
            Bucket=cfg.bucket,
            Key=key,
            ExtraArgs={"ContentType": content_type},
        )
    except ClientError as exc:
        logging.getLogger("storage").exception("Object storage upload failed: %s", exc)
        raise

def delete_object(*, key: str):
    cfg = get_storage_config()
    s3 = get_s3_client()
    s3.delete_object(Bucket=cfg.bucket, Key=key)

def copy_object(*, src_key: str, dest_key: str):
    cfg = get_storage_config()
    s3 = get_s3_client()
    s3.copy_object(
        Bucket=cfg.bucket,
        CopySource={"Bucket": cfg.bucket, "Key": src_key},
        Key=dest_key,
    )

def move_object(*, src_key: str, dest_key: str):
    # S3 호환 스토리지는 "move"가 없으므로 copy + delete로 구현
    copy_object(src_key=src_key, dest_key=dest_key)
    delete_object(key=src_key)

def get_public_url(*, key: str) -> str:
    cfg = get_storage_config()
    if cfg.public_base_url:
        return f"{cfg.public_base_url.rstrip('/')}/{key}"
    return f"{cfg.endpoint_url.rstrip('/')}/{cfg.bucket}/{key}"

def get_presigned_get_url(*, key: str, expires_in: int = 600) -> str:
    cfg = get_storage_config()
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": cfg.bucket, "Key": key},
        ExpiresIn=expires_in,
    )

def get_presigned_put_url(*, key: str, content_type: str, expires_in: int = 600) -> str:
    cfg = get_storage_config()
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={"Bucket": cfg.bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=expires_in,
    )


def extract_key_from_url(url: str) -> str | None:
    if not url:
        return None
    if url.startswith("/uploads/"):
        return url[len("/uploads/") :]
    if (
        url.startswith("editor/")
        or url.startswith("uploads/")
        or url.startswith("tickets/")
        or url.startswith("notices/")
    ):
        return url

    base = (settings.OBJECT_STORAGE_PUBLIC_BASE_URL or "").rstrip("/")
    if base and url.startswith(base + "/"):
        return url[len(base) + 1 :]

    endpoint = (settings.OBJECT_STORAGE_ENDPOINT or "").rstrip("/")
    bucket = (settings.OBJECT_STORAGE_BUCKET or "").strip("/")
    if endpoint and bucket:
        prefix = f"{endpoint}/{bucket}/"
        if url.startswith(prefix):
            return url[len(prefix) :]

    try:
        parsed = urlparse(url)
        path = parsed.path.lstrip("/")
        if bucket and path.startswith(bucket + "/"):
            return path[len(bucket) + 1 :]
    except Exception:
        pass
    return None
