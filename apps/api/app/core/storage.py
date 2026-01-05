# apps/api/app/core/storage.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import boto3

from .settings import settings

@dataclass(frozen=True)
class StorageConfig:
    endpoint_url: str
    region: str
    access_key: str
    secret_key: str
    bucket: str

def get_storage_config() -> StorageConfig:
    return StorageConfig(
        endpoint_url=settings.NCP_S3_ENDPOINT,
        region=settings.NCP_S3_REGION,
        access_key=settings.NCP_ACCESS_KEY,
        secret_key=settings.NCP_SECRET_KEY,
        bucket=settings.NCP_BUCKET,
    )

def get_s3_client():
    cfg = get_storage_config()
    return boto3.client(
        "s3",
        endpoint_url=cfg.endpoint_url,
        region_name=cfg.region,
        aws_access_key_id=cfg.access_key,
        aws_secret_access_key=cfg.secret_key,
    )

def upload_fileobj(*, fileobj, key: str, content_type: str):
    cfg = get_storage_config()
    s3 = get_s3_client()
    s3.upload_fileobj(
        Fileobj=fileobj,
        Bucket=cfg.bucket,
        Key=key,
        ExtraArgs={"ContentType": content_type},
    )

def delete_object(*, key: str):
    cfg = get_storage_config()
    s3 = get_s3_client()
    s3.delete_object(Bucket=cfg.bucket, Key=key)
