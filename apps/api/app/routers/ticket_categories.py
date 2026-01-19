from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db import get_session
from ..models.ticket_category import TicketCategory
from ..models.user import User
from ..core.current_user import get_current_user
from ..schemas.category import TicketCategoryOut, TicketCategoryCreateIn


router = APIRouter(prefix="/ticket-categories", tags=["ticket-categories"])


@router.get("", response_model=list[TicketCategoryOut])
def list_categories(session: Session = Depends(get_session)):
    stmt = select(TicketCategory).order_by(TicketCategory.id.asc())
    return list(session.scalars(stmt).all())


@router.post("", response_model=TicketCategoryOut)
def create_category(
    payload: TicketCategoryCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    exists = session.scalar(select(TicketCategory).where(TicketCategory.code == payload.code))
    if exists:
        raise HTTPException(status_code=409, detail="Category code already exists")
    cat = TicketCategory(code=payload.code, name=payload.name, description=payload.description)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat
