from __future__ import annotations

from ..models.ticket import Ticket
from ..models.user import User
from ..models.comment import TicketComment
from .mail_notifications import MailTarget, enqueue_ticket_mail, enqueue_comment_mail


STATUS_LABELS = {
    "open": "접수",
    "in_progress": "진행",
    "resolved": "완료",
    "closed": "사업 검토",
}

PRIORITY_LABELS = {
    "low": "낮음",
    "medium": "보통",
    "high": "높음",
    "urgent": "긴급",
}

WORK_TYPE_LABELS = {
    "incident": "장애",
    "request": "요청",
    "change": "변경",
    "other": "기타",
    "maintenance": "기타",
    "project": "기타",
}

def _requester_target(user: User) -> MailTarget:
    return MailTarget(emp_no=user.emp_no, email=user.email)


def _admin_target(user: User) -> MailTarget:
    return MailTarget(emp_no=user.emp_no, email=user.email)


def _status_label(status: str | None) -> str:
    if not status:
        return "-"
    s = status.lower()
    if s in ("open", "new", "pending"):
        return STATUS_LABELS["open"]
    if s in ("in_progress", "processing", "assigned", "working", "progress"):
        return STATUS_LABELS["in_progress"]
    if s in ("resolved", "done", "completed"):
        return STATUS_LABELS["resolved"]
    if s in ("closed", "review", "business_review"):
        return STATUS_LABELS["closed"]
    return status


def _priority_label(priority: str | None) -> str:
    if not priority:
        return PRIORITY_LABELS["medium"]
    return PRIORITY_LABELS.get(priority.lower(), PRIORITY_LABELS["medium"])


def _subject_status(status: str | None) -> str:
    label = _status_label(status)
    return label if label and label != "-" else "현재상태"


def _user_label(user: User | None, fallback: str | None = None) -> str:
    if not user:
        return fallback or "-"
    name = user.kor_name or fallback or user.emp_no or "-"
    title = user.title or "-"
    department = user.department or "-"
    return f"{name} / {title} / {department}"


def _assignee_label(assignee: User | None) -> str:
    if not assignee:
        return "미배정"
    return _user_label(assignee, assignee.emp_no)

def _category_value(ticket: Ticket, label_override: str | None = None) -> str:
    if label_override:
        return label_override
    return str(ticket.category_id) if ticket.category_id is not None else "-"


def _work_type_value(ticket: Ticket, label_override: str | None = None) -> str:
    if label_override:
        return label_override
    if not ticket.work_type:
        return "-"
    return WORK_TYPE_LABELS.get(ticket.work_type, ticket.work_type)


def _build_subject(summary: str) -> str:
    return f"[KDIS-DESK] {summary}"


def notify_requester_ticket_created(
    ticket: Ticket,
    requester: User,
    category_label: str | None = None,
    work_type_label: str | None = None,
) -> None:
    status_label = _status_label(ticket.status)
    priority_label = _priority_label(ticket.priority)
    summary = "요청이 접수되었습니다."
    subject = _build_subject(summary)
    fields = [
        ("요청 제목", ticket.title),
        ("카테고리", _category_value(ticket, category_label)),
        ("작업 구분", _work_type_value(ticket, work_type_label)),
        ("요청자", _user_label(requester, requester.emp_no)),
    ]
    enqueue_ticket_mail(
        event_key=f"ticket_created:requester:{ticket.id}:{requester.emp_no}",
        event_type="ticket_created",
        ticket=ticket,
        recipient=_requester_target(requester),
        subject=subject,
        alert_type="신규 요청 접수",
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        is_admin_link=False,
    )


def notify_admins_ticket_created(
    ticket: Ticket,
    requester: User,
    admins: list[User],
    category_label: str | None = None,
    work_type_label: str | None = None,
) -> None:
    requester_label = _user_label(requester, requester.emp_no)
    for admin in admins:
        status_label = _status_label(ticket.status)
        priority_label = _priority_label(ticket.priority)
        summary = "신규 요청이 접수되었습니다."
        subject = _build_subject(summary)
        fields = [
            ("요청 제목", ticket.title),
            ("카테고리", _category_value(ticket, category_label)),
            ("작업 구분", _work_type_value(ticket, work_type_label)),
            ("요청자", requester_label),
        ]
        enqueue_ticket_mail(
            event_key=f"ticket_created:admin:{ticket.id}:{admin.emp_no}",
            event_type="ticket_created_admin",
            ticket=ticket,
            recipient=_admin_target(admin),
            subject=subject,
            alert_type="신규 요청 접수",
            summary=summary,
            fields=fields,
            status_label=status_label,
            priority_label=priority_label,
            is_admin_link=True,
        )


def notify_requester_assignee_changed(
    ticket: Ticket,
    requester: User,
    assignee: User | None,
    category_label: str | None = None,
    work_type_label: str | None = None,
) -> None:
    assignee_label = _assignee_label(assignee)
    status_label = _status_label(ticket.status)
    priority_label = _priority_label(ticket.priority)
    summary = "담당자가 변경되었습니다."
    subject = _build_subject(summary)
    fields = [
        ("요청 제목", ticket.title),
        ("카테고리", _category_value(ticket, category_label)),
        ("작업 구분", _work_type_value(ticket, work_type_label)),
        ("담당자", assignee_label),
        ("요청자", _user_label(requester, requester.emp_no)),
    ]
    enqueue_ticket_mail(
        event_key=f"assignee_changed:requester:{ticket.id}:{requester.emp_no}:{assignee.emp_no if assignee else 'none'}",
        event_type="assignee_changed",
        ticket=ticket,
        recipient=_requester_target(requester),
        subject=subject,
        alert_type="담당자 변경",
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        is_admin_link=False,
    )


def notify_admin_assigned(
    ticket: Ticket,
    assignee: User,
    category_label: str | None = None,
    work_type_label: str | None = None,
) -> None:
    status_label = _status_label(ticket.status)
    priority_label = _priority_label(ticket.priority)
    summary = "요청 담당자로 배정되었습니다."
    subject = _build_subject(summary)
    fields = [
        ("요청 제목", ticket.title),
        ("카테고리", _category_value(ticket, category_label)),
        ("작업 구분", _work_type_value(ticket, work_type_label)),
        ("담당자", _assignee_label(assignee)),
    ]
    enqueue_ticket_mail(
        event_key=f"assignee_assigned:admin:{ticket.id}:{assignee.emp_no}",
        event_type="assignee_assigned",
        ticket=ticket,
        recipient=_admin_target(assignee),
        subject=subject,
        alert_type="담당자 배정",
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        is_admin_link=True,
    )


def notify_requester_status_changed(
    ticket: Ticket,
    requester: User,
    new_status: str,
    category_label: str | None = None,
    work_type_label: str | None = None,
) -> None:
    status_label = _status_label(new_status)
    priority_label = _priority_label(ticket.priority)
    summary = "요청 상태가 변경되었습니다."
    subject = _build_subject(summary)
    fields = [
        ("요청 제목", ticket.title),
        ("카테고리", _category_value(ticket, category_label)),
        ("작업 구분", _work_type_value(ticket, work_type_label)),
        ("변경된 상태", status_label),
    ]
    enqueue_ticket_mail(
        event_key=f"status_changed:requester:{ticket.id}:{requester.emp_no}:{new_status}",
        event_type="status_changed",
        ticket=ticket,
        recipient=_requester_target(requester),
        subject=subject,
        alert_type="상태 변경",
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        is_admin_link=False,
    )


def notify_requester_commented(
    ticket: Ticket,
    comment: TicketComment,
    requester: User,
    admins: list[User],
    category_label: str | None = None,
    work_type_label: str | None = None,
) -> None:
    requester_label = _user_label(requester, requester.emp_no)
    for admin in admins:
        status_label = _status_label(ticket.status)
        priority_label = _priority_label(ticket.priority)
        summary = "요청에 댓글이 등록되었습니다."
        subject = _build_subject(summary)
        fields = [
            ("요청 제목", ticket.title),
            ("카테고리", _category_value(ticket, category_label)),
            ("작업 구분", _work_type_value(ticket, work_type_label)),
            ("요청자", requester_label),
            ("댓글 제목", comment.title or "-"),
        ]
        enqueue_comment_mail(
            event_key=f"comment_requester:admin:{ticket.id}:{comment.id}:{admin.emp_no}",
            event_type="comment_requester",
            ticket=ticket,
            comment=comment,
            recipient=_admin_target(admin),
            subject=subject,
            alert_type="요청자 댓글",
            summary=summary,
            fields=fields,
            status_label=status_label,
            priority_label=priority_label,
            is_admin_link=True,
        )


def notify_admin_commented(
    ticket: Ticket,
    comment: TicketComment,
    requester: User,
    author: User,
    category_label: str | None = None,
    work_type_label: str | None = None,
) -> None:
    status_label = _status_label(ticket.status)
    priority_label = _priority_label(ticket.priority)
    summary = "담당자가 댓글을 등록했습니다."
    subject = _build_subject(summary)
    fields = [
        ("요청 제목", ticket.title),
        ("카테고리", _category_value(ticket, category_label)),
        ("작업 구분", _work_type_value(ticket, work_type_label)),
        ("담당자", _user_label(author, author.emp_no)),
        ("댓글 제목", comment.title or "-"),
    ]
    enqueue_comment_mail(
        event_key=f"comment_admin:requester:{ticket.id}:{comment.id}:{requester.emp_no}",
        event_type="comment_admin",
        ticket=ticket,
        comment=comment,
        recipient=_requester_target(requester),
        subject=subject,
        alert_type="담당자 댓글",
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        is_admin_link=False,
    )
