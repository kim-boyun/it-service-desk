from sqlalchemy.orm import Session
from sqlalchemy import select

from ..models.user import User
from .security import hash_password

def seed_users(session: Session) -> None:
    """
    DEV 용 시드 유저 생성.
    - 이미 존재하면 아무 것도 안 함 (idempotent)
    """

    seeds = [
        # admin
        dict(
            email="admin@kdischool.ac.kr",
            password="admin1234!@",
            role="admin",
            is_verified=True,
        ),
        # agent
        dict(
            email="agent@kdischool.ac.kr",
            password="agent1234!@",
            role="agent",
            is_verified=True,
        ),
    ]

    for s in seeds:
        exists = session.scalar(select(User).where(User.email == s["email"]))
        if exists:
            continue

        u = User(
            email=s["email"],
            password_hash=hash_password(s["password"]),
            role=s["role"],
            is_verified=s["is_verified"],
        )
        session.add(u)

    session.commit()
