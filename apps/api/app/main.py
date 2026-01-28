from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import os

from .routers import auth, health, tickets, comments, uploads, attachments, me, admin_users, notices, faqs, ticket_categories, projects, users, notifications, contact_assignments
from .models.user import Base
from .db import engine, SessionLocal
from .core.seed import seed_ticket_categories
from .core.settings import settings
from .core.user_sync import start_user_sync_thread
from .services.mail_service import start_mail_worker_thread

import app.models.ticket  # noqa: F401
import app.models.comment  # noqa: F401
import app.models.event  # noqa: F401
import app.models.knowledge_item  # noqa: F401
import app.models.ticket_category  # noqa: F401
import app.models.project  # noqa: F401
import app.models.project_member  # noqa: F401
import app.models.sync_state  # noqa: F401
import app.models.contact_assignment  # noqa: F401
import app.models.contact_assignment_member  # noqa: F401
import app.models.mail_log  # noqa: F401


app = FastAPI(title="IT Service Desk API")


@app.on_event("startup")
def on_startup():
    if settings.AUTO_DB_BOOTSTRAP:
        # Create tables in dev if missing.
        Base.metadata.create_all(bind=engine)

        # Ensure required user columns exist for legacy schemas.
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS emp_no VARCHAR(50)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS kor_name VARCHAR(100)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS eng_name VARCHAR(100)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS title VARCHAR(100)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"))

        # Seed ticket categories only. admin/test 등 기본 사용자는 생성하지 않음.
        with SessionLocal() as session:
            seed_ticket_categories(session)

    # Start periodic user sync (if enabled).
    start_user_sync_thread()
    start_mail_worker_thread()

    if settings.AUTO_DB_BOOTSTRAP:
        # Migrate tickets to category_id-only schema if legacy columns exist.
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category_id BIGINT"))
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                      IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'tickets' AND column_name = 'category'
                      ) THEN
                        UPDATE tickets t
                        SET category_id = tc.id
                        FROM ticket_categories tc
                        WHERE t.category_id IS NULL AND t.category = tc.code;
                      END IF;
                    END $$;
                    """
                )
            )
            conn.execute(text("ALTER TABLE tickets DROP COLUMN IF EXISTS category"))


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(comments.router)
app.include_router(uploads.router)
app.include_router(attachments.router)
app.include_router(me.router)
app.include_router(admin_users.router)
app.include_router(notices.router)
app.include_router(faqs.router)
app.include_router(ticket_categories.router)
app.include_router(projects.router)
app.include_router(users.router)
app.include_router(notifications.router)
app.include_router(contact_assignments.router)

# CORS: allow local dev origins by default.
raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
)
allow_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
