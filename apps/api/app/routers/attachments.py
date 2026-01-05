from __future__ import annotations

from datetime import datetime
import os
from tempfile import SpooledTemporaryFile
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.core.current_user import get_current_user
from app.core.object_storage import get_s3
from app.core.settings import settings
from app.db import get_session
from app.models.attachment import Attachment
from app.models.event import TicketEvent
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.attachment import AttachmentOut

# NOTE:
# - 업로드는 CORS/브라우저 제약을 피하려고 **백엔드 멀티파트 업로드**로 제공
#   => POST /tickets/{ticket_id}/attachments/upload
# - 다운로드/삭제는 리소스 기준으로 제공
#   => GET /attachments/{attachment_id}/download-url
#   => DELETE /attachments/{attachment_id}

router = APIRouter(tags=["attachments"])

MAX_BYTES = 25 * 1024 * 1024  # 25MB
DENY_EXT = {".exe", ".bat", ".cmd", ".ps1", ".sh", ".js"}


def is_staff(user: User) -> bool:
    return user.role in ("agent", "admin")


def assert_ticket_access(user: User, ticket: Ticket) -> None:
    if is_staff(user):
        return
    if ticket.requester_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/tickets/{ticket_id}/attachments/upload", response_model=AttachmentOut)
async def upload_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """백엔드로 파일을 직접 업로드하고, Attachment row + 이벤트 로그를 생성한다."""

    # 1) 티켓 로드 + 접근권한 체크
    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    assert_ticket_access(user, ticket)

    # 2) 파일명/확장자 기본 검증
    filename = file.filename or "upload.bin"
    _, ext = os.path.splitext(filename.lower())
    if ext in DENY_EXT:
        raise HTTPException(status_code=400, detail="File type not allowed")

    # 3) 용량 제한 + 임시파일(spool)
    spooled = SpooledTemporaryFile(max_size=5 * 1024 * 1024)  # 5MB 넘어가면 디스크로 스풀
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)  # 1MB
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_BYTES:
            raise HTTPException(status_code=413, detail="File too large")
        spooled.write(chunk)
    spooled.seek(0)

    # 4) 오브젝트 키 생성
    key = f"uploads/{user.id}/{datetime.utcnow().strftime('%Y/%m/%d')}/{uuid4().hex}{ext}"
    content_type = file.content_type or "application/octet-stream"

    # 5) Object Storage 업로드 (boto3 sync => thread)
    #    - presign과 동일하게 app.core.object_storage.get_s3() / settings.OBJECT_STORAGE_* 사용
    s3 = get_s3()
    await anyio.to_thread.run_sync(
        lambda: s3.upload_fileobj(
            Fileobj=spooled,
            Bucket=settings.OBJECT_STORAGE_BUCKET,
            Key=key,
            ExtraArgs={"ContentType": content_type},
        )
    )

    # 6) DB 등록
    att = Attachment(
        ticket_id=ticket_id,
        comment_id=None,
        filename=filename,
        key=key,
        content_type=content_type,
        size=size,
        is_internal=False,
        uploaded_by=user.id,
    )
    session.add(att)

    # 7) 이벤트 로그
    ev = TicketEvent(
        ticket_id=ticket_id,
        type="attachment_uploaded",
        actor_id=user.id,
        message=f"uploaded: {filename}",
    )
    session.add(ev)

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

    if att.ticket_id is None:
        raise HTTPException(status_code=400, detail="Attachment is not linked to a ticket")

    ticket = session.get(Ticket, att.ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # 권한 체크
    if not is_staff(user):
        if ticket.requester_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if att.is_internal:
            raise HTTPException(status_code=403, detail="Forbidden")

    s3 = get_s3()
    expires = 600  # 10분
    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": settings.OBJECT_STORAGE_BUCKET,
            "Key": att.key,
            "ResponseContentDisposition": f'attachment; filename="{att.filename}"',
            "ResponseContentType": att.content_type or "application/octet-stream",
        },
        ExpiresIn=expires,
    )

    return {"url": url, "expires_in": expires}


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

    if att.ticket_id is None:
        raise HTTPException(status_code=400, detail="Attachment is not linked to a ticket")

    # Object Storage에서 파일 삭제
    s3 = get_s3()
    try:
        s3.delete_object(Bucket=settings.OBJECT_STORAGE_BUCKET, Key=att.key)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete object storage file")

    session.delete(att)
    session.commit()

    return {"ok": True, "deleted_attachment_id": attachment_id}
