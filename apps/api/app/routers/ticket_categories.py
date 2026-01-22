from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db import get_session
from ..models.ticket_category import TicketCategory
from ..models.user import User
from ..core.current_user import get_current_user
from ..schemas.category import TicketCategoryOut, TicketCategoryCreateIn, TicketCategoryUpdateIn
from ..models.ticket import Ticket
from ..models.draft_ticket import DraftTicket
from ..models.knowledge_item import KnowledgeItem
from ..models.contact_assignment_member import ContactAssignmentMember


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


@router.patch("/{category_id}", response_model=TicketCategoryOut)
def update_category(
    category_id: int,
    payload: TicketCategoryUpdateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    category = session.get(TicketCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.name = payload.name
    category.description = payload.description
    session.commit()
    session.refresh(category)
    return category


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    category = session.get(TicketCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    has_ticket = session.scalar(
        select(Ticket.id).where(Ticket.category_id == category_id).limit(1)
    )
    has_draft = session.scalar(
        select(DraftTicket.id).where(DraftTicket.category_id == category_id).limit(1)
    )
    has_knowledge = session.scalar(
        select(KnowledgeItem.id).where(KnowledgeItem.category_id == category_id).limit(1)
    )
    if has_ticket or has_draft or has_knowledge:
        raise HTTPException(
            status_code=409,
            detail="Category is in use and cannot be deleted",
        )

    session.query(ContactAssignmentMember).filter(
        ContactAssignmentMember.category_id == category_id
    ).delete(synchronize_session=False)
    session.delete(category)
    session.commit()
    return {"status": "ok"}
