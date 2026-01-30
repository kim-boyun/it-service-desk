from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.contact_assignment_member import ContactAssignmentMember
from ..models.ticket import Ticket, TicketCategoryLink
from ..models.ticket_category import TicketCategory
from ..models.user import User


def get_category_admins(session: Session, category_id: int) -> list[User]:
    stmt = (
        select(User)
        .join(ContactAssignmentMember, ContactAssignmentMember.emp_no == User.emp_no)
        .where(ContactAssignmentMember.category_id == category_id)
        .where(User.role == "admin")
    )
    return list(session.scalars(stmt).all())


def get_category_admins_for_categories(session: Session, category_ids: list[int]) -> list[User]:
    """복수 카테고리에 지정된 담당자(admin) 전원을 반환 (emp_no 기준 중복 제거)."""
    if not category_ids:
        return []
    seen: set[str] = set()
    result: list[User] = []
    for cid in category_ids:
        for u in get_category_admins(session, cid):
            if u.emp_no not in seen:
                seen.add(u.emp_no)
                result.append(u)
    return result


def get_ticket_category_ids(session: Session, ticket: Ticket) -> list[int]:
    """티켓에 연결된 카테고리 ID 목록 (ticket_category_links 우선, 없으면 ticket.category_id)."""
    stmt = select(TicketCategoryLink.category_id).where(TicketCategoryLink.ticket_id == ticket.id)
    rows = session.scalars(stmt).all()
    if rows:
        return list(rows)
    if ticket.category_id is not None:
        return [ticket.category_id]
    return []


def get_ticket_category_labels(session: Session, ticket: Ticket) -> str:
    """티켓의 카테고리 이름을 'A, B' 형태로 반환 (SMTP 등 표시용)."""
    ids = get_ticket_category_ids(session, ticket)
    if not ids:
        return "-"
    stmt = select(TicketCategory).where(TicketCategory.id.in_(ids)).order_by(TicketCategory.sort_order, TicketCategory.id)
    categories = list(session.scalars(stmt).all())
    names = [c.name or str(c.id) for c in categories]
    return ", ".join(names) if names else "-"
