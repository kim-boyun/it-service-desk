from fastapi import FastAPI
from .routers import auth, health, tickets, comments, uploads, attachments
from .models.user import Base
from .db import engine, SessionLocal

import app.models.ticket  # noqa: F401
import app.models.comment  # noqa: F401
import app.models.event  # noqa

from .core.seed import seed_users


app = FastAPI(title="IT Service Desk API")

@app.on_event("startup")
def on_startup():
    # 1) 테이블 생성(DEV 편의)
    Base.metadata.create_all(bind=engine)

    # 2) 시드 유저 생성
    with SessionLocal() as session:
        seed_users(session)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(comments.router)
app.include_router(uploads.router)
app.include_router(attachments.router)