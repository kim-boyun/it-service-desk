from pydantic import BaseModel, Field
from datetime import datetime


class NoticeCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: dict


class NoticeUpdateIn(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    body: dict | None = None


class NoticeOut(BaseModel):
    id: int
    title: str
    body: dict
    author_emp_no: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
