from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from ..db import get_session
from ..models.ticket import Ticket
from ..schemas.ticket import TicketCreateIn, TicketOut
from ..core.current_user import get_current_user
from ..models.user import User
from ..models.event import TicketEvent
from ..schemas.ticket_status import ALLOWED_STATUS, TicketStatusUpdateIn
from ..schemas.event import EventOut
from ..models.comment import TicketComment
from ..schemas.ticket_detail import TicketDetailOut
from ..core.ticket_rules import can_transition
from ..models.attachment import Attachment
from ..schemas.attachment import AttachmentRegisterIn

router = APIRouter(prefix="/tickets", tags=["tickets"])

def is_agent(user: User) -> bool:
    return user.role in ("agent", "admin")

@router.post("", response_model=TicketOut)
def create_ticket(
    payload: TicketCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    t = Ticket(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        category=payload.category,
        requester_id=user.id,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return t

@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if (t.requester_id != user.id) and (user.role not in ("agent", "admin")):
        raise HTTPException(status_code=403, detail="Forbidden")
    return t

def is_staff(user: User) -> bool:
    return user.role in ("agent", "admin")

@router.patch("/{ticket_id}/status")
def update_status(
    ticket_id: int,
    payload: TicketStatusUpdateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    old = ticket.status
    new = payload.status

    if not can_transition(old, new):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid transition: {old} → {new}",
        )

    ticket.status = new

    # 이벤트 기록
    ev = TicketEvent(
        ticket_id=ticket_id,
        actor_id=user.id,
        type="status_changed",
        from_value=old,
        to_value=new,
        note=payload.note,
    )
    session.add(ev)

    # note가 있으면 내부 코멘트 자동 생성
    if payload.note:
        c = TicketComment(
            ticket_id=ticket_id,
            author_id=user.id,
            body=payload.note,
            is_internal=True,
        )
        session.add(c)

    session.commit()

    return {"ok": True, "from": old, "to": new}


@router.get("/{ticket_id}/events", response_model=list[EventOut])
def list_events(
    ticket_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if not is_staff(user) and ticket.requester_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = select(TicketEvent).where(TicketEvent.ticket_id == ticket_id).order_by(TicketEvent.id.asc())
    return list(session.scalars(stmt).all())

@router.patch("/{ticket_id}/assign")
def assign_ticket(
    ticket_id: int,
    payload: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    assignee_id = payload.get("assignee_id")
    if assignee_id is None:
        raise HTTPException(status_code=422, detail="assignee_id is required")

    assignee = session.get(User, assignee_id)
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee user not found")

    # 전산팀만 배정 가능
    if assignee.role not in ("agent", "admin"):
        raise HTTPException(status_code=422, detail="Assignee must be staff (agent/admin)")

    old = ticket.assignee_id
    ticket.assignee_id = assignee_id

    ev = TicketEvent(
        ticket_id=ticket_id,
        actor_id=user.id,
        type="assigned",
        from_value=str(old) if old is not None else None,
        to_value=str(assignee_id),
        note=None,
    )
    session.add(ev)
    session.commit()

    return {"ok": True, "from": old, "to": assignee_id}


ALLOWED_STATUS = {"open", "in_progress", "resolved", "closed"}
ALLOWED_PRIORITY = {"low", "medium", "high", "urgent"}  # 네가 쓰는 값에 맞춰 조정 가능

@router.get("", response_model=list[TicketOut])  # prefix="/tickets"라면 path는 "" 또는 "/"
def list_tickets(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    category: str | None = Query(default=None),
    assignee_id: int | None = Query(default=None),

    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Ticket)

    # 권한: requester는 본인 것만
    if user.role == "requester":
        stmt = stmt.where(Ticket.requester_id == user.id)
    # staff(agent/admin)는 제한 없음
    elif user.role in ("agent", "admin"):
        pass
    else:
        # 혹시 모를 role 값 방어
        raise HTTPException(status_code=403, detail="Forbidden")
    # 필터
    if status is not None:
        if status not in ALLOWED_STATUS:
            raise HTTPException(status_code=422, detail=f"Invalid status: {status}")
        stmt = stmt.where(Ticket.status == status)

    if priority is not None:
        if priority not in ALLOWED_PRIORITY:
            raise HTTPException(status_code=422, detail=f"Invalid priority: {priority}")
        stmt = stmt.where(Ticket.priority == priority)

    if category is not None:
        stmt = stmt.where(Ticket.category == category)

    if assignee_id is not None:
        stmt = stmt.where(Ticket.assignee_id == assignee_id)

    # 정렬 + 페이지네이션
    stmt = stmt.order_by(desc(Ticket.id)).limit(limit).offset(offset)

    return list(session.scalars(stmt).all())

@router.get("/{ticket_id}/detail", response_model=TicketDetailOut)
def get_ticket_detail(
    ticket_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    is_staff = user.role in ("agent", "admin")
    if not is_staff and ticket.requester_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # comments: 이미 구현된 로직 그대로 사용 (내부댓글 필터 이미 하고 있지?)
    comments_stmt = select(TicketComment).where(TicketComment.ticket_id == ticket_id)
    if not is_staff:
        comments_stmt = comments_stmt.where(TicketComment.is_internal == False)
    comments = list(session.scalars(comments_stmt.order_by(TicketComment.id.asc())).all())

    # events: 이미 구현된 로직 그대로
    events_stmt = select(TicketEvent).where(TicketEvent.ticket_id == ticket_id).order_by(TicketEvent.id.asc())
    events = list(session.scalars(events_stmt).all())

    # ✅ attachments 추가
    att_stmt = select(Attachment).where(Attachment.ticket_id == ticket_id).order_by(Attachment.id.asc())
    if not is_staff:
        att_stmt = att_stmt.where(Attachment.is_internal == False)
    attachments = list(session.scalars(att_stmt).all())

    return {
        "ticket": ticket,
        "comments": comments,
        "events": events,
        "attachments": attachments,
    }


@router.post("/{ticket_id}/attachments")
def add_ticket_attachment(
    ticket_id: int,
    payload: AttachmentRegisterIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # requester는 본인 티켓만 + 내부첨부 금지
    if user.role == "requester":
        if ticket.requester_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if payload.is_internal:
            raise HTTPException(status_code=403, detail="requester cannot upload internal attachment")

    # staff는 내부첨부 가능
    elif user.role not in ("agent", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    a = Attachment(
        key=payload.key,
        filename=payload.filename,
        content_type=payload.content_type,
        size=payload.size,
        ticket_id=ticket_id,
        comment_id=None,
        is_internal=payload.is_internal,
        uploaded_by=user.id,
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return {"ok": True, "id": a.id}