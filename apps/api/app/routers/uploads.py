from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel
from uuid import uuid4
from datetime import datetime
from app.core.current_user import get_current_user
from app.models.user import User
from app.core.settings import settings
from app.core.storage import upload_fileobj, get_public_url, get_presigned_put_url, get_presigned_get_url
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
from tempfile import SpooledTemporaryFile
import anyio
import os

router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOAD_ROOT = Path(settings.LOCAL_UPLOAD_ROOT)
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOW_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}

class PresignIn(BaseModel):
    filename: str
    content_type: str

class PresignOut(BaseModel):
    key: str
    url: str
    expires_in: int

class UploadImageOut(BaseModel):
    key: str
    url: str
    content_type: str
    size: int

def is_object_storage() -> bool:
    return settings.STORAGE_BACKEND == "object"

@router.post("/presign", response_model=PresignOut)
def presign_put(payload: PresignIn, user: User = Depends(get_current_user)):
    if not is_object_storage():
        raise HTTPException(status_code=400, detail="Presign is only available for object storage")

    ext = ""
    if "." in payload.filename:
        ext = "." + payload.filename.split(".")[-1].lower()

    key = f"uploads/{user.emp_no}/{datetime.utcnow().strftime('%Y/%m/%d')}/{uuid4().hex}{ext}"
    try:
        url = get_presigned_put_url(key=key, content_type=payload.content_type, expires_in=600)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"presign failed: {e}")

    return PresignOut(key=key, url=url, expires_in=600)


@router.post("/images", response_model=UploadImageOut)
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")

    filename = file.filename or "image.bin"
    _, ext = os.path.splitext(filename.lower())
    if ext and ext not in ALLOW_IMAGE_EXT:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    spooled = SpooledTemporaryFile(max_size=2 * 1024 * 1024)
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image too large")
        spooled.write(chunk)
    spooled.seek(0)

    key = f"editor/{user.emp_no}/{datetime.utcnow().strftime('%Y/%m/%d')}/{uuid4().hex}{ext or '.png'}"
    content_type = file.content_type or "application/octet-stream"

    if is_object_storage():
        await anyio.to_thread.run_sync(lambda: upload_fileobj(fileobj=spooled, key=key, content_type=content_type))
        # Return API proxy URL so private buckets still work via presigned redirect.
        url = f"/uploads/{key}"
    else:
        UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        target_path = UPLOAD_ROOT / key
        target_path.parent.mkdir(parents=True, exist_ok=True)

        def _write_file():
            spooled.seek(0)
            with open(target_path, "wb") as f:
                f.write(spooled.read())

        await anyio.to_thread.run_sync(_write_file)
        url = f"/uploads/{key}"

    return UploadImageOut(
        key=key,
        url=url,
        content_type=content_type,
        size=size,
    )


@router.get("/{key:path}")
def serve_upload(key: str):
    if is_object_storage():
        return RedirectResponse(get_presigned_get_url(key=key, expires_in=600))
    if ".." in key:
        raise HTTPException(status_code=400, detail="Invalid path")
    path = (UPLOAD_ROOT / key).resolve()
    if not str(path).startswith(str(UPLOAD_ROOT.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(str(path))
