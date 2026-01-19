from datetime import date, datetime
from pydantic import BaseModel, Field


class ProjectCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    member_emp_nos: list[str] = Field(default_factory=list)


class ProjectOut(BaseModel):
    id: int
    name: str
    start_date: date | None = None
    end_date: date | None = None
    created_by_emp_no: str
    created_at: datetime

    class Config:
        from_attributes = True
