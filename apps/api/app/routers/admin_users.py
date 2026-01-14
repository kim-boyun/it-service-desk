from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func, case

from ..db import get_session
from ..models.user import User
from ..models.ticket import Ticket
from ..core.current_user import get_current_user
from ..schemas.admin_user import AdminUserOut, UserRoleUpdateIn


router = APIRouter(prefix="/admin/users", tags=["admin-users"])

PENDING_STATUSES = {"open", "in_progress"}
ALLOWED_ROLES = {"requester", "agent", "admin"}


def require_staff(user: User) -> None:
    if user.role not in ("admin", "agent"):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("", response_model=list[AdminUserOut])
def list_users(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    require_staff(user)

    pending_case = case((Ticket.status.in_(PENDING_STATUSES), 1), else_=0)

    stmt = (
        select(
            User.id,
            User.employee_no,
            User.name,
            User.title,
            User.department,
            User.role,
            func.coalesce(func.sum(pending_case), 0).label("pending"),
            func.count(Ticket.id).label("total"),
        )
        .outerjoin(Ticket, Ticket.requester_id == User.id)
        .group_by(
            User.id,
            User.employee_no,
            User.name,
            User.title,
            User.department,
            User.role,
        )
        .order_by(User.id.asc())
    )

    rows = session.execute(stmt).mappings().all()
    return [AdminUserOut(**row) for row in rows]


@router.patch("/{user_id}/role", response_model=AdminUserOut)
def update_role(
    user_id: int,
    payload: UserRoleUpdateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=422, detail="Invalid role")

    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.role = payload.role
    session.commit()

    pending_case = case((Ticket.status.in_(PENDING_STATUSES), 1), else_=0)
    stmt = (
        select(
            User.id,
            User.employee_no,
            User.name,
            User.title,
            User.department,
            User.role,
            func.coalesce(func.sum(pending_case), 0).label("pending"),
            func.count(Ticket.id).label("total"),
        )
        .outerjoin(Ticket, Ticket.requester_id == User.id)
        .where(User.id == user_id)
        .group_by(
            User.id,
            User.employee_no,
            User.name,
            User.title,
            User.department,
            User.role,
        )
    )
    row = session.execute(stmt).mappings().first()
    return AdminUserOut(**row)
