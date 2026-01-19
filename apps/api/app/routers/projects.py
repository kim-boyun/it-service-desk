from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from ..db import get_session
from ..core.current_user import get_current_user
from ..models.project import Project
from ..models.project_member import ProjectMember
from ..models.user import User
from ..schemas.project import ProjectCreateIn, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    query: str | None = Query(default=None),
    mine: bool = Query(default=True),
):
    stmt = select(Project)
    if mine:
        stmt = stmt.join(ProjectMember, ProjectMember.project_id == Project.id).where(
            ProjectMember.user_emp_no == user.emp_no
        )
    if query:
        stmt = stmt.where(Project.name.ilike(f"%{query.strip()}%"))
    stmt = stmt.order_by(desc(Project.id))
    return list(session.scalars(stmt).all())


@router.post("", response_model=ProjectOut)
def create_project(
    payload: ProjectCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(status_code=422, detail="Invalid project period")

    member_emp_nos = set(payload.member_emp_nos or [])
    member_emp_nos.add(user.emp_no)

    if member_emp_nos:
        users = session.scalars(select(User).where(User.emp_no.in_(member_emp_nos))).all()
        if len(users) != len(member_emp_nos):
            raise HTTPException(status_code=404, detail="User not found")

    project = Project(
        name=payload.name.strip(),
        start_date=payload.start_date,
        end_date=payload.end_date,
        created_by_emp_no=user.emp_no,
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    for emp_no in member_emp_nos:
        session.add(ProjectMember(project_id=project.id, user_emp_no=emp_no))
    session.commit()

    return project
