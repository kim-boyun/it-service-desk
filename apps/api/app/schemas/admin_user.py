from pydantic import BaseModel


class AdminUserOut(BaseModel):
    id: int
    employee_no: str | None = None
    name: str | None = None
    title: str | None = None
    department: str | None = None
    role: str
    pending: int
    total: int


class UserRoleUpdateIn(BaseModel):
    role: str
