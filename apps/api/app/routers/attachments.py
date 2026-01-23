from __future__ import annotations

from datetime import datetime
import os
from tempfile import SpooledTemporaryFile
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from sqlalchemy.orm import Session
from pathlib import Path
from fastapi.responses import FileResponse, RedirectResponse

from app.core.current_user import get_current_user
from app.core.settings import settings
from app.core.storage import upload_fileobj, delete_object, get_presigned_get_url
from app.db import get_session
from app.models.attachment import Attachment
from app.models.ticket import Ticket
from app.models.user import User
from app.models.comment import TicketComment
from app.models.knowledge_item import KnowledgeItem
from app.schemas.attachment import AttachmentOut

UPLOAD_ROOT = Path(settings.LOCAL_UPLOAD_ROOT)
router = APIRouter(tags=["attachments"])

MAX_BYTES = 25 * 1024 * 1024  # 25MB
DENY_EXT = {".exe", ".bat", ".cmd", ".ps1", ".sh", ".js"}

def is_object_storage() -> bool:
    return settings.STORAGE_BACKEND == "object"

def is_staff(user: User) -> bool:
    return user.role == "admin"

def assert_ticket_access(user: User, ticket: Ticket) -> None:
    if is_staff(user):
        return
    if ticket.requester_emp_no != user.emp_no:
        raise HTTPException(status_code=403, detail="Forbidden")

def require_notice(notice_id: int, session: Session) -> KnowledgeItem:
    notice = session.get(KnowledgeItem, notice_id)
    if not notice or notice.kind != "notice":
        raise HTTPException(status_code=404, detail="Notice not found")
    return notice

def require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

@router.post("/tickets/{ticket_id}/attachments/upload", response_model=AttachmentOut)
async def upload_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    comment_id: int | None = Query(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    assert_ticket_access(user, ticket)

    filename = file.filename or "upload.bin"
    _, ext = os.path.splitext(filename.lower())
    if ext in DENY_EXT:
        raise HTTPException(status_code=400, detail="File type not allowed")

    spooled = SpooledTemporaryFile(max_size=5 * 1024 * 1024)
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_BYTES:
            raise HTTPException(status_code=413, detail="File too large")
        spooled.write(chunk)
    spooled.seek(0)

    key = f"uploads/{user.emp_no}/{datetime.utcnow().strftime('%Y/%m/%d')}/{uuid4().hex}{ext}"
    content_type = file.content_type or "application/octet-stream"

    if is_object_storage():
        await anyio.to_thread.run_sync(
            lambda: upload_fileobj(fileobj=spooled, key=key, content_type=content_type)
        )
    else:
        UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        target_path = UPLOAD_ROOT / key.replace("uploads/", "", 1)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        def _write_file():
            spooled.seek(0)
            with open(target_path, "wb") as f:
                f.write(spooled.read())

        await anyio.to_thread.run_sync(_write_file)

    if comment_id is not None:
        comment = session.get(TicketComment, comment_id)
        if not comment or comment.ticket_id != ticket_id:
            raise HTTPException(status_code=400, detail="Invalid comment reference")

    att = Attachment(
        key=key,
        filename=filename,
        content_type=content_type,
        size=size,
        ticket_id=ticket_id,
        comment_id=comment_id,
        uploaded_emp_no=user.emp_no,
    )
    session.add(att)
    session.commit()
    session.refresh(att)
    return att


@router.post("/notices/{notice_id}/attachments/upload", response_model=AttachmentOut)
async def upload_notice_attachment(
    notice_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    require_admin(user)
    require_notice(notice_id, session)

    filename = file.filename or "upload.bin"
    _, ext = os.path.splitext(filename.lower())
    if ext in DENY_EXT:
        raise HTTPException(status_code=400, detail="File type not allowed")

    spooled = SpooledTemporaryFile(max_size=5 * 1024 * 1024)
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_BYTES:
            raise HTTPException(status_code=413, detail="File too large")
        spooled.write(chunk)
    spooled.seek(0)

    key = f"uploads/{user.emp_no}/{datetime.utcnow().strftime('%Y/%m/%d')}/{uuid4().hex}{ext}"
    content_type = file.content_type or "application/octet-stream"

    if is_object_storage():
        await anyio.to_thread.run_sync(
            lambda: upload_fileobj(fileobj=spooled, key=key, content_type=content_type)
        )
    else:
        UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        target_path = UPLOAD_ROOT / key.replace("uploads/", "", 1)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        def _write_file():
            spooled.seek(0)
            with open(target_path, "wb") as f:
                f.write(spooled.read())

        await anyio.to_thread.run_sync(_write_file)

    att = Attachment(
        key=key,
        filename=filename,
        content_type=content_type,
        size=size,
        ticket_id=None,
        comment_id=None,
        notice_id=notice_id,
        uploaded_emp_no=user.emp_no,
    )
    session.add(att)
    session.commit()
    session.refresh(att)
    return att

@router.get("/attachments/{attachment_id}/download-url")
def get_download_url(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if att.notice_id is not None:
        require_notice(att.notice_id, session)
    else:
        ticket = session.get(Ticket, att.ticket_id) if att.ticket_id else None
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        if not is_staff(user):
            if ticket.requester_emp_no != user.emp_no:
                raise HTTPException(status_code=403, detail="Forbidden")

    if is_object_storage():
        return {
            "url": get_presigned_get_url(key=att.key, expires_in=600, filename=att.filename),
            "expires_in": 600,
        }

    return {"url": f"/attachments/{attachment_id}/download", "expires_in": 0}


@router.delete("/attachments/{attachment_id}")
def delete_attachment(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if att.ticket_id is None and att.notice_id is None:
        raise HTTPException(status_code=400, detail="Attachment has no parent reference")

    if is_object_storage():
        try:
            delete_object(key=att.key)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to delete object storage file")
    else:
        rel = att.key.replace("uploads/", "", 1)
        path = UPLOAD_ROOT / rel
        if path.exists():
            path.unlink()

    session.delete(att)
    session.commit()

    return {"ok": True, "deleted_attachment_id": attachment_id}

@router.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if att.notice_id is not None:
        require_notice(att.notice_id, session)
    else:
        if att.ticket_id is None:
            raise HTTPException(status_code=400, detail="Attachment is not linked to a ticket")
        ticket = session.get(Ticket, att.ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        if not is_staff(user):
            if ticket.requester_emp_no != user.emp_no:
                raise HTTPException(status_code=403, detail="Forbidden")

    if is_object_storage():
        return RedirectResponse(get_presigned_get_url(key=att.key, expires_in=600, filename=att.filename))

    rel = att.key.replace("uploads/", "", 1)
    path = UPLOAD_ROOT / rel

    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on server")

    return FileResponse(
        path=str(path),
        media_type=att.content_type or "application/octet-stream",
        filename=att.filename,
        headers={"Content-Disposition": f'attachment; filename="{att.filename}"'},
    )
