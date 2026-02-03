"""Add parent_ticket_id to tickets (재요청건 = 새 티켓으로 생성, 부모 참조)

Revision ID: j7f8b9c0d1e2
Revises: i6e7f8a9b0c1
Create Date: 2026-02-02 10:00:00.000000

- tickets.parent_ticket_id (nullable FK to tickets.id): 재요청 시 선택한 이전 티켓
"""

from alembic import op
import sqlalchemy as sa


revision = "j7f8b9c0d1e2"
down_revision = "i6e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("parent_ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_tickets_parent_ticket_id", "tickets", ["parent_ticket_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tickets_parent_ticket_id", table_name="tickets")
    op.drop_column("tickets", "parent_ticket_id")
