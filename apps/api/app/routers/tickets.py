from datetime import datetime
import logging
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from ..db import get_session
from ..models.ticket import Ticket, TicketAssignee, TicketCategoryLink
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
from ..core.tiptap import dump_tiptap, load_tiptap, is_empty_doc, extract_image_sources, rewrite_image_sources
from ..core.settings import settings
from ..core.storage import delete_object, extract_key_from_url, move_object
from ..core.storage_keys import ticket_editor_key_from_src_key
from ..services.assignment_service import get_category_admins
from ..services.mail_events import (
    notify_admins_ticket_created,
    notify_requester_status_changed,
    notify_requester_ticket_created,
)

router = APIRouter(prefix="/tickets", tags=["tickets"])

def is_object_storage() -> bool:
    return settings.STORAGE_BACKEND == "object"

def local_path_for_key(key: str) -> Path:
    # 기존 uploads/ 프리픽스 호환 + 신규 tickets/notices/... 키 지원
    rel = key.replace("uploads/", "", 1) if key.startswith("uploads/") else key
    return Path(settings.LOCAL_UPLOAD_ROOT) / rel

def move_storage_key(src_key: str, dest_key: str) -> None:
    if src_key == dest_key:
        return
    if is_object_storage():
        move_object(src_key=src_key, dest_key=dest_key)
        return
    src = local_path_for_key(src_key)
    dest = local_path_for_key(dest_key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.exists():
        src.replace(dest)

def rewrite_src_keep_base(src: str, dest_key: str) -> str:
    if src.startswith("/uploads/"):
        return "/uploads/" + dest_key
    if "/uploads/" in src:
        head, _, _ = src.partition("/uploads/")
        return head + "/uploads/" + dest_key
    return "/uploads/" + dest_key

def finalize_ticket_editor_images(doc: dict, *, ticket: Ticket) -> dict:
    """
    RichTextEditor가 임시로 업로드한 editor/... 이미지를
    tickets/YYYY/MM/DD/{ticketId}/editor/... 로 이동하고, 문서 src를 새 경로로 교체한다.
    """
    moved: set[str] = set()

    def _rewrite(src: str) -> str | None:
        key = extract_key_from_url(src)
        if not key:
            return None
        # 이미 최종 경로면 그대로
        if key.startswith("tickets/") or key.startswith("notices/"):
            return None
        if not key.startswith("editor/"):
            return None
        dest_key = ticket_editor_key_from_src_key(
            ticket_id=ticket.id,
            ticket_created_at=ticket.created_at,
            src_key=key,
        )
        if key not in moved:
            move_storage_key(key, dest_key)
            moved.add(key)
        return rewrite_src_keep_base(src, dest_key)

    return rewrite_image_sources(doc, rewrite_src=_rewrite)


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

def load_ticket_category_map(session: Session, ticket_ids: list[int]) -> dict[int, list[int]]:
    if not ticket_ids:
        return {}
    stmt = select(TicketCategoryLink).where(TicketCategoryLink.ticket_id.in_(ticket_ids))
    rows = session.scalars(stmt).all()
    category_map: dict[int, list[int]] = {}
    for row in rows:
        category_map.setdefault(row.ticket_id, []).append(row.category_id)
    return category_map

def load_ticket_assignee_map(session: Session, ticket_ids: list[int]) -> dict[int, list[str]]:
    if not ticket_ids:
        return {}
    stmt = select(TicketAssignee).where(TicketAssignee.ticket_id.in_(ticket_ids))
    rows = session.scalars(stmt).all()
    assignee_map: dict[int, list[str]] = {}
    for row in rows:
        assignee_map.setdefault(row.ticket_id, []).append(row.emp_no)
    return assignee_map

def get_category_label(session: Session, category_id: int | None) -> str:
    if not category_id:
        return "-"
    category = session.get(TicketCategory, category_id)
    if not category:
        return str(category_id)
    return category.name or str(category_id)


def serialize_ticket(
    t: Ticket,
    users: dict[str, User],
    projects: dict[int, Project] | None = None,
    category_map: dict[int, list[int]] | None = None,
    assignee_map: dict[int, list[str]] | None = None,
) -> dict:
    project = projects.get(t.project_id) if projects and t.project_id else None
    category_ids = []
    if category_map and t.id in category_map:
        category_ids = category_map[t.id]
    elif t.category_id:
        category_ids = [t.category_id]

    assignee_emp_nos = []
    if assignee_map and t.id in assignee_map:
        assignee_emp_nos = assignee_map[t.id]
    elif t.assignee_emp_no:
        assignee_emp_nos = [t.assignee_emp_no]

    assignees = [users.get(emp_no) for emp_no in assignee_emp_nos if emp_no in users]
    # 요청 시점 스냅샷이 있으면 그대로 사용(인사 이동과 무관), 없으면 현재 사용자 정보로 폴백
    requester = users.get(t.requester_emp_no)
    if (
        getattr(t, "requester_kor_name", None) is not None
        or getattr(t, "requester_title", None) is not None
        or getattr(t, "requester_department", None) is not None
    ):
        requester = {
            "emp_no": t.requester_emp_no,
            "kor_name": getattr(t, "requester_kor_name", None),
            "title": getattr(t, "requester_title", None),
            "department": getattr(t, "requester_department", None),
        }
    return {
        "id": t.id,
        "title": t.title,
        "description": load_tiptap(t.description),
        "status": t.status,
        "priority": t.priority,
        "category_id": t.category_id,
        "category_ids": category_ids,
        "work_type": t.work_type,
        "project_id": t.project_id,
        "project_name": project.name if project else None,
        "requester_emp_no": t.requester_emp_no,
        "assignee_emp_no": t.assignee_emp_no,
        "assignee_emp_nos": assignee_emp_nos,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "requester": requester,
        "assignee": users.get(t.assignee_emp_no) if t.assignee_emp_no else None,
        "assignees": assignees,
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

    category_ids = payload.category_ids or []
    if not category_ids and payload.category_id is not None:
        category_ids = [payload.category_id]
    category_ids = list(dict.fromkeys(category_ids))
    if not category_ids:
        raise HTTPException(status_code=422, detail="Category is required")
    categories = session.scalars(select(TicketCategory).where(TicketCategory.id.in_(category_ids))).all()
    if len(categories) != len(category_ids):
        raise HTTPException(status_code=404, detail="Category not found")

    t = Ticket(
        title=payload.title,
        description=dump_tiptap(payload.description),
        priority=payload.priority,
        category_id=category_ids[0],
        work_type=payload.work_type,
        project_id=project_id,
        requester_emp_no=user.emp_no,
        requester_kor_name=user.kor_name,
        requester_title=user.title,
        requester_department=user.department,
        updated_at=now,
    )
    session.add(t)
    session.flush()
    # editor 이미지 최종 경로로 이동 + 문서 src 치환
    try:
        next_doc = finalize_ticket_editor_images(payload.description, ticket=t)
        t.description = dump_tiptap(next_doc)
    except Exception:
        logging.getLogger(__name__).exception("failed to finalize ticket editor images (ticket_id=%s)", t.id)
    for category_id in category_ids:
        session.add(TicketCategoryLink(ticket_id=t.id, category_id=category_id))
    # 카테고리에 지정된 담당자를 해당 요청의 담당자로 자동 배정
    assignee_emp_nos: list[str] = []
    seen: set[str] = set()
    for cid in category_ids:
        for admin_user in get_category_admins(session, cid):
            if admin_user.emp_no not in seen:
                seen.add(admin_user.emp_no)
                assignee_emp_nos.append(admin_user.emp_no)
    for emp_no in assignee_emp_nos:
        session.add(TicketAssignee(ticket_id=t.id, emp_no=emp_no))
    if assignee_emp_nos:
        t.assignee_emp_no = assignee_emp_nos[0]
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
    user_ids.update(assignee_emp_nos)
    users = build_user_map(session, user_ids)
    project_ids: set[int] = {t.project_id} if t.project_id else set()
    projects = build_project_map(session, project_ids)
    assignee_map = {t.id: assignee_emp_nos} if assignee_emp_nos else {}

    try:
        category_label = categories[0].name
        notify_requester_ticket_created(t, user, category_label=category_label)
        if t.category_id:
            admins = get_category_admins(session, t.category_id)
            notify_admins_ticket_created(t, user, admins, category_label=category_label)
    except Exception:
        logger = logging.getLogger(__name__)
        logger.exception("티켓 접수 메일 발송 처리 실패 (ticket_id=%s)", t.id)

    return serialize_ticket(t, users, projects, {t.id: category_ids}, assignee_map)


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
    category_map = load_ticket_category_map(session, [t.id])
    assignee_map = load_ticket_assignee_map(session, [t.id])
    user_ids: set[str] = {t.requester_emp_no}
    if t.assignee_emp_no:
        user_ids.add(t.assignee_emp_no)
    for emp_no in assignee_map.get(t.id, []):
        user_ids.add(emp_no)
    users = build_user_map(session, user_ids)
    project_ids: set[int] = {t.project_id} if t.project_id else set()
    projects = build_project_map(session, project_ids)
    return serialize_ticket(t, users, projects, category_map, assignee_map)


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
    old_category_ids = [
        row.category_id
        for row in session.scalars(
            select(TicketCategoryLink).where(TicketCategoryLink.ticket_id == ticket_id)
        ).all()
    ]
    if not old_category_ids and t.category_id:
        old_category_ids = [t.category_id]
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
        try:
            next_doc = finalize_ticket_editor_images(payload.description, ticket=t)
            t.description = dump_tiptap(next_doc)
        except Exception:
            logging.getLogger(__name__).exception("failed to finalize ticket editor images (ticket_id=%s)", t.id)
            t.description = dump_tiptap(payload.description)

    if "priority" in fields:
        if payload.priority not in ALLOWED_PRIORITY:
            raise HTTPException(status_code=422, detail=f"Invalid priority: {payload.priority}")
        t.priority = payload.priority

    if "category_ids" in fields or "category_id" in fields:
        next_category_ids = payload.category_ids or []
        if not next_category_ids and payload.category_id is not None:
            next_category_ids = [payload.category_id]
        next_category_ids = list(dict.fromkeys(next_category_ids))
        if not next_category_ids:
            raise HTTPException(status_code=422, detail="Category is required")
        categories = session.scalars(select(TicketCategory).where(TicketCategory.id.in_(next_category_ids))).all()
        if len(categories) != len(next_category_ids):
            raise HTTPException(status_code=404, detail="Category not found")
        session.query(TicketCategoryLink).filter(TicketCategoryLink.ticket_id == ticket_id).delete()
        for category_id in next_category_ids:
            session.add(TicketCategoryLink(ticket_id=ticket_id, category_id=category_id))
        t.category_id = next_category_ids[0]

    if "work_type" in fields:
        t.work_type = payload.work_type

    if "project_id" in fields:
        if payload.project_id is not None:
            project = session.get(Project, payload.project_id)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
        t.project_id = payload.project_id

    t.updated_at = datetime.utcnow()

    changed_fields: list[str] = []
    if "title" in fields and t.title != old["title"]:
        changed_fields.append("제목")
    if "description" in fields and t.description != old_description_raw:
        changed_fields.append("내용")
    if "priority" in fields and t.priority != old["priority"]:
        changed_fields.append("우선순위")
    if ("category_ids" in fields or "category_id" in fields) and t.category_id != old["category_id"]:
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
                "category_ids": old_category_ids,
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
    category_map = load_ticket_category_map(session, [t.id])
    assignee_map = load_ticket_assignee_map(session, [t.id])
    user_ids: set[str] = {t.requester_emp_no}
    for emp_no in assignee_map.get(t.id, []):
        user_ids.add(emp_no)
    users = build_user_map(session, user_ids)
    project_ids: set[int] = {t.project_id} if t.project_id else set()
    projects = build_project_map(session, project_ids)
    return serialize_ticket(t, users, projects, category_map, assignee_map)


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
    keys = set()
    for src in extract_image_sources(t.description):
        key = extract_key_from_url(src)
        if key:
            keys.add(key)
    for att in attachments:
        keys.add(att.key)
    if keys:
        if settings.STORAGE_BACKEND == "object":
            for key in keys:
                try:
                    delete_object(key=key)
                except Exception:
                    logging.getLogger(__name__).exception(
                        "delete: failed to delete object storage file key=%s ticket_id=%s",
                        key,
                        ticket_id,
                    )
        else:
            for key in keys:
                path = local_path_for_key(key)
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
    keys = set()
    for src in extract_image_sources(t.description):
        key = extract_key_from_url(src)
        if key:
            keys.add(key)
    for att in attachments:
        keys.add(att.key)
    if keys:
        if settings.STORAGE_BACKEND == "object":
            for key in keys:
                try:
                    delete_object(key=key)
                except Exception:
                    raise HTTPException(status_code=500, detail="Failed to delete object storage file")
        else:
            for key in keys:
                path = local_path_for_key(key)
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

    # Only create event if status actually changed
    if old == new:
        return {"ok": True, "from": old, "to": new}

    if not can_transition(old, new):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid transition: {old} -> {new}",
        )

    ticket.status = new
    ticket.updated_at = datetime.utcnow()

    # Map status to Korean labels
    status_labels = {
        "open": "대기",
        "in_progress": "진행",
        "resolved": "완료",
        "closed": "사업 검토",
    }
    old_label = status_labels.get(old, old)
    new_label = status_labels.get(new, new)
    note = f"{old_label} -> {new_label}"

    ev = TicketEvent(
        ticket_id=ticket_id,
        actor_emp_no=user.emp_no,
        type="status_changed",
        from_value=old,
        to_value=new,
        note=note,
    )
    session.add(ev)

    session.commit()

    if new in ("resolved", "closed", "in_progress"):
        try:
            requester = session.get(User, ticket.requester_emp_no)
            if requester:
                category_label = get_category_label(session, ticket.category_id)
                notify_requester_status_changed(ticket, requester, new, category_label=category_label)
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
    session.query(TicketAssignee).filter(TicketAssignee.ticket_id == ticket_id).delete()
    if assignee_emp_no is not None:
        session.add(TicketAssignee(ticket_id=ticket_id, emp_no=assignee_emp_no))

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

    return {"ok": True, "from": old, "to": assignee_emp_no}


@router.patch("/{ticket_id}/assignees")
def update_assignees(
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

    assignee_emp_nos = payload.get("assignee_emp_nos") or []
    if not isinstance(assignee_emp_nos, list):
        raise HTTPException(status_code=422, detail="assignee_emp_nos must be a list")

    assignee_emp_nos = list(dict.fromkeys([v for v in assignee_emp_nos if v]))
    if assignee_emp_nos:
        users = session.scalars(select(User).where(User.emp_no.in_(assignee_emp_nos))).all()
        if len(users) != len(assignee_emp_nos):
            raise HTTPException(status_code=404, detail="Assignee user not found")
        for u in users:
            if u.role != "admin":
                raise HTTPException(status_code=422, detail="Assignee must be admin")

    # Get old assignees
    old_assignees_rows = session.scalars(
        select(TicketAssignee).where(TicketAssignee.ticket_id == ticket_id)
    ).all()
    old_emp_nos = sorted([row.emp_no for row in old_assignees_rows])
    new_emp_nos = sorted(assignee_emp_nos)

    # Only create event if actually changed
    if old_emp_nos != new_emp_nos:
        def format_user_list(emp_nos: list[str]) -> str:
            if not emp_nos:
                return "미배정"
            users = session.scalars(select(User).where(User.emp_no.in_(emp_nos))).all()
            user_map = {u.emp_no: u for u in users}
            names = []
            for emp_no in emp_nos:
                u = user_map.get(emp_no)
                if u:
                    parts = [u.kor_name, u.title, u.department]
                    label = " / ".join([p for p in parts if p])
                    names.append(label or emp_no)
                else:
                    names.append(emp_no)
            return ", ".join(names)

        note = f"{format_user_list(old_emp_nos)} -> {format_user_list(new_emp_nos)}"
        ev_type = "assignee_assigned" if not old_emp_nos and assignee_emp_nos else "assignee_changed"

        ev = TicketEvent(
            ticket_id=ticket_id,
            actor_emp_no=user.emp_no,
            type=ev_type,
            from_value=",".join(old_emp_nos) if old_emp_nos else None,
            to_value=",".join(new_emp_nos) if new_emp_nos else None,
            note=note,
        )
        session.add(ev)

    session.query(TicketAssignee).filter(TicketAssignee.ticket_id == ticket_id).delete()
    for emp_no in assignee_emp_nos:
        session.add(TicketAssignee(ticket_id=ticket_id, emp_no=emp_no))
    ticket.assignee_emp_no = assignee_emp_nos[0] if assignee_emp_nos else None
    ticket.updated_at = datetime.utcnow()
    session.commit()

    return {"ok": True}


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

    has_changes = False

    # Update category without creating event
    if payload.category_ids is not None or payload.category_id is not None:
        next_category_ids = payload.category_ids or []
        if not next_category_ids and payload.category_id is not None:
            next_category_ids = [payload.category_id]
        next_category_ids = list(dict.fromkeys(next_category_ids))
        if not next_category_ids:
            raise HTTPException(status_code=422, detail="Category is required")
        categories = session.scalars(select(TicketCategory).where(TicketCategory.id.in_(next_category_ids))).all()
        if len(categories) != len(next_category_ids):
            raise HTTPException(status_code=404, detail="Category not found")

        old_category_id = ticket.category_id
        session.query(TicketCategoryLink).filter(TicketCategoryLink.ticket_id == ticket_id).delete()
        for category_id in next_category_ids:
            session.add(TicketCategoryLink(ticket_id=ticket_id, category_id=category_id))
        ticket.category_id = next_category_ids[0]
        if old_category_id != next_category_ids[0]:
            has_changes = True

    # Update work_type without creating event
    if payload.work_type is not None and payload.work_type != ticket.work_type:
        ticket.work_type = payload.work_type
        has_changes = True

    if has_changes:
        ticket.updated_at = datetime.utcnow()
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
        stmt = stmt.join(TicketCategoryLink, TicketCategoryLink.ticket_id == Ticket.id).where(
            TicketCategoryLink.category_id == category_id
        )

    if assignee_emp_no is not None:
        stmt = stmt.join(TicketAssignee, TicketAssignee.ticket_id == Ticket.id).where(
            TicketAssignee.emp_no == assignee_emp_no
        )

    stmt = stmt.order_by(desc(Ticket.id)).limit(limit).offset(offset)

    tickets = list(session.scalars(stmt).all())
    ticket_ids = [t.id for t in tickets]
    category_map = load_ticket_category_map(session, ticket_ids)
    assignee_map = load_ticket_assignee_map(session, ticket_ids)
    user_ids: set[str] = set()
    for t in tickets:
        user_ids.add(t.requester_emp_no)
        if t.assignee_emp_no:
            user_ids.add(t.assignee_emp_no)
        for emp_no in assignee_map.get(t.id, []):
            user_ids.add(emp_no)
    project_ids: set[int] = {t.project_id for t in tickets if t.project_id}
    users = build_user_map(session, user_ids)
    projects = build_project_map(session, project_ids)
    return [serialize_ticket(t, users, projects, category_map, assignee_map) for t in tickets]


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
    assignee_map = load_ticket_assignee_map(session, [ticket.id])
    for emp_no in assignee_map.get(ticket.id, []):
        user_ids.add(emp_no)
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

    category_map = load_ticket_category_map(session, [ticket.id])
    return {
        "ticket": serialize_ticket(ticket, users, projects, category_map, assignee_map),
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
