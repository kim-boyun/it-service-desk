from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, Text, DateTime, ForeignKey, func, String
from .user import Base

class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id: Mapped[int] = mapped_column(primary_key=True)

    ticket_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE")
    )
    author_emp_no: Mapped[str] = mapped_column(
        String(50), ForeignKey("users.emp_no")
    )

    title: Mapped[str] = mapped_column(String(200), server_default="")
    body: Mapped[str] = mapped_column(Text)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
