from sqlalchemy.orm import Session
from sqlalchemy import select
import os

from ..models.user import User
from ..models.ticket_category import TicketCategory
from ..models.ticket import Ticket
from .security import hash_password_sha256_b64


def seed_users(session: Session) -> None:
    """
    DEV 기본 사용자 시드.
    - 동일 사번이 있으면 업데이트합니다.
    - 기본 관리자 계정만 생성합니다.
    """

    admin_employee_no = os.getenv("ADMIN_EMPLOYEE_NO", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin1234!@")
    seeds = [
        {
            "emp_no": admin_employee_no,
            "password": admin_password,
            "role": "admin",
            "is_verified": True,
            "kor_name": "관리자",
            "title": "관리자",
            "department": "전산2팀",
        },
    ]

    for s in seeds:
        exists = session.scalar(select(User).where(User.emp_no == s["emp_no"]))

        if exists:
            exists.role = s["role"]
            exists.is_verified = s["is_verified"]
            exists.emp_no = s["emp_no"]
            exists.kor_name = s.get("kor_name")
            exists.title = s.get("title")
            exists.department = s.get("department")
            exists.password = hash_password_sha256_b64(s["password"])
            continue

        u = User(
            emp_no=s["emp_no"],
            password=hash_password_sha256_b64(s["password"]),
            role=s["role"],
            is_verified=s["is_verified"],
            kor_name=s.get("kor_name"),
            title=s.get("title"),
            department=s.get("department"),
        )
        session.add(u)

    session.commit()


def seed_ticket_categories(session: Session) -> None:
    removed_codes = {"security", "device_mgmt"}

    seeds = [
        dict(code="dooray", name="두레이", description="두레이"),
        dict(code="vdi_gabia_daas", name="VDI(Gabia DaaS)", description="VDI(Gabia DaaS)"),
        dict(code="portal", name="포탈", description="포탈"),
        dict(code="mis_academic", name="MIS(학사)", description="MIS(학사)"),
        dict(code="mis_admin", name="MIS(일반행정)", description="MIS(일반행정)"),
        dict(code="cloud", name="클라우드", description="클라우드"),
        dict(code="network_server", name="네트워크/서버", description="네트워크/서버"),
        dict(code="it_service", name="IT서비스", description="IT서비스"),
        dict(code="etc", name="기타", description="기타"),
    ]
    seed_codes = {s["code"] for s in seeds}

    for s in seeds:
        exists = session.scalar(select(TicketCategory).where(TicketCategory.code == s["code"]))
        if exists:
            exists.name = s["name"]
            exists.description = s["description"]
        else:
            cat = TicketCategory(code=s["code"], name=s["name"], description=s["description"])
            session.add(cat)

    if removed_codes:
        etc_category = session.scalar(select(TicketCategory).where(TicketCategory.code == "etc"))
        if etc_category:
            removed_categories = session.scalars(
                select(TicketCategory).where(TicketCategory.code.in_(removed_codes))
            ).all()
            removed_ids = [c.id for c in removed_categories]
            if removed_ids:
                session.query(Ticket).filter(Ticket.category_id.in_(removed_ids)).update(
                    {Ticket.category_id: etc_category.id}, synchronize_session=False
                )

    extra_categories = session.scalars(
        select(TicketCategory).where(TicketCategory.code.notin_(seed_codes))
    ).all()
    for cat in extra_categories:
        in_use = session.scalar(select(Ticket).where(Ticket.category_id == cat.id))
        if in_use:
            continue
        session.delete(cat)

    session.commit()
