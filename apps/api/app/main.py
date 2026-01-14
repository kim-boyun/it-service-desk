from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import os

from .routers import auth, health, tickets, comments, uploads, attachments, me, admin_users, notices, faqs, ticket_categories, projects, users, draft_tickets, notifications
from .models.user import Base
from .db import engine, SessionLocal
from .core.seed import seed_users, seed_ticket_categories

import app.models.ticket  # noqa: F401
import app.models.comment  # noqa: F401
import app.models.event  # noqa: F401
import app.models.knowledge_item  # noqa: F401
import app.models.ticket_category  # noqa: F401
import app.models.project  # noqa: F401
import app.models.project_member  # noqa: F401
import app.models.draft_ticket  # noqa: F401


app = FastAPI(title="IT Service Desk API")


@app.on_event("startup")
def on_startup():
    # Create tables in dev if missing.
    Base.metadata.create_all(bind=engine)

    # Ensure required user columns exist for legacy schemas.
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_no VARCHAR(50)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS title VARCHAR(100)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"))
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'users' AND column_name = 'email'
                  ) THEN
                    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
                  END IF;
                END $$;
                """
            )
        )

    # Seed default admin account.
    with SessionLocal() as session:
        seed_users(session)
        seed_ticket_categories(session)


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
app.include_router(draft_tickets.router)
app.include_router(notifications.router)

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
