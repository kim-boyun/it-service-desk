"""remove internal memo/attachment flags

Revision ID: 9c1d0a6c6a2b
Revises: 8f1b1f3f5d1a
Create Date: 2026-01-16 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "9c1d0a6c6a2b"
down_revision = "8f1b1f3f5d1a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("ticket_comments", "is_internal")
    op.drop_column("attachments", "is_internal")


def downgrade() -> None:
    op.add_column(
        "ticket_comments",
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "attachments",
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
