"""add ticket category/assignee links

Revision ID: d2b9f9f0a3b1
Revises: 9c1d0a6c6a2b
Create Date: 2026-01-23 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "d2b9f9f0a3b1"
down_revision = "9c1d0a6c6a2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ticket_category_links",
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("ticket_categories.id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_table(
        "ticket_assignees",
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("emp_no", sa.String(length=50), sa.ForeignKey("users.emp_no"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.execute(
        """
        INSERT INTO ticket_category_links (ticket_id, category_id, created_at)
        SELECT id, category_id, now()
        FROM tickets
        WHERE category_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO ticket_assignees (ticket_id, emp_no, created_at)
        SELECT id, assignee_emp_no, now()
        FROM tickets
        WHERE assignee_emp_no IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_table("ticket_assignees")
    op.drop_table("ticket_category_links")
