"""add comment title

Revision ID: 0e7f4c1f3a2b
Revises: 9c1d0a6c6a2b
Create Date: 2026-01-16 15:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0e7f4c1f3a2b"
down_revision = "9c1d0a6c6a2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ticket_comments",
        sa.Column("title", sa.String(length=200), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("ticket_comments", "title")
