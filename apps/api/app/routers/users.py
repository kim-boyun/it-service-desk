from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from ..core.current_user import get_current_user
from ..db import get_session
from ..models.user import User
from ..schemas.user import UserSummaryOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search", response_model=list[UserSummaryOut])
def search_users(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    query: str = Query(min_length=1, max_length=100),
    limit: int = Query(default=8, ge=1, le=20),
):
    q = query.strip()
    if not q:
        return []

    stmt = (
        select(User)
        .where(
            or_(
                User.emp_no.ilike(f"%{q}%"),
                User.kor_name.ilike(f"%{q}%"),
            )
        )
        .order_by(User.emp_no.asc())
        .limit(limit)
    )
    return list(session.scalars(stmt).all())
