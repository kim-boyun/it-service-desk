from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AttachmentRegisterIn(BaseModel):
    key: str
    filename: str
    content_type: str
    size: int = 0
    is_internal: bool = False

class AttachmentOut(BaseModel):
    id: int
    key: str
    filename: str
    content_type: str
    size: int
    ticket_id: Optional[int] = None
    comment_id: Optional[int] = None
    is_internal: bool
    uploaded_by: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True