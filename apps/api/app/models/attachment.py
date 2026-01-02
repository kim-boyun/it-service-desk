from sqlalchemy.orm import Mapped, mapped_column, DeclarativeBase
from sqlalchemy import String, Integer, DateTime, func, ForeignKey, Boolean
from app.models.user import Base

class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(1024), index=True)  # object storage key
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(128))
    size: Mapped[int] = mapped_column(Integer, default=0)

    ticket_id: Mapped[int | None] = mapped_column(ForeignKey("tickets.id"), nullable=True)
    comment_id: Mapped[int | None] = mapped_column(ForeignKey("ticket_comments.id"), nullable=True)

    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
