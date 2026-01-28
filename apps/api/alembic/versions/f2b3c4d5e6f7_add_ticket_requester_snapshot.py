"""add ticket requester snapshot (name/title/department at request time)

Revision ID: f2b3c4d5e6f7
Revises: e1a2b3c4d5f6
Create Date: 2026-01-28 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f2b3c4d5e6f7"
down_revision = "e1a2b3c4d5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("requester_kor_name", sa.String(100), nullable=True))
    op.add_column("tickets", sa.Column("requester_title", sa.String(100), nullable=True))
    op.add_column("tickets", sa.Column("requester_department", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "requester_department")
    op.drop_column("tickets", "requester_title")
    op.drop_column("tickets", "requester_kor_name")
