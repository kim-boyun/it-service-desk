from pydantic import BaseModel, Field
from datetime import datetime


class DraftTicketIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: dict | None = None
    priority: str | None = None
    category_id: int | None = None
    work_type: str | None = None
    project_id: int | None = None


class DraftTicketOut(BaseModel):
    id: int
    title: str | None = None
    description: dict | None = None
    priority: str | None = None
    category_id: int | None = None
    work_type: str | None = None
    project_id: int | None = None
    project_name: str | None = None
    requester_emp_no: str
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
