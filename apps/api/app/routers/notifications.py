from datetime import datetime, timedelta
import json
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from ..db import get_session
from ..core.current_user import get_current_user
from ..models.event import TicketEvent
from ..models.ticket import Ticket
from ..models.comment import TicketComment
from ..models.user import User
from ..models.contact_assignment_member import ContactAssignmentMember
from ..schemas.notification import NotificationOut

router = APIRouter(tags=["notifications"])


def is_staff(user: User) -> bool:
    return user.role == "admin"


STATUS_LABELS = {
    "open": "접수",
    "in_progress": "진행",
    "resolved": "완료",
    "closed": "사업 검토",
}


def _status_label(value: str | None) -> str:
    if not value:
        return "-"
    s = value.lower()
    if s in ("open", "new", "pending"):
        return STATUS_LABELS["open"]
    if s in ("in_progress", "processing", "assigned", "working", "progress"):
        return STATUS_LABELS["in_progress"]
    if s in ("resolved", "done", "completed"):
        return STATUS_LABELS["resolved"]
    if s in ("closed", "review", "business_review"):
        return STATUS_LABELS["closed"]
    return value


def _event_message(event: TicketEvent) -> str:
    if event.type == "ticket_created":
        return "요청이 접수되었습니다."
    if event.type == "status_changed":
        if event.from_value or event.to_value:
            before = _status_label(event.from_value)
            after = _status_label(event.to_value)
            return f"{before} -> {after}"
    if event.type in ("assignee_assigned", "assignee_changed"):
        if event.note:
            return event.note
    if event.type == "requester_updated" and event.note:
        try:
            payload = json.loads(event.note)
            summary = payload.get("summary")
            if isinstance(summary, str) and summary.strip():
                return summary
        except Exception:
            return event.note
    return event.note or ""


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    items: list[NotificationOut] = []
    seen_event_ids: set[int] = set()

    # 1) Ticket events for the user's own requests
    event_stmt = (
        select(TicketEvent, Ticket)
        .join(Ticket, TicketEvent.ticket_id == Ticket.id)
        .where(Ticket.requester_emp_no == user.emp_no)
        .where(TicketEvent.type.in_(["ticket_created", "assignee_assigned", "assignee_changed", "status_changed"]))
        .order_by(desc(TicketEvent.created_at), desc(TicketEvent.id))
        .limit(50)
    )
    for event, ticket in session.execute(event_stmt).all():
        if event.type == "status_changed" and event.to_value not in ("resolved", "closed", "in_progress"):
            continue
        created_at = event.created_at or ticket.updated_at or ticket.created_at
        if not created_at:
            continue
        if event.id in seen_event_ids:
            continue
        items.append(
            NotificationOut(
                id=f"event:{event.id}",
                ticket_id=ticket.id,
                ticket_title=ticket.title,
                type=event.type,
                message=_event_message(event),
                created_at=created_at,
            )
        )
        seen_event_ids.add(event.id)

    if is_staff(user):
        cutoff = datetime.utcnow() - timedelta(days=30)

        # 2) New tickets for staff (카테고리 담당자만)
        new_stmt = (
            select(Ticket)
            .join(ContactAssignmentMember, ContactAssignmentMember.category_id == Ticket.category_id)
            .where(ContactAssignmentMember.emp_no == user.emp_no)
            .where(Ticket.created_at >= cutoff)
            .order_by(desc(Ticket.created_at), desc(Ticket.id))
            .limit(50)
        )
        for ticket in session.scalars(new_stmt).all():
            items.append(
                NotificationOut(
                    id=f"ticket:{ticket.id}",
                    ticket_id=ticket.id,
                    ticket_title=ticket.title,
                    type="new_ticket",
                    message="새 요청이 등록되었습니다.",
                    created_at=ticket.created_at,
                )
            )

        # 3) Requester comments on assigned tickets
        comment_stmt = (
            select(TicketComment, Ticket, User)
            .join(Ticket, TicketComment.ticket_id == Ticket.id)
            .join(User, TicketComment.author_emp_no == User.emp_no)
            .where(Ticket.assignee_emp_no == user.emp_no)
            .where(User.role == "requester")
            .order_by(desc(TicketComment.created_at), desc(TicketComment.id))
            .limit(50)
        )
        for comment, ticket, author in session.execute(comment_stmt).all():
            created_at = comment.created_at or ticket.updated_at or ticket.created_at
            if not created_at:
                continue
            snippet = comment.title or "댓글이 등록되었습니다."
            items.append(
                NotificationOut(
                    id=f"comment:{comment.id}",
                    ticket_id=ticket.id,
                    ticket_title=ticket.title,
                    type="requester_commented",
                    message=snippet,
                    created_at=created_at,
                )
            )

        # 4) Assigned or changed to the current admin
        assign_stmt = (
            select(TicketEvent, Ticket)
            .join(Ticket, TicketEvent.ticket_id == Ticket.id)
            .where(TicketEvent.type.in_(["assignee_assigned", "assignee_changed"]))
            .where(TicketEvent.to_value == user.emp_no)
            .order_by(desc(TicketEvent.created_at), desc(TicketEvent.id))
            .limit(50)
        )
        for event, ticket in session.execute(assign_stmt).all():
            if event.id in seen_event_ids:
                continue
            created_at = event.created_at or ticket.updated_at or ticket.created_at
            if not created_at:
                continue
            items.append(
                NotificationOut(
                    id=f"assign:{event.id}",
                    ticket_id=ticket.id,
                    ticket_title=ticket.title,
                    type=event.type,
                    message=_event_message(event),
                    created_at=created_at,
                )
            )
    else:
        # 3) Staff comments on the user's tickets
        comment_stmt = (
            select(TicketComment, Ticket, User)
            .join(Ticket, TicketComment.ticket_id == Ticket.id)
            .join(User, TicketComment.author_emp_no == User.emp_no)
            .where(Ticket.requester_emp_no == user.emp_no)
            .where(User.role == "admin")
            .order_by(desc(TicketComment.created_at), desc(TicketComment.id))
            .limit(50)
        )
        for comment, ticket, author in session.execute(comment_stmt).all():
            created_at = comment.created_at or ticket.updated_at or ticket.created_at
            if not created_at:
                continue
            snippet = comment.title or "댓글이 등록되었습니다."
            items.append(
                NotificationOut(
                    id=f"comment:{comment.id}",
                    ticket_id=ticket.id,
                    ticket_title=ticket.title,
                    type="staff_commented",
                    message=snippet,
                    created_at=created_at,
                )
            )

    items.sort(key=lambda i: i.created_at, reverse=True)
    return items[:50]
