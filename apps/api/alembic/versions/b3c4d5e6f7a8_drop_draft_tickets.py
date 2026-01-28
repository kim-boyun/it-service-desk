"""drop draft_tickets table

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-02-01 00:00:01.000000

임시저장(draft_tickets) 기능 제거에 따른 테이블 삭제.
"""

from alembic import op


revision = "b3c4d5e6f7a8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS draft_tickets")


def downgrade() -> None:
    # draft_tickets 스키마 복원은 초기 마이그레이션(5b8c63cdc40e) 정의 참고.
    # 복원이 필요하면 별도 마이그레이션으로 처리.
    pass
