from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime, ForeignKey, func
from .user import Base


class ContactAssignment(Base):
    __tablename__ = "contact_assignments"

    category_id: Mapped[int] = mapped_column(ForeignKey("ticket_categories.id"), primary_key=True)
    emp_no: Mapped[str | None] = mapped_column(String(50), ForeignKey("users.emp_no"), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
