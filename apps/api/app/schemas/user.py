from pydantic import BaseModel


class UserSummaryOut(BaseModel):
    id: int
    employee_no: str | None = None
    name: str | None = None
    title: str | None = None
    department: str | None = None

    class Config:
        from_attributes = True
