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
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(status_code=422, detail="Invalid project period")

    project = Project(
        name=payload.name.strip(),
        start_date=payload.start_date,
        end_date=payload.end_date,
        created_by_emp_no=user.emp_no,
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    return project


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    session.query(ProjectMember).filter(ProjectMember.project_id == project_id).delete()
    session.delete(project)
    session.commit()
    return {"ok": True}
