"""users emp_no pk and fk rename

Revision ID: 8f1b1f3f5d1a
Revises: 5b8c63cdc40e
Create Date: 2026-01-15 18:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "8f1b1f3f5d1a"
down_revision = "5b8c63cdc40e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users table: add new columns and backfill
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS emp_no VARCHAR(50)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS kor_name VARCHAR(100)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32)")

    op.execute(
        "UPDATE users SET emp_no = employee_no WHERE emp_no IS NULL AND employee_no IS NOT NULL"
    )
    op.execute("UPDATE users SET kor_name = name WHERE kor_name IS NULL AND name IS NOT NULL")
    op.execute(
        "UPDATE users SET password = password_hash WHERE password IS NULL AND password_hash IS NOT NULL"
    )

    op.execute("ALTER TABLE users ALTER COLUMN emp_no SET NOT NULL")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_emp_no ON users(emp_no)")

    # add new FK columns and backfill from legacy ids
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS requester_emp_no VARCHAR(50)")
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignee_emp_no VARCHAR(50)")
    op.execute(
        "UPDATE tickets t SET requester_emp_no = u.emp_no FROM users u WHERE t.requester_emp_no IS NULL AND t.requester_id = u.id"
    )
    op.execute(
        "UPDATE tickets t SET assignee_emp_no = u.emp_no FROM users u WHERE t.assignee_emp_no IS NULL AND t.assignee_id = u.id"
    )

    op.execute("ALTER TABLE draft_tickets ADD COLUMN IF NOT EXISTS requester_emp_no VARCHAR(50)")
    op.execute(
        "UPDATE draft_tickets d SET requester_emp_no = u.emp_no FROM users u WHERE d.requester_emp_no IS NULL AND d.requester_id = u.id"
    )

    op.execute("ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS author_emp_no VARCHAR(50)")
    op.execute(
        "UPDATE ticket_comments c SET author_emp_no = u.emp_no FROM users u WHERE c.author_emp_no IS NULL AND c.author_id = u.id"
    )

    op.execute("ALTER TABLE ticket_events ADD COLUMN IF NOT EXISTS actor_emp_no VARCHAR(50)")
    op.execute(
        "UPDATE ticket_events e SET actor_emp_no = u.emp_no FROM users u WHERE e.actor_emp_no IS NULL AND e.actor_id = u.id"
    )

    op.execute("ALTER TABLE attachments ADD COLUMN IF NOT EXISTS uploaded_emp_no VARCHAR(50)")
    op.execute(
        "UPDATE attachments a SET uploaded_emp_no = u.emp_no FROM users u WHERE a.uploaded_emp_no IS NULL AND a.uploaded_by = u.id"
    )

    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_emp_no VARCHAR(50)")
    op.execute(
        "UPDATE projects p SET created_by_emp_no = u.emp_no FROM users u WHERE p.created_by_emp_no IS NULL AND p.created_by = u.id"
    )

    op.execute("ALTER TABLE project_members ADD COLUMN IF NOT EXISTS user_emp_no VARCHAR(50)")
    op.execute(
        "UPDATE project_members pm SET user_emp_no = u.emp_no FROM users u WHERE pm.user_emp_no IS NULL AND pm.user_id = u.id"
    )

    op.execute("ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS author_emp_no VARCHAR(50)")
    op.execute(
        "UPDATE knowledge_items k SET author_emp_no = u.emp_no FROM users u WHERE k.author_emp_no IS NULL AND k.author_id = u.id"
    )

    # drop legacy constraints
    op.execute("ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_requester_id_fkey")
    op.execute("ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_assignee_id_fkey")
    op.execute("ALTER TABLE draft_tickets DROP CONSTRAINT IF EXISTS draft_tickets_requester_id_fkey")
    op.execute("ALTER TABLE ticket_comments DROP CONSTRAINT IF EXISTS ticket_comments_author_id_fkey")
    op.execute("ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_actor_id_fkey")
    op.execute("ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_uploaded_by_fkey")
    op.execute("ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_created_by_fkey")
    op.execute("ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_user_id_fkey")
    op.execute("ALTER TABLE knowledge_items DROP CONSTRAINT IF EXISTS knowledge_items_author_id_fkey")

    # drop legacy columns
    op.execute("ALTER TABLE tickets DROP COLUMN IF EXISTS requester_id")
    op.execute("ALTER TABLE tickets DROP COLUMN IF EXISTS assignee_id")
    op.execute("ALTER TABLE draft_tickets DROP COLUMN IF EXISTS requester_id")
    op.execute("ALTER TABLE ticket_comments DROP COLUMN IF EXISTS author_id")
    op.execute("ALTER TABLE ticket_events DROP COLUMN IF EXISTS actor_id")
    op.execute("ALTER TABLE attachments DROP COLUMN IF EXISTS uploaded_by")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS created_by")
    op.execute("ALTER TABLE project_members DROP COLUMN IF EXISTS user_id")
    op.execute("ALTER TABLE knowledge_items DROP COLUMN IF EXISTS author_id")

    # recreate constraints for new emp_no columns
    op.execute(
        "ALTER TABLE tickets ADD CONSTRAINT fk_tickets_requester_emp_no FOREIGN KEY (requester_emp_no) REFERENCES users(emp_no) ON DELETE RESTRICT"
    )
    op.execute(
        "ALTER TABLE tickets ADD CONSTRAINT fk_tickets_assignee_emp_no FOREIGN KEY (assignee_emp_no) REFERENCES users(emp_no) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE draft_tickets ADD CONSTRAINT fk_draft_tickets_requester_emp_no FOREIGN KEY (requester_emp_no) REFERENCES users(emp_no) ON DELETE RESTRICT"
    )
    op.execute(
        "ALTER TABLE ticket_comments ADD CONSTRAINT fk_ticket_comments_author_emp_no FOREIGN KEY (author_emp_no) REFERENCES users(emp_no) ON DELETE RESTRICT"
    )
    op.execute(
        "ALTER TABLE ticket_events ADD CONSTRAINT fk_ticket_events_actor_emp_no FOREIGN KEY (actor_emp_no) REFERENCES users(emp_no) ON DELETE RESTRICT"
    )
    op.execute(
        "ALTER TABLE attachments ADD CONSTRAINT fk_attachments_uploaded_emp_no FOREIGN KEY (uploaded_emp_no) REFERENCES users(emp_no) ON DELETE RESTRICT"
    )
    op.execute(
        "ALTER TABLE projects ADD CONSTRAINT fk_projects_created_by_emp_no FOREIGN KEY (created_by_emp_no) REFERENCES users(emp_no) ON DELETE RESTRICT"
    )
    op.execute(
        "ALTER TABLE project_members ADD CONSTRAINT fk_project_members_user_emp_no FOREIGN KEY (user_emp_no) REFERENCES users(emp_no) ON DELETE CASCADE"
    )
    op.execute(
        "ALTER TABLE knowledge_items ADD CONSTRAINT fk_knowledge_items_author_emp_no FOREIGN KEY (author_emp_no) REFERENCES users(emp_no) ON DELETE RESTRICT"
    )

    # switch primary key to emp_no
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey")
    op.execute("ALTER TABLE users ADD PRIMARY KEY (emp_no)")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS employee_no")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS name")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")

    # create sync_state table
    op.create_table(
        "sync_state",
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("sync_state")
