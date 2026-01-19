from pydantic import BaseModel, Field
from datetime import datetime


class FaqCreateIn(BaseModel):
    question: str = Field(min_length=1)
    answer: dict
    category_id: int | None = None


class FaqUpdateIn(BaseModel):
    question: str | None = None
    answer: dict | None = None
    category_id: int | None = None


class FaqOut(BaseModel):
    id: int
    question: str
    answer: dict
    category_id: int | None
    category_name: str | None
    category_code: str | None
    author_emp_no: str
    created_at: datetime
    updated_at: datetime
