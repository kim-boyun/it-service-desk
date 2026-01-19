from datetime import datetime
import logging
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from ..db import get_session
from ..models.ticket import Ticket
from ..models.project import Project
from ..models.project_member import ProjectMember
from ..models.ticket_category import TicketCategory
from ..schemas.ticket import TicketCreateIn, TicketOut, TicketUpdateIn, TicketAdminMetaUpdateIn
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
from ..models.mail_log import MailLog
from pathlib import Path
from ..core.tiptap import dump_tiptap, load_tiptap, is_empty_doc
from ..core.settings import settings
from ..core.storage import delete_object
from ..services.assignment_service import get_category_admins
from ..services.mail_events import (
    notify_admin_assigned,
    notify_admins_ticket_created,
    notify_requester_assignee_changed,
    notify_requester_status_changed,
    notify_requester_ticket_created,
)

router = APIRouter(prefix="/tickets", tags=["tickets"])


def is_staff(user: User) -> bool:
    return user.role == "admin"


def build_user_map(session: Session, ids: set[str]) -> dict[str, User]:
    if not ids:
        return {}
    stmt = select(User).where(User.emp_no.in_(ids))
    users = session.scalars(stmt).all()
    return {u.emp_no: u for u in users}

def build_project_map(session: Session, ids: set[int]) -> dict[int, Project]:
    if not ids:
        return {}
    stmt = select(Project).where(Project.id.in_(ids))
    projects = session.scalars(stmt).all()
    return {p.id: p for p in projects}


def serialize_ticket(t: Ticket, users: dict[str, User], projects: dict[int, Project] | None = None) -> dict:
    project = projects.get(t.project_id) if projects and t.project_id else None
    return {
        "id": t.id,
        "title": t.title,
        "description": load_tiptap(t.description),
        "status": t.status,
        "priority": t.priority,
        "category_id": t.category_id,
        "work_type": t.work_type,
        "project_id": t.project_id,
        "project_name": project.name if project else None,
        "requester_emp_no": t.requester_emp_no,
        "assignee_emp_no": t.assignee_emp_no,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "requester": users.get(t.requester_emp_no),
        "assignee": users.get(t.assignee_emp_no) if t.assignee_emp_no else None,
    }


@router.post("", response_model=TicketOut)
def create_ticket(
    payload: TicketCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    if is_empty_doc(payload.description):
        raise HTTPException(status_code=422, detail="Description is required")
    project_id = payload.project_id
    if project_id is not None:
        project = session.get(Project, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        member_stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_emp_no == user.emp_no,
        )
        if session.execute(member_stmt).first() is None:
            raise HTTPException(status_code=403, detail="Forbidden")

    if payload.category_id is None:
        raise HTTPException(status_code=422, detail="Category is required")
    category = session.get(TicketCategory, payload.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    t = Ticket(
        title=payload.title,
        description=dump_tiptap(payload.description),
        priority=payload.priority,
        category_id=payload.category_id,
        work_type=payload.work_type,
        project_id=project_id,
        requester_emp_no=user.emp_no,
        updated_at=now,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    ev = TicketEvent(
        ticket_id=t.id,
        actor_emp_no=user.emp_no,
        type="ticket_created",
        from_value=None,
        to_value=None,
        note=None,
    )
    session.add(ev)
    session.commit()
    user_ids: set[str] = {t.requester_emp_no}
    users = build_user_map(session, user_ids)
    project_ids: set[int] = {t.project_id} if t.project_id else set()
    projects = build_project_map(session, project_ids)

    try:
        notify_requester_ticket_created(t, user)
        if t.category_id:
            admins = get_category_admins(session, t.category_id)
            notify_admins_ticket_created(t, user, admins)
    except Exception:
        logger = logging.getLogger(__name__)
        logger.exception("티켓 접수 메일 발송 처리 실패 (ticket_id=%s)", t.id)

    return serialize_ticket(t, users, projects)


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    scope: str = Query(default="mine"),
):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if scope == "all":
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if t.requester_emp_no != user.emp_no:
            raise HTTPException(status_code=403, detail="Forbidden")
    user_ids: set[str] = {t.requester_emp_no}
    if t.assignee_emp_no:
        user_ids.add(t.assignee_emp_no)
    users = build_user_map(session, user_ids)
    project_ids: set[int] = {t.project_id} if t.project_id else set()
    projects = build_project_map(session, project_ids)
    return serialize_ticket(t, users, projects)


@router.patch("/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if t.requester_emp_no != user.emp_no:
        raise HTTPException(status_code=403, detail="Forbidden")
    if t.status != "open":
        raise HTTPException(status_code=422, detail="Only open tickets can be updated")

    old_description_raw = t.description
    old_created_at = t.created_at
    old_updated_at = t.updated_at
    old = {
        "title": t.title,
        "description": load_tiptap(t.description) if t.description else None,
        "priority": t.priority,
        "category_id": t.category_id,
        "work_type": t.work_type,
        "project_id": t.project_id,
    }
    old_project = session.get(Project, t.project_id) if t.project_id else None

    fields = set(payload.__fields_set__)

    if "title" in fields:
        title = (payload.title or "").strip()
        if not title:
            raise HTTPException(status_code=422, detail="Title is required")
        t.title = title

    if "description" in fields:
        if payload.description is None or is_empty_doc(payload.description):
            raise HTTPException(status_code=422, detail="Description is required")
        t.description = dump_tiptap(payload.description)

    if "priority" in fields:
        if payload.priority not in ALLOWED_PRIORITY:
            raise HTTPException(status_code=422, detail=f"Invalid priority: {payload.priority}")
        t.priority = payload.priority

    if "category_id" in fields:
        if payload.category_id is None:
            raise HTTPException(status_code=422, detail="Category is required")
        category = session.get(TicketCategory, payload.category_id)
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        t.category_id = payload.category_id

    if "work_type" in fields:
        t.work_type = payload.work_type

    if "project_id" in fields:
        if payload.project_id is not None:
            project = session.get(Project, payload.project_id)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            member_stmt = select(ProjectMember).where(
                ProjectMember.project_id == payload.project_id,
                ProjectMember.user_emp_no == user.emp_no,
            )
            if session.execute(member_stmt).first() is None:
                raise HTTPException(status_code=403, detail="Forbidden")
        t.project_id = payload.project_id

    t.updated_at = datetime.utcnow()

    changed_fields: list[str] = []
    if "title" in fields and t.title != old["title"]:
        changed_fields.append("제목")
    if "description" in fields and t.description != old_description_raw:
        changed_fields.append("내용")
    if "priority" in fields and t.priority != old["priority"]:
        changed_fields.append("우선순위")
    if "category_id" in fields and t.category_id != old["category_id"]:
        changed_fields.append("카테고리")
    if "work_type" in fields and t.work_type != old["work_type"]:
        changed_fields.append("작업 구분")
    if "project_id" in fields and t.project_id != old["project_id"]:
        changed_fields.append("프로젝트")

    if changed_fields:
        note_payload = {
            "summary": ", ".join(changed_fields),
            "before": {
                "title": old["title"],
                "priority": old["priority"],
                "category_id": old["category_id"],
                "work_type": old["work_type"],
                "project_id": old["project_id"],
                "project_name": old_project.name if old_project else None,
                "created_at": old_created_at.isoformat() if old_created_at else None,
                "updated_at": old_updated_at.isoformat() if old_updated_at else None,
                "description": old["description"],
            },
        }
        ev = TicketEvent(
            ticket_id=ticket_id,
            actor_emp_no=user.emp_no,
            type="requester_updated",
            from_value=None,
            to_value=None,
            note=json.dumps(note_payload, ensure_ascii=False),
        )
        session.add(ev)

    session.commit()
    session.refresh(t)
    user_ids: set[str] = {t.requester_emp_no}
    users = build_user_map(session, user_ids)
    project_ids: set[int] = {t.project_id} if t.project_id else set()
    projects = build_project_map(session, project_ids)
    return serialize_ticket(t, users, projects)


@router.delete("/{ticket_id}")
def delete_ticket(
    ticket_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if t.requester_emp_no != user.emp_no:
        raise HTTPException(status_code=403, detail="Forbidden")
    if t.status != "open":
        raise HTTPException(status_code=422, detail="Only open tickets can be deleted")
    attachments = session.scalars(select(Attachment).where(Attachment.ticket_id == ticket_id)).all()
    if attachments:
        if settings.STORAGE_BACKEND == "object":
            for att in attachments:
                try:
                    delete_object(key=att.key)
                except Exception:
                    logging.getLogger(__name__).exception(
                        "admin delete: failed to delete object storage file key=%s ticket_id=%s",
                        att.key,
                        ticket_id,
                    )
        else:
            upload_root = Path(settings.LOCAL_UPLOAD_ROOT)
            for att in attachments:
                rel = att.key.replace("uploads/", "", 1)
                path = upload_root / rel
                if path.exists():
                    path.unlink()
        for att in attachments:
            session.delete(att)
    session.delete(t)
    session.commit()
    return {"ok": True}


@router.delete("/{ticket_id}/admin")
def admin_delete_ticket(
    ticket_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")

    attachments = session.scalars(select(Attachment).where(Attachment.ticket_id == ticket_id)).all()
    if attachments:
        if settings.STORAGE_BACKEND == "object":
            for att in attachments:
                try:
                    delete_object(key=att.key)
                except Exception:
                    raise HTTPException(status_code=500, detail="Failed to delete object storage file")
        else:
            upload_root = Path(settings.LOCAL_UPLOAD_ROOT)
            for att in attachments:
                rel = att.key.replace("uploads/", "", 1)
                path = upload_root / rel
                if path.exists():
                    path.unlink()
        for att in attachments:
            session.delete(att)

    comments = session.scalars(select(TicketComment).where(TicketComment.ticket_id == ticket_id)).all()
    for c in comments:
        session.delete(c)

    events = session.scalars(select(TicketEvent).where(TicketEvent.ticket_id == ticket_id)).all()
    for e in events:
        session.delete(e)

    mail_logs = session.scalars(select(MailLog).where(MailLog.ticket_id == ticket_id)).all()
    for log in mail_logs:
        session.delete(log)

    session.delete(t)
    session.commit()
    return {"ok": True}


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
            detail=f"Invalid transition: {old} -> {new}",
        )

    ticket.status = new
    ticket.updated_at = datetime.utcnow()

    ev = TicketEvent(
        ticket_id=ticket_id,
        actor_emp_no=user.emp_no,
        type="status_changed",
        from_value=old,
        to_value=new,
        note=payload.note,
    )
    session.add(ev)

    session.commit()

    if new in ("resolved", "closed"):
        try:
            requester = session.get(User, ticket.requester_emp_no)
            if requester:
                notify_requester_status_changed(ticket, requester, new)
        except Exception:
            logger = logging.getLogger(__name__)
            logger.exception("상태 변경 메일 발송 처리 실패 (ticket_id=%s)", ticket_id)

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

    if not is_staff(user) and ticket.requester_emp_no != user.emp_no:
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = (
        select(TicketEvent)
        .where(TicketEvent.ticket_id == ticket_id)
        .order_by(desc(TicketEvent.created_at), desc(TicketEvent.id))
    )
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

    if "assignee_emp_no" not in payload:
        raise HTTPException(status_code=422, detail="assignee_emp_no is required")
    assignee_emp_no = payload.get("assignee_emp_no")

    old = ticket.assignee_emp_no
    if old == assignee_emp_no:
        return {"ok": True, "from": old, "to": assignee_emp_no}

    assignee = None
    if assignee_emp_no is not None:
        assignee = session.get(User, assignee_emp_no)
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee user not found")
        if assignee.role != "admin":
            raise HTTPException(status_code=422, detail="Assignee must be admin")

    old_user = session.get(User, old) if old is not None else None

    def format_user(u: User | None) -> str:
        if not u:
            return "미배정"
        parts = [u.kor_name, u.title, u.department]
        label = " / ".join([p for p in parts if p])
        return label or u.emp_no

    note = f"{format_user(old_user)} -> {format_user(assignee)}"
    ev_type = "assignee_assigned" if old is None and assignee_emp_no is not None else "assignee_changed"

    ticket.assignee_emp_no = assignee_emp_no
    ticket.updated_at = datetime.utcnow()

    ev = TicketEvent(
        ticket_id=ticket_id,
        actor_emp_no=user.emp_no,
        type=ev_type,
        from_value=str(old) if old is not None else None,
        to_value=str(assignee_emp_no) if assignee_emp_no is not None else None,
        note=note,
    )
    session.add(ev)
    session.commit()

    try:
        requester = session.get(User, ticket.requester_emp_no)
        if requester:
            notify_requester_assignee_changed(ticket, requester, assignee)
        if assignee:
            notify_admin_assigned(ticket, assignee)
    except Exception:
        logger = logging.getLogger(__name__)
        logger.exception("담당자 변경 메일 발송 처리 실패 (ticket_id=%s)", ticket_id)

    return {"ok": True, "from": old, "to": assignee_emp_no}


@router.patch("/{ticket_id}/admin-meta")
def update_admin_meta(
    ticket_id: int,
    payload: TicketAdminMetaUpdateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    changed: list[TicketEvent] = []

    if payload.category_id is not None and payload.category_id != ticket.category_id:
        old_category_id = ticket.category_id
        category = session.get(TicketCategory, payload.category_id)
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        category_map = {c.id: c.name for c in session.scalars(select(TicketCategory)).all()}
        old_label = category_map.get(old_category_id, "-")
        new_label = category.name
        ticket.category_id = payload.category_id
        changed.append(
            TicketEvent(
                ticket_id=ticket_id,
                actor_emp_no=user.emp_no,
                type="category_changed",
                from_value=str(old_category_id) if old_category_id else None,
                to_value=str(payload.category_id),
                note=f"{old_label} -> {new_label}",
            )
        )

    if payload.work_type is not None and payload.work_type != ticket.work_type:
        old = ticket.work_type or "-"
        new = payload.work_type
        ticket.work_type = payload.work_type
        changed.append(
            TicketEvent(
                ticket_id=ticket_id,
                actor_emp_no=user.emp_no,
                type="work_type_changed",
                from_value=old,
                to_value=new,
                note=f"{old} -> {new}",
            )
        )

    if changed:
        ticket.updated_at = datetime.utcnow()
        for ev in changed:
            session.add(ev)
        session.commit()

    return {"ok": True}


ALLOWED_STATUS = {"open", "in_progress", "resolved", "closed"}
ALLOWED_PRIORITY = {"low", "medium", "high", "urgent"}


@router.get("", response_model=list[TicketOut])
def list_tickets(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    scope: str = Query(default="mine"),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    assignee_emp_no: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Ticket)

    if scope == "all":
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        stmt = stmt.where(Ticket.requester_emp_no == user.emp_no)
        if user.role not in ("requester", "admin"):
            raise HTTPException(status_code=403, detail="Forbidden")

    if status is not None:
        if status not in ALLOWED_STATUS:
            raise HTTPException(status_code=422, detail=f"Invalid status: {status}")
        stmt = stmt.where(Ticket.status == status)

    if priority is not None:
        if priority not in ALLOWED_PRIORITY:
            raise HTTPException(status_code=422, detail=f"Invalid priority: {priority}")
        stmt = stmt.where(Ticket.priority == priority)

    if category_id is not None:
        stmt = stmt.where(Ticket.category_id == category_id)

    if assignee_emp_no is not None:
        stmt = stmt.where(Ticket.assignee_emp_no == assignee_emp_no)

    stmt = stmt.order_by(desc(Ticket.id)).limit(limit).offset(offset)

    tickets = list(session.scalars(stmt).all())
    user_ids: set[str] = set()
    for t in tickets:
        user_ids.add(t.requester_emp_no)
        if t.assignee_emp_no:
            user_ids.add(t.assignee_emp_no)
    project_ids: set[int] = {t.project_id for t in tickets if t.project_id}
    users = build_user_map(session, user_ids)
    projects = build_project_map(session, project_ids)
    return [serialize_ticket(t, users, projects) for t in tickets]


@router.get("/{ticket_id}/detail", response_model=TicketDetailOut)
def get_ticket_detail(
    ticket_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    scope: str = Query(default="mine"),
):
    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    is_staff = user.role == "admin"
    if scope == "all":
        if not is_staff:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if ticket.requester_emp_no != user.emp_no:
            raise HTTPException(status_code=403, detail="Forbidden")

    comments_stmt = select(TicketComment).where(TicketComment.ticket_id == ticket_id)
    comments = list(session.scalars(comments_stmt.order_by(TicketComment.id.asc())).all())

    events_stmt = (
        select(TicketEvent)
        .where(TicketEvent.ticket_id == ticket_id)
        .order_by(desc(TicketEvent.created_at), desc(TicketEvent.id))
    )
    events = list(session.scalars(events_stmt).all())

    att_stmt = select(Attachment).where(Attachment.ticket_id == ticket_id).order_by(Attachment.id.asc())
    attachments = (
        session.query(Attachment)
        .filter(Attachment.ticket_id == ticket_id)
        .order_by(Attachment.id.desc())
        .all()
    )

    user_ids: set[str] = {ticket.requester_emp_no}
    if ticket.assignee_emp_no:
        user_ids.add(ticket.assignee_emp_no)
    for c in comments:
        user_ids.add(c.author_emp_no)
    project_ids: set[int] = {ticket.project_id} if ticket.project_id else set()
    users = build_user_map(session, user_ids)
    projects = build_project_map(session, project_ids)

    comment_payload = [
        {
            "id": c.id,
            "ticket_id": c.ticket_id,
            "author_emp_no": c.author_emp_no,
            "author": users.get(c.author_emp_no),
            "title": c.title or "",
            "body": load_tiptap(c.body),
            "created_at": c.created_at,
        }
        for c in comments
    ]

    return {
        "ticket": serialize_ticket(ticket, users, projects),
        "comments": comment_payload,
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

    if user.role == "requester":
        if ticket.requester_emp_no != user.emp_no:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    a = Attachment(
        key=payload.key,
        filename=payload.filename,
        content_type=payload.content_type,
        size=payload.size,
        ticket_id=ticket_id,
        comment_id=None,
        uploaded_emp_no=user.emp_no,
    )
    session.add(a)
    ticket.updated_at = datetime.utcnow()
    session.commit()
    session.refresh(a)
    return {"ok": True, "id": a.id}
