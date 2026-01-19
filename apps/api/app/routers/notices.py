from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from ..db import get_session
from ..models.knowledge_item import KnowledgeItem
from ..models.user import User
from ..core.current_user import get_current_user
from ..schemas.notice import NoticeCreateIn, NoticeUpdateIn, NoticeOut
from pathlib import Path
from ..core.tiptap import dump_tiptap, load_tiptap, is_empty_doc, extract_image_sources
from ..core.settings import settings
from ..core.storage import delete_object, extract_key_from_url


router = APIRouter(prefix="/notices", tags=["notices"])


def require_staff(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("", response_model=list[NoticeOut])
def list_notices(session: Session = Depends(get_session)):
    stmt = select(KnowledgeItem).where(KnowledgeItem.kind == "notice").order_by(desc(KnowledgeItem.id))
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": load_tiptap(n.body),
            "author_emp_no": n.author_emp_no,
            "created_at": n.created_at,
            "updated_at": n.updated_at,
        }
        for n in session.scalars(stmt).all()
    ]


@router.get("/{notice_id}", response_model=NoticeOut)
def get_notice(notice_id: int, session: Session = Depends(get_session)):
    notice = session.get(KnowledgeItem, notice_id)
    if not notice or notice.kind != "notice":
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": notice.id,
        "title": notice.title,
        "body": load_tiptap(notice.body),
        "author_emp_no": notice.author_emp_no,
        "created_at": notice.created_at,
        "updated_at": notice.updated_at,
    }


@router.post("", response_model=NoticeOut)
def create_notice(
    payload: NoticeCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    require_staff(user)
    if is_empty_doc(payload.body):
        raise HTTPException(status_code=422, detail="Body is required")
    notice = KnowledgeItem(title=payload.title, body=payload.body, author_emp_no=user.emp_no, kind="notice")
    notice.body = dump_tiptap(payload.body)
    session.add(notice)
    session.commit()
    session.refresh(notice)
    return {
        "id": notice.id,
        "title": notice.title,
        "body": load_tiptap(notice.body),
        "author_emp_no": notice.author_emp_no,
        "created_at": notice.created_at,
        "updated_at": notice.updated_at,
    }


@router.patch("/{notice_id}", response_model=NoticeOut)
def update_notice(
    notice_id: int,
    payload: NoticeUpdateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    require_staff(user)
    notice = session.get(KnowledgeItem, notice_id)
    if not notice or notice.kind != "notice":
        raise HTTPException(status_code=404, detail="Not found")

    if payload.title is not None:
        notice.title = payload.title
    if payload.body is not None:
        if is_empty_doc(payload.body):
            raise HTTPException(status_code=422, detail="Body is required")
        notice.body = dump_tiptap(payload.body)

    session.commit()
    session.refresh(notice)
    return {
        "id": notice.id,
        "title": notice.title,
        "body": load_tiptap(notice.body),
        "author_emp_no": notice.author_emp_no,
        "created_at": notice.created_at,
        "updated_at": notice.updated_at,
    }


@router.delete("/{notice_id}")
def delete_notice(
    notice_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    require_staff(user)
    notice = session.get(KnowledgeItem, notice_id)
    if not notice or notice.kind != "notice":
        raise HTTPException(status_code=404, detail="Not found")
    keys = set()
    for src in extract_image_sources(notice.body):
        key = extract_key_from_url(src)
        if key:
            keys.add(key)
    if keys:
        if settings.STORAGE_BACKEND == "object":
            for key in keys:
                delete_object(key=key)
        else:
            upload_root = Path(settings.LOCAL_UPLOAD_ROOT)
            for key in keys:
                path = upload_root / key
                if path.exists():
                    path.unlink()
    session.delete(notice)
    session.commit()
    return {"ok": True}
