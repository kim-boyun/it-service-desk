from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db import get_session
from app.core.current_user import get_current_user
from app.models.user import User
from app.models.attachment import Attachment
from app.models.ticket import Ticket

from app.core.object_storage import get_s3
from app.core.settings import settings

router = APIRouter(prefix="/attachments", tags=["attachments"])

def is_staff(user: User) -> bool:
    return user.role in ("agent", "admin")

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
