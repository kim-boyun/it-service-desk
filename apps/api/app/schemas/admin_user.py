from pydantic import BaseModel


class AdminUserOut(BaseModel):
    emp_no: str
    kor_name: str | None = None
    title: str | None = None
    department: str | None = None
    role: str
    pending: int
    total: int


class UserRoleUpdateIn(BaseModel):
    role: str
