from pydantic import BaseModel, Field
from datetime import datetime
from .user import UserSummaryOut

class CommentCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: dict | str
    notify_email: bool | None = False

class CommentOut(BaseModel):
    id: int
    ticket_id: int
    author_emp_no: str
    author: UserSummaryOut | None = None
    title: str
    body: dict
    created_at: datetime | None = None

    class Config:
        from_attributes = True
