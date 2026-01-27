from datetime import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db import get_session
from ..models.ticket import Ticket
from ..models.comment import TicketComment
from ..schemas.comment import CommentCreateIn, CommentOut
from ..core.current_user import get_current_user
from ..core.tiptap import dump_tiptap, is_empty_doc, load_tiptap
from ..models.user import User
from ..models.ticket_category import TicketCategory
from ..services.assignment_service import get_category_admins
from ..services.mail_events import notify_admin_commented, notify_requester_commented

router = APIRouter(tags=["comments"])

def is_staff(user: User) -> bool:
    return user.role == "admin"

def get_ticket_or_404(session: Session, ticket_id: int) -> Ticket:
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return t

def assert_access(user: User, ticket: Ticket):
    if is_staff(user):
        return
    if ticket.requester_emp_no != user.emp_no:
        raise HTTPException(status_code=403, detail="Forbidden")

def get_category_label(session: Session, category_id: int | None) -> str:
    if not category_id:
        return "-"
    category = session.get(TicketCategory, category_id)
    if not category:
        return str(category_id)
    return category.name or str(category_id)

@router.get("/tickets/{ticket_id}/comments", response_model=list[CommentOut])
def list_comments(
    ticket_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    ticket = get_ticket_or_404(session, ticket_id)
    assert_access(user, ticket)

    stmt = select(TicketComment).where(
        TicketComment.ticket_id == ticket_id
    ).order_by(TicketComment.id.asc())

    items = []
    for comment in session.scalars(stmt).all():
        items.append(
            CommentOut(
                id=comment.id,
                ticket_id=comment.ticket_id,
                author_emp_no=comment.author_emp_no,
                author=None,
                title=comment.title or "",
                body=load_tiptap(comment.body),
                created_at=comment.created_at,
            )
        )
    return items

@router.post("/tickets/{ticket_id}/comments", response_model=CommentOut)
def create_comment(
    ticket_id: int,
    payload: CommentCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    ticket = get_ticket_or_404(session, ticket_id)
    assert_access(user, ticket)

    body_doc = payload.body
    if isinstance(body_doc, str):
        body_doc = load_tiptap(body_doc)

    if is_empty_doc(body_doc):
        raise HTTPException(status_code=400, detail="Comment body is required")

    comment = TicketComment(
        ticket_id=ticket_id,
        author_emp_no=user.emp_no,
        title=payload.title.strip(),
        body=dump_tiptap(body_doc),
    )

    session.add(comment)
    # 업데이트 시각 갱신
    ticket.updated_at = datetime.utcnow()
    session.commit()
    session.refresh(comment)

    # notify_email이 True일 때만 메일 발송
    if payload.notify_email:
        try:
            requester = session.get(User, ticket.requester_emp_no)
            if requester:
                category_label = get_category_label(session, ticket.category_id)
                if user.emp_no == ticket.requester_emp_no:
                    admins: list[User] = []
                    if ticket.assignee_emp_no:
                        assignee = session.get(User, ticket.assignee_emp_no)
                        if assignee and assignee.role == "admin":
                            admins = [assignee]
                    if not admins and ticket.category_id:
                        admins = get_category_admins(session, ticket.category_id)
                    notify_requester_commented(
                        ticket,
                        comment,
                        requester,
                        admins,
                        category_label=category_label,
                    )
                else:
                    notify_admin_commented(
                        ticket,
                        comment,
                        requester,
                        user,
                        category_label=category_label,
                    )
        except Exception:
            logger = logging.getLogger(__name__)
            logger.exception("댓글 메일 발송 처리 실패 (comment_id=%s)", comment.id)

    return CommentOut(
        id=comment.id,
        ticket_id=comment.ticket_id,
        author_emp_no=comment.author_emp_no,
        author=None,
        title=comment.title or "",
        body=load_tiptap(comment.body),
        created_at=comment.created_at,
    )
