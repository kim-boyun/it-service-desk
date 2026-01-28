from __future__ import annotations

import os
from datetime import datetime
from uuid import uuid4


def _date_path(dt: datetime | None) -> str:
    # timezone-aware/naive 모두 허용. 폴더는 YYYY/MM/DD (UTC 기준)로 생성.
    base = dt or datetime.utcnow()
    return base.strftime("%Y/%m/%d")


def _ext_from_filename(filename: str) -> str:
    _, ext = os.path.splitext((filename or "").lower())
    return ext


def ticket_attachment_key(*, ticket_id: int, ticket_created_at: datetime | None, filename: str) -> str:
    date_path = _date_path(ticket_created_at)
    ext = _ext_from_filename(filename)
    return f"tickets/{date_path}/{ticket_id}/attachments/{uuid4().hex}{ext}"


def notice_attachment_key(*, notice_id: int, notice_created_at: datetime | None, filename: str) -> str:
    date_path = _date_path(notice_created_at)
    ext = _ext_from_filename(filename)
    return f"notices/{date_path}/{notice_id}/attachments/{uuid4().hex}{ext}"


def ticket_editor_key_from_src_key(*, ticket_id: int, ticket_created_at: datetime | None, src_key: str) -> str:
    # src_key 예: editor/{emp_no}/YYYY/MM/DD/{uuid}.png
    # dest  : tickets/YYYY/MM/DD/{ticketId}/editor/{uuid}.png
    date_path = _date_path(ticket_created_at)
    basename = os.path.basename(src_key)
    return f"tickets/{date_path}/{ticket_id}/editor/{basename}"


def notice_editor_key_from_src_key(*, notice_id: int, notice_created_at: datetime | None, src_key: str) -> str:
    date_path = _date_path(notice_created_at)
    basename = os.path.basename(src_key)
    return f"notices/{date_path}/{notice_id}/editor/{basename}"

