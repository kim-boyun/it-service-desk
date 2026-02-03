from pydantic import BaseModel
from typing import List, Optional

from .ticket import TicketOut
from .comment import CommentOut
from .event import EventOut
from .attachment import AttachmentOut
from .reopen import ReopenOut


class ParentTicketSummary(BaseModel):
    """재요청건(새 티켓)에서 참조하는 이전 요청(부모 티켓) 요약. 탭에 '이전 요청' 하나만 표시할 때 사용."""
    id: int
    title: str
    description: dict


class TicketDetailOut(BaseModel):
    ticket: TicketOut
    comments: list[CommentOut]
    events: list[EventOut]
    attachments: list[AttachmentOut]
    reopens: list[ReopenOut] = []
    parent_ticket_summary: Optional[ParentTicketSummary] = None