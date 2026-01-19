from pydantic import BaseModel


class ContactPersonOut(BaseModel):
    emp_no: str | None = None
    kor_name: str | None = None
    title: str | None = None
    department: str | None = None
    email: str | None = None
    phone: str | None = None


class ContactAssignmentOut(BaseModel):
    category_id: int
    people: list[ContactPersonOut]


class ContactAssignmentIn(BaseModel):
    category_id: int
    emp_nos: list[str] = []


class ContactAssignmentBulkIn(BaseModel):
    assignments: list[ContactAssignmentIn]
