"""add users email

Revision ID: 3c2c9f8e4d1a
Revises: 0e7f4c1f3a2b
Create Date: 2026-01-16 21:15:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3c2c9f8e4d1a"
down_revision = "0e7f4c1f3a2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "email")
