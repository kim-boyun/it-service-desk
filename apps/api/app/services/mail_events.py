from __future__ import annotations

from ..models.ticket import Ticket
from ..models.user import User
from ..models.comment import TicketComment
from .mail_notifications import MailTarget, enqueue_ticket_mail, enqueue_comment_mail


def _requester_target(user: User) -> MailTarget:
    return MailTarget(emp_no=user.emp_no, email=user.email)


def _admin_target(user: User) -> MailTarget:
    return MailTarget(emp_no=user.emp_no, email=user.email)


def notify_requester_ticket_created(ticket: Ticket, requester: User) -> None:
    subject = f"[요청 접수] {ticket.title}"
    body = (
        f"요청이 정상적으로 접수되었습니다.\n"
        f"요청 제목: {ticket.title}\n"
        f"현재 상태: {ticket.status}"
    )
    enqueue_ticket_mail(
        event_key=f"ticket_created:requester:{ticket.id}:{requester.emp_no}",
        event_type="ticket_created",
        ticket=ticket,
        recipient=_requester_target(requester),
        subject=subject,
        body=body,
        is_admin_link=False,
    )


def notify_admins_ticket_created(ticket: Ticket, admins: list[User]) -> None:
    for admin in admins:
        subject = f"[신규 요청] {ticket.title}"
        body = (
            "신규 요청이 접수되었습니다.\n"
            f"요청 제목: {ticket.title}\n"
            f"요청자: {ticket.requester_emp_no}"
        )
        enqueue_ticket_mail(
            event_key=f"ticket_created:admin:{ticket.id}:{admin.emp_no}",
            event_type="ticket_created_admin",
            ticket=ticket,
            recipient=_admin_target(admin),
            subject=subject,
            body=body,
            is_admin_link=True,
        )


def notify_requester_assignee_changed(ticket: Ticket, requester: User, assignee: User | None) -> None:
    subject = f"[담당자 변경] {ticket.title}"
    assignee_label = assignee.kor_name if assignee else "미배정"
    body = f"담당자가 변경되었습니다.\n요청 제목: {ticket.title}\n담당자: {assignee_label}"
    enqueue_ticket_mail(
        event_key=f"assignee_changed:requester:{ticket.id}:{requester.emp_no}:{assignee.emp_no if assignee else 'none'}",
        event_type="assignee_changed",
        ticket=ticket,
        recipient=_requester_target(requester),
        subject=subject,
        body=body,
        is_admin_link=False,
    )


def notify_admin_assigned(ticket: Ticket, assignee: User) -> None:
    subject = f"[담당자 배정] {ticket.title}"
    body = f"요청이 담당자에게 배정되었습니다.\n요청 제목: {ticket.title}"
    enqueue_ticket_mail(
        event_key=f"assignee_assigned:admin:{ticket.id}:{assignee.emp_no}",
        event_type="assignee_assigned",
        ticket=ticket,
        recipient=_admin_target(assignee),
        subject=subject,
        body=body,
        is_admin_link=True,
    )


def notify_requester_status_changed(ticket: Ticket, requester: User, new_status: str) -> None:
    subject = f"[상태 변경] {ticket.title}"
    body = f"요청 상태가 변경되었습니다.\n요청 제목: {ticket.title}\n변경된 상태: {new_status}"
    enqueue_ticket_mail(
        event_key=f"status_changed:requester:{ticket.id}:{requester.emp_no}:{new_status}",
        event_type="status_changed",
        ticket=ticket,
        recipient=_requester_target(requester),
        subject=subject,
        body=body,
        is_admin_link=False,
    )


def notify_requester_commented(ticket: Ticket, comment: TicketComment, admins: list[User]) -> None:
    for admin in admins:
        subject = f"[요청자 댓글] {ticket.title}"
        body = f"요청자가 댓글을 등록했습니다.\n요청 제목: {ticket.title}\n댓글 제목: {comment.title or '-'}"
        enqueue_comment_mail(
            event_key=f"comment_requester:admin:{ticket.id}:{comment.id}:{admin.emp_no}",
            event_type="comment_requester",
            ticket=ticket,
            comment=comment,
            recipient=_admin_target(admin),
            subject=subject,
            body=body,
            is_admin_link=True,
        )


def notify_admin_commented(ticket: Ticket, comment: TicketComment, requester: User) -> None:
    subject = f"[관리자 댓글] {ticket.title}"
    body = f"담당자가 댓글을 등록했습니다.\n요청 제목: {ticket.title}\n댓글 제목: {comment.title or '-'}"
    enqueue_comment_mail(
        event_key=f"comment_admin:requester:{ticket.id}:{comment.id}:{requester.emp_no}",
        event_type="comment_admin",
        ticket=ticket,
        comment=comment,
        recipient=_requester_target(requester),
        subject=subject,
        body=body,
        is_admin_link=False,
    )
