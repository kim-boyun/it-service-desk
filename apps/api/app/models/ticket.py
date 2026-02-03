from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, func
from .user import Base

class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)

    status: Mapped[str] = mapped_column(String(32), default="open")
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    category_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("ticket_categories.id"), nullable=True)
    work_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    project_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)

    requester_emp_no: Mapped[str] = mapped_column(String(50), ForeignKey("users.emp_no"))
    assignee_emp_no: Mapped[str | None] = mapped_column(String(50), ForeignKey("users.emp_no"), nullable=True)

    # 요청 시점의 요청자 정보(이름/직급/부서) – 인사 이동 등과 무관하게 해당 시점으로 영구 보존
    requester_kor_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    requester_title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    requester_department: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resolved_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    reopen_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    parent_ticket_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True)


class TicketReopen(Base):
    __tablename__ = "ticket_reopens"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(Text)
    requester_emp_no: Mapped[str] = mapped_column(String(50), ForeignKey("users.emp_no"))
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TicketCategoryLink(Base):
    __tablename__ = "ticket_category_links"

    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("ticket_categories.id"), primary_key=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TicketAssignee(Base):
    __tablename__ = "ticket_assignees"

    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True)
    emp_no: Mapped[str] = mapped_column(String(50), ForeignKey("users.emp_no"), primary_key=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
