from pydantic import BaseModel
from datetime import datetime

class EventOut(BaseModel):
    id: int
    ticket_id: int
    actor_id: int
    type: str
    from_value: str | None
    to_value: str | None
    note: str | None
    created_at: datetime | None = None

    class Config:
        from_attributes = True
