from pydantic import BaseModel, Field
from datetime import datetime


class ReopenCreateIn(BaseModel):
    description: dict = Field(...)


class ReopenAsNewCreateIn(BaseModel):
    """재요청을 새 티켓으로 생성할 때 사용."""
    parent_ticket_id: int = Field(...)
    title: str = Field(min_length=3, max_length=200)
    description: dict = Field(...)


class ReopenOut(BaseModel):
    id: int
    ticket_id: int
    description: dict
    requester_emp_no: str
    created_at: datetime

    class Config:
        from_attributes = True
