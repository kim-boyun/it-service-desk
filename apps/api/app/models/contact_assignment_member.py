from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from .user import Base


class ContactAssignmentMember(Base):
    __tablename__ = "contact_assignment_members"
    __table_args__ = (
        UniqueConstraint("category_id", "emp_no", name="uq_contact_assignment_members_category_emp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("ticket_categories.id"), index=True)
    emp_no: Mapped[str] = mapped_column(String(50), ForeignKey("users.emp_no"), index=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
