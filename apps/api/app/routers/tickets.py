from datetime import datetime
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from ..db import get_session
from ..models.ticket import Ticket
from ..models.project import Project
from ..models.project_member import ProjectMember
from ..schemas.ticket import TicketCreateIn, TicketOut, TicketUpdateIn
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
from ..core.tiptap import dump_tiptap, load_tiptap, is_empty_doc

router = APIRouter(prefix="/tickets", tags=["tickets"])


def is_agent(user: User) -> bool:
    return user.role in ("agent", "admin")


def is_staff(user: User) -> bool:
    return user.role in ("agent", "admin")


def build_user_map(session: Session, ids: set[int]) -> dict[int, User]:
    if not ids:
        return {}
    stmt = select(User).where(User.id.in_(ids))
    users = session.scalars(stmt).all()
    return {u.id: u for u in users}

def build_project_map(session: Session, ids: set[int]) -> dict[int, Project]:
    if not ids:
        return {}
    stmt = select(Project).where(Project.id.in_(ids))
    projects = session.scalars(stmt).all()
    return {p.id: p for p in projects}


def serialize_ticket(t: Ticket, users: dict[int, User], projects: dict[int, Project] | None = None) -> dict:
    project = projects.get(t.project_id) if projects and t.project_id else None
    return {
        "id": t.id,
        "title": t.title,
        "description": load_tiptap(t.description),
        "status": t.status,
        "priority": t.priority,
        "category": t.category,
        "work_type": t.work_type,
        "project_id": t.project_id,
        "project_name": project.name if project else None,
        "requester_id": t.requester_id,
        "assignee_id": t.assignee_id,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "requester": users.get(t.requester_id),
        "assignee": users.get(t.assignee_id) if t.assignee_id else None,
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
            ProjectMember.user_id == user.id,
        )
        if session.execute(member_stmt).first() is None:
            raise HTTPException(status_code=403, detail="Forbidden")

    t = Ticket(
        title=payload.title,
        description=dump_tiptap(payload.description),
        priority=payload.priority,
        category=payload.category,
        work_type=payload.work_type,
        project_id=project_id,
        requester_id=user.id,
        updated_at=now,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    user_ids: set[int] = {t.requester_id}
    users = build_user_map(session, user_ids)
    project_ids: set[int] = {t.project_id} if t.project_id else set()
    projects = build_project_map(session, project_ids)
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
        if user.role not in ("agent", "admin"):
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if t.requester_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
    user_ids: set[int] = {t.requester_id}
    if t.assignee_id:
        user_ids.add(t.assignee_id)
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
    if t.requester_id != user.id:
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
        "category": t.category,
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

    if "category" in fields:
        if not payload.category:
            raise HTTPException(status_code=422, detail="Category is required")
        t.category = payload.category

    if "work_type" in fields:
        t.work_type = payload.work_type

    if "project_id" in fields:
        if payload.project_id is not None:
            project = session.get(Project, payload.project_id)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            member_stmt = select(ProjectMember).where(
                ProjectMember.project_id == payload.project_id,
                ProjectMember.user_id == user.id,
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
    if "category" in fields and t.category != old["category"]:
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
                "category": old["category"],
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
            actor_id=user.id,
            type="requester_updated",
            from_value=None,
            to_value=None,
            note=json.dumps(note_payload, ensure_ascii=False),
        )
        session.add(ev)

    session.commit()
    session.refresh(t)
    user_ids: set[int] = {t.requester_id}
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
    if t.requester_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if t.status != "open":
        raise HTTPException(status_code=422, detail="Only open tickets can be deleted")
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
        actor_id=user.id,
        type="status_changed",
        from_value=old,
        to_value=new,
        note=payload.note,
    )
    session.add(ev)

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

    if "assignee_id" not in payload:
        raise HTTPException(status_code=422, detail="assignee_id is required")
    assignee_id = payload.get("assignee_id")

    old = ticket.assignee_id
    if old == assignee_id:
        return {"ok": True, "from": old, "to": assignee_id}

    assignee = None
    if assignee_id is not None:
        assignee = session.get(User, assignee_id)
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee user not found")
        if assignee.role not in ("agent", "admin"):
            raise HTTPException(status_code=422, detail="Assignee must be staff (agent/admin)")

    old_user = session.get(User, old) if old is not None else None

    def format_user(u: User | None) -> str:
        if not u:
            return "미배정"
        parts = [u.name, u.title, u.department]
        label = " / ".join([p for p in parts if p])
        return label or (u.employee_no or f"#{u.id}")

    note = f"{format_user(old_user)} -> {format_user(assignee)}"
    ev_type = "assignee_assigned" if old is None and assignee_id is not None else "assignee_changed"

    ticket.assignee_id = assignee_id
    ticket.updated_at = datetime.utcnow()

    ev = TicketEvent(
        ticket_id=ticket_id,
        actor_id=user.id,
        type=ev_type,
        from_value=str(old) if old is not None else None,
        to_value=str(assignee_id) if assignee_id is not None else None,
        note=note,
    )
    session.add(ev)
    session.commit()

    return {"ok": True, "from": old, "to": assignee_id}


ALLOWED_STATUS = {"open", "in_progress", "resolved", "closed"}
ALLOWED_PRIORITY = {"low", "medium", "high", "urgent"}


@router.get("", response_model=list[TicketOut])
def list_tickets(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    scope: str = Query(default="mine"),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    category: str | None = Query(default=None),
    assignee_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Ticket)

    if scope == "all":
        if user.role not in ("agent", "admin"):
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        stmt = stmt.where(Ticket.requester_id == user.id)
        if user.role not in ("requester", "agent", "admin"):
            raise HTTPException(status_code=403, detail="Forbidden")

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

    stmt = stmt.order_by(desc(Ticket.id)).limit(limit).offset(offset)

    tickets = list(session.scalars(stmt).all())
    user_ids: set[int] = set()
    for t in tickets:
        user_ids.add(t.requester_id)
        if t.assignee_id:
            user_ids.add(t.assignee_id)
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

    is_staff = user.role in ("agent", "admin")
    if scope == "all":
        if not is_staff:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if ticket.requester_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")

    comments_stmt = select(TicketComment).where(TicketComment.ticket_id == ticket_id)
    if not is_staff or scope != "all":
        comments_stmt = comments_stmt.where(TicketComment.is_internal == False)
    comments = list(session.scalars(comments_stmt.order_by(TicketComment.id.asc())).all())

    events_stmt = (
        select(TicketEvent)
        .where(TicketEvent.ticket_id == ticket_id)
        .order_by(desc(TicketEvent.created_at), desc(TicketEvent.id))
    )
    events = list(session.scalars(events_stmt).all())

    att_stmt = select(Attachment).where(Attachment.ticket_id == ticket_id).order_by(Attachment.id.asc())
    if not is_staff or scope != "all":
        att_stmt = att_stmt.where(Attachment.is_internal == False)
    attachments = (
        session.query(Attachment)
        .filter(Attachment.ticket_id == ticket_id)
        .order_by(Attachment.id.desc())
        .all()
    )

    user_ids: set[int] = {ticket.requester_id}
    if ticket.assignee_id:
        user_ids.add(ticket.assignee_id)
    for c in comments:
        user_ids.add(c.author_id)
    project_ids: set[int] = {ticket.project_id} if ticket.project_id else set()
    users = build_user_map(session, user_ids)
    projects = build_project_map(session, project_ids)

    comment_payload = [
        {
            "id": c.id,
            "ticket_id": c.ticket_id,
            "author_id": c.author_id,
            "author": users.get(c.author_id),
            "body": c.body,
            "is_internal": c.is_internal,
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
        if ticket.requester_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if payload.is_internal:
            raise HTTPException(status_code=403, detail="requester cannot upload internal attachment")
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
    ticket.updated_at = datetime.utcnow()
    session.commit()
    session.refresh(a)
    return {"ok": True, "id": a.id}
