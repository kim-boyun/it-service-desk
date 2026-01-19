from pydantic import BaseModel


class UserSummaryOut(BaseModel):
    emp_no: str
    kor_name: str | None = None
    title: str | None = None
    department: str | None = None

    class Config:
        from_attributes = True
