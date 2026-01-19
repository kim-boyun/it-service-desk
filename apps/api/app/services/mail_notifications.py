from __future__ import annotations

from dataclasses import dataclass

from ..core.config import settings
from ..models.ticket import Ticket
from ..models.user import User
from ..models.comment import TicketComment
from .mail_service import MailPayload, enqueue_mail


@dataclass
class MailTarget:
    emp_no: str | None
    email: str | None


def _ticket_link(ticket_id: int, is_admin: bool) -> str:
    base = settings.app_base_url.rstrip("/")
    if is_admin:
        return f"{base}/admin/tickets/{ticket_id}"
    return f"{base}/tickets/{ticket_id}"


def _wrap_template(title: str, body: str, link_url: str, link_label: str) -> tuple[str, str]:
    text = (
        f"{title}\n\n"
        f"{body}\n\n"
        f"{link_label}: {link_url}\n\n"
        "본 메일은 시스템 알림용으로 발송되었습니다."
    )
    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin: 0 0 12px 0;">{title}</h2>
      <p style="margin: 0 0 16px 0; white-space: pre-line;">{body}</p>
      <p style="margin: 0 0 16px 0;">
        <a href="{link_url}" style="color: #1d4ed8; font-weight: 600;">{link_label}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <p style="margin: 0; font-size: 12px; color: #6b7280;">본 메일은 시스템 알림용으로 발송되었습니다.</p>
    </div>
    """
    return text, html


def enqueue_ticket_mail(
    *,
    event_key: str,
    event_type: str,
    ticket: Ticket,
    recipient: MailTarget,
    subject: str,
    body: str,
    is_admin_link: bool,
) -> None:
    if not recipient.email:
        return
    link = _ticket_link(ticket.id, is_admin_link)
    text, html = _wrap_template(subject, body, link, "요청 보기")
    enqueue_mail(
        MailPayload(
            event_key=event_key,
            event_type=event_type,
            ticket_id=ticket.id,
            recipient_emp_no=recipient.emp_no,
            recipient_email=recipient.email,
            subject=subject,
            body_text=text,
            body_html=html,
        )
    )


def enqueue_comment_mail(
    *,
    event_key: str,
    event_type: str,
    ticket: Ticket,
    comment: TicketComment,
    recipient: MailTarget,
    subject: str,
    body: str,
    is_admin_link: bool,
) -> None:
    if not recipient.email:
        return
    link = _ticket_link(ticket.id, is_admin_link)
    text, html = _wrap_template(subject, body, link, "댓글 보기")
    enqueue_mail(
        MailPayload(
            event_key=event_key,
            event_type=event_type,
            ticket_id=ticket.id,
            recipient_emp_no=recipient.emp_no,
            recipient_email=recipient.email,
            subject=subject,
            body_text=text,
            body_html=html,
        )
    )
