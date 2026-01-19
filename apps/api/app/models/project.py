from datetime import date
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Date, DateTime, Integer, ForeignKey, func
from .user import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by_emp_no: Mapped[str] = mapped_column(String(50), ForeignKey("users.emp_no"))
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
