from pydantic import BaseModel, Field
from datetime import datetime
from .user import UserSummaryOut

class TicketCreateIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: dict
    priority: str = Field(default="medium")
    category_id: int | None = None
    category_ids: list[int] = Field(default_factory=list)
    work_type: str | None = None
    project_id: int | None = None


class TicketUpdateIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: dict | None = None
    priority: str | None = None
    category_id: int | None = None
    category_ids: list[int] | None = None
    work_type: str | None = None
    project_id: int | None = None


class TicketAdminMetaUpdateIn(BaseModel):
    category_id: int | None = None
    category_ids: list[int] | None = None
    work_type: str | None = None

class TicketOut(BaseModel):
    id: int
    title: str
    description: dict
    status: str
    priority: str
    category_id: int | None = None
    category_ids: list[int] = Field(default_factory=list)
    work_type: str | None = None
    project_id: int | None = None
    project_name: str | None = None
    requester_emp_no: str
    assignee_emp_no: str | None
    assignee_emp_nos: list[str] = Field(default_factory=list)
    requester: UserSummaryOut | None = None
    assignee: UserSummaryOut | None = None
    assignees: list[UserSummaryOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
