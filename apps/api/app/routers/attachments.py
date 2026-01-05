from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db import get_session
from app.core.current_user import get_current_user
from app.models.user import User
from app.models.attachment import Attachment
from app.models.ticket import Ticket

from app.core.object_storage import get_s3
from app.core.settings import settings
from __future__ import annotations

from uuid import uuid4
from datetime import datetime
import os
import anyio
from tempfile import SpooledTemporaryFile

from app.models.event import TicketEvent
from app.schemas.attachment import AttachmentOut

from app.core.storage import upload_fileobj

router = APIRouter(prefix="/attachments", tags=["attachments"])

MAX_BYTES = 25 * 1024 * 1024  # 25MB (원하면 조정)
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

    # 3) 용량 제한 + 임시파일(spool)로 저장 (한번에 메모리 안 올리기)
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

    # 4) 오브젝트 키 생성 (기존 presign_put과 동일한 패턴 추천)
    key = f"uploads/{user.id}/{datetime.utcnow().strftime('%Y/%m/%d')}/{uuid4().hex}{ext}"
    content_type = file.content_type or "application/octet-stream"

    # 5) Object Storage 업로드 (boto3는 sync라 thread로)
    await anyio.to_thread.run_sync(
        lambda: upload_fileobj(fileobj=spooled, key=key, content_type=content_type)
    )

    # 6) DB 등록
    att = Attachment(
        ticket_id=ticket_id,
        filename=filename,
        key=key,
        size=size,
        uploaded_by=user.id,
    )
    session.add(att)

    # 7) 이벤트 로그(감사) 기록 (이미 event 로그 모델 있으니 활용)
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

@router.get("/{attachment_id}/download-url")
def get_download_url(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # ticket 연결이 필수 (현재는 ticket 첨부만 쓰는 전제)
    if att.ticket_id is None:
        raise HTTPException(status_code=400, detail="Attachment is not linked to a ticket")

    ticket = session.get(Ticket, att.ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # 권한 체크
    if not is_staff(user):
        # requester는 자기 티켓만 + internal 첨부는 불가
        if ticket.requester_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if att.is_internal:
            raise HTTPException(status_code=403, detail="Forbidden")

    # presigned GET
    s3 = get_s3()
    expires = 600  # 10분 (원하면 settings로)
    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": settings.OBJECT_STORAGE_BUCKET,
            "Key": att.key,
            # 다운로드 파일명 지정(브라우저 저장 이름)
            "ResponseContentDisposition": f'attachment; filename="{att.filename}"',
            # content-type도 힌트 줄 수 있음
            "ResponseContentType": att.content_type,
        },
        ExpiresIn=expires,
    )

    return {"url": url, "expires_in": expires}

@router.delete("/{attachment_id}")
def delete_attachment(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    # 권한 체크
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # ticket 연결 확인
    if att.ticket_id is None:
        raise HTTPException(status_code=400, detail="Attachment is not linked to a ticket")

    ticket = session.get(Ticket, att.ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Object Storage에서 파일 삭제
    s3 = get_s3()
    try:
        s3.delete_object(
            Bucket=settings.OBJECT_STORAGE_BUCKET,
            Key=att.key,
        )
    except Exception as e:
        # 실제 서비스에서는 로깅 권장
        raise HTTPException(status_code=500, detail="Failed to delete object storage file")

    # DB row 삭제
    session.delete(att)
    session.commit()

    return {"ok": True, "deleted_attachment_id": attachment_id}
