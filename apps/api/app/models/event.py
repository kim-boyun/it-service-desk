from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, DateTime, ForeignKey, func, Text
from .user import Base

class TicketEvent(Base):
    __tablename__ = "ticket_events"

    id: Mapped[int] = mapped_column(primary_key=True)

    ticket_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE")
    )
    actor_emp_no: Mapped[str] = mapped_column(
        String(50), ForeignKey("users.emp_no")
    )

    # 예: "status_changed", "assigned", "priority_changed" (확장 대비)
    type: Mapped[str] = mapped_column(String(32), default="status_changed")

    # 변경 전/후 값
    from_value: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_value: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 메모(선택)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
