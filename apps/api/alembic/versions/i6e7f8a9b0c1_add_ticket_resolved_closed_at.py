"""Add resolved_at and closed_at to tickets

Revision ID: i6e7f8a9b0c1
Revises: h5d6e7f8a9b0
Create Date: 2026-02-01 14:00:00.000000

- tickets.resolved_at (nullable datetime, when status became resolved)
- tickets.closed_at (nullable datetime, when status became closed)
"""

from alembic import op
import sqlalchemy as sa


revision = "i6e7f8a9b0c1"
down_revision = "h5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "tickets",
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tickets", "closed_at")
    op.drop_column("tickets", "resolved_at")
