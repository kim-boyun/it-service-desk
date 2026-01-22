from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import smtplib
import threading
import time
from email.message import EmailMessage

from email_validator import validate_email, EmailNotValidError
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db import SessionLocal
from ..models.mail_log import MailLog

logger = logging.getLogger(__name__)

MAIL_MAX_ATTEMPTS = 3
MAIL_POLL_SECONDS = 10
MAIL_COOLDOWN_SECONDS = 60


@dataclass
class MailPayload:
    event_key: str
    event_type: str
    subject: str
    body_html: str
    body_text: str
    recipient_email: str
    recipient_emp_no: str | None = None
    ticket_id: int | None = None


def _is_smtp_ready() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def _validate_email(addr: str) -> str | None:
    if not addr:
        return None
    try:
        return validate_email(addr, check_deliverability=False).email
    except EmailNotValidError:
        return None


def _build_message(payload: MailPayload) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = payload.subject
    msg["From"] = f'KDIS-IT-DESK <{settings.smtp_from}>'
    msg["To"] = payload.recipient_email
    msg.set_content(payload.body_text)
    msg.add_alternative(payload.body_html, subtype="html")
    return msg


def _send_message(payload: MailPayload) -> None:
    msg = _build_message(payload)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.send_message(msg)


def _cooldown_hit(session: Session, payload: MailPayload, now: datetime) -> bool:
    cutoff = now - timedelta(seconds=MAIL_COOLDOWN_SECONDS)
    stmt = (
        select(MailLog.id)
        .where(MailLog.recipient_email == payload.recipient_email)
        .where(MailLog.event_type == payload.event_type)
        .where(MailLog.ticket_id == payload.ticket_id)
        .where(MailLog.status == "sent")
        .where(MailLog.created_at >= cutoff)
        .limit(1)
    )
    return session.execute(stmt).first() is not None


def enqueue_mail(payload: MailPayload) -> None:
    if not _is_smtp_ready():
        logger.info("SMTP \uc124\uc815 \ub204\ub77d\uc73c\ub85c \uba54\uc77c \ubc1c\uc1a1\uc744 \uc0dd\ub7b5\ud569\ub2c8\ub2e4. event_key=%s", payload.event_key)
        return

    normalized = _validate_email(payload.recipient_email)
    now = datetime.now(timezone.utc)

    with SessionLocal() as session:
        if not normalized:
            session.add(
                MailLog(
                    event_key=payload.event_key,
                    event_type=payload.event_type,
                    ticket_id=payload.ticket_id,
                    recipient_emp_no=payload.recipient_emp_no,
                    recipient_email=payload.recipient_email,
                    subject=payload.subject,
                    body_text=payload.body_text,
                    body_html=payload.body_html,
                    status="skipped",
                    attempts=0,
                    last_attempt_at=now,
                    error_message="\uc774\uba54\uc77c \uc8fc\uc18c \ud615\uc2dd \uc624\ub958\ub85c \ubc1c\uc1a1 \uc0dd\ub7b5",
                )
            )
            session.commit()
            logger.info("\uc774\uba54\uc77c \ud615\uc2dd \uc624\ub958\ub85c \ubc1c\uc1a1 \uc0dd\ub7b5: %s", payload.recipient_email)
            return

        payload.recipient_email = normalized

        if _cooldown_hit(session, payload, now):
            session.add(
                MailLog(
                    event_key=payload.event_key,
                    event_type=payload.event_type,
                    ticket_id=payload.ticket_id,
                    recipient_emp_no=payload.recipient_emp_no,
                    recipient_email=payload.recipient_email,
                    subject=payload.subject,
                    body_text=payload.body_text,
                    body_html=payload.body_html,
                    status="skipped",
                    attempts=0,
                    last_attempt_at=now,
                    error_message="\ucfe8\ub2e4\uc6b4 \uae30\uac04 \uc911 \uc911\ubcf5 \ubc1c\uc1a1 \ucc28\ub2e8",
                )
            )
            session.commit()
            logger.info("\ucfe8\ub2e4\uc6b4\uc73c\ub85c \uba54\uc77c \ubc1c\uc1a1 \uc0dd\ub7b5: %s", payload.event_key)
            return

        exists = session.execute(select(MailLog.id).where(MailLog.event_key == payload.event_key)).first()
        if exists:
            logger.info("\uc911\ubcf5 \uc774\ubca4\ud2b8\ub85c \uba54\uc77c \ubc1c\uc1a1 \uc0dd\ub7b5: %s", payload.event_key)
            return

        session.add(
            MailLog(
                event_key=payload.event_key,
                event_type=payload.event_type,
                ticket_id=payload.ticket_id,
                recipient_emp_no=payload.recipient_emp_no,
                recipient_email=payload.recipient_email,
                subject=payload.subject,
                body_text=payload.body_text,
                body_html=payload.body_html,
                status="pending",
                attempts=0,
                next_attempt_at=now,
            )
        )
        session.commit()
        logger.info("\uba54\uc77c \ubc1c\uc1a1 \ud050 \ub4f1\ub85d: %s", payload.event_key)


def _next_backoff(attempts: int) -> int:
    steps = [60, 300, 900]
    return steps[min(attempts - 1, len(steps) - 1)]


def _load_pending(session: Session, now: datetime) -> list[MailLog]:
    stmt = (
        select(MailLog)
        .where(MailLog.status.in_(["pending", "failed"]))
        .where(MailLog.next_attempt_at <= now)
        .where(MailLog.attempts < MAIL_MAX_ATTEMPTS)
        .with_for_update(skip_locked=True)
        .limit(20)
    )
    return list(session.scalars(stmt).all())


def _process_once() -> int:
    if not _is_smtp_ready():
        return 0

    now = datetime.now(timezone.utc)
    processed = 0
    with SessionLocal() as session:
        logs = _load_pending(session, now)
        for log in logs:
            processed += 1
            payload = MailPayload(
                event_key=log.event_key,
                event_type=log.event_type,
                subject=log.subject,
                body_html=log.body_html or "",
                body_text=log.body_text or "",
                recipient_email=log.recipient_email,
                recipient_emp_no=log.recipient_emp_no,
                ticket_id=log.ticket_id,
            )
            try:
                _send_message(payload)
                log.status = "sent"
                log.attempts += 1
                log.last_attempt_at = now
                log.next_attempt_at = None
                log.error_message = None
                logger.info("\uba54\uc77c \ubc1c\uc1a1 \uc131\uacf5: %s", log.event_key)
            except Exception as exc:  # noqa: BLE001 - \uc6b4\uc601 \ub85c\uadf8\uc6a9 \uc608\uc678 \ucc98\ub9ac
                log.attempts += 1
                log.status = "failed"
                log.last_attempt_at = now
                log.next_attempt_at = now + timedelta(seconds=_next_backoff(log.attempts))
                log.error_message = str(exc)
                logger.exception("\uba54\uc77c \ubc1c\uc1a1 \uc2e4\ud328: %s", log.event_key)
        session.commit()
    return processed


def _worker_loop() -> None:
    while True:
        try:
            _process_once()
        except Exception:
            logger.exception("\uba54\uc77c \ubc1c\uc1a1 \uc6cc\ucee4 \uc624\ub958")
        time.sleep(MAIL_POLL_SECONDS)


def start_mail_worker_thread() -> None:
    if not _is_smtp_ready():
        logger.info("SMTP \uc124\uc815 \ubbf8\uc644\ub8cc\ub85c \uba54\uc77c \uc6cc\ucee4\ub97c \uc2dc\uc791\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.")
        return
    t = threading.Thread(target=_worker_loop, name="mail-worker", daemon=True)
    t.start()
