from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.contact_assignment_member import ContactAssignmentMember
from ..models.user import User


def get_category_admins(session: Session, category_id: int) -> list[User]:
    stmt = (
        select(User)
        .join(ContactAssignmentMember, ContactAssignmentMember.emp_no == User.emp_no)
        .where(ContactAssignmentMember.category_id == category_id)
        .where(User.role == "admin")
    )
    return list(session.scalars(stmt).all())
