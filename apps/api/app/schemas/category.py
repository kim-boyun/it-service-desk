from pydantic import BaseModel, Field


class TicketCategoryOut(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None


class TicketCategoryCreateIn(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None


class TicketCategoryUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
