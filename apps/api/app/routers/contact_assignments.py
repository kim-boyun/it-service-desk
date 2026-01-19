from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db import get_session
from ..core.current_user import get_current_user
from ..models.user import User
from ..models.contact_assignment_member import ContactAssignmentMember
from ..schemas.contact_assignment import ContactAssignmentOut, ContactAssignmentBulkIn, ContactPersonOut


router = APIRouter(prefix="/contact-assignments", tags=["contact-assignments"])


def require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("", response_model=list[ContactAssignmentOut])
def list_contact_assignments(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(ContactAssignmentMember, User).join(User, ContactAssignmentMember.emp_no == User.emp_no)
    rows = session.execute(stmt).all()

    grouped: dict[int, list[ContactPersonOut]] = {}
    for assignment, u in rows:
        grouped.setdefault(assignment.category_id, []).append(
            ContactPersonOut(
                emp_no=assignment.emp_no,
                kor_name=u.kor_name,
                title=u.title,
                department=u.department,
                email=u.email,
                phone=None,
            )
        )

    return [
        ContactAssignmentOut(category_id=category_id, people=people)
        for category_id, people in grouped.items()
    ]


@router.put("", response_model=list[ContactAssignmentOut])
def save_contact_assignments(
    payload: ContactAssignmentBulkIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    require_admin(user)

    requested_emp_nos = {emp_no for item in payload.assignments for emp_no in item.emp_nos}
    if requested_emp_nos:
        existing = session.execute(
            select(User.emp_no, User.role).where(User.emp_no.in_(requested_emp_nos))
        ).all()
        existing_set = {row[0] for row in existing}
        missing = sorted(requested_emp_nos - existing_set)
        if missing:
            raise HTTPException(status_code=422, detail=f"Unknown emp_no: {', '.join(missing)}")
        non_admins = sorted({row[0] for row in existing if row[1] != "admin"})
        if non_admins:
            raise HTTPException(status_code=422, detail=f"Admin only: {', '.join(non_admins)}")

    for item in payload.assignments:
        session.execute(
            select(ContactAssignmentMember)
            .where(ContactAssignmentMember.category_id == item.category_id)
            .with_for_update()
        )
        session.query(ContactAssignmentMember).filter(
            ContactAssignmentMember.category_id == item.category_id
        ).delete(synchronize_session=False)

        for emp_no in item.emp_nos:
            session.add(
                ContactAssignmentMember(category_id=item.category_id, emp_no=emp_no)
            )

    session.commit()

    return list_contact_assignments(session=session, user=user)
