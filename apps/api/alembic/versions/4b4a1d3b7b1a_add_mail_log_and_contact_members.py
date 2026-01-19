"""add mail log and contact assignment members

Revision ID: 4b4a1d3b7b1a
Revises: 3c2c9f8e4d1a
Create Date: 2026-01-16 22:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4b4a1d3b7b1a"
down_revision = "3c2c9f8e4d1a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_assignment_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.BigInteger(), sa.ForeignKey("ticket_categories.id"), nullable=False),
        sa.Column("emp_no", sa.String(length=50), sa.ForeignKey("users.emp_no"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_contact_assignment_members_category_id",
        "contact_assignment_members",
        ["category_id"],
    )
    op.create_index(
        "ix_contact_assignment_members_emp_no",
        "contact_assignment_members",
        ["emp_no"],
    )
    op.create_unique_constraint(
        "uq_contact_assignment_members_category_emp",
        "contact_assignment_members",
        ["category_id", "emp_no"],
    )

    op.create_table(
        "mail_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_key", sa.String(length=200), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("ticket_id", sa.BigInteger(), sa.ForeignKey("tickets.id"), nullable=True),
        sa.Column("recipient_emp_no", sa.String(length=50), sa.ForeignKey("users.emp_no"), nullable=True),
        sa.Column("recipient_email", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_mail_logs_event_key", "mail_logs", ["event_key"], unique=True)
    op.create_index("ix_mail_logs_event_type", "mail_logs", ["event_type"])
    op.create_index("ix_mail_logs_status", "mail_logs", ["status"])
    op.create_index("ix_mail_logs_recipient_emp_no", "mail_logs", ["recipient_emp_no"])

    op.execute(
        """
        INSERT INTO contact_assignment_members (category_id, emp_no, created_at, updated_at)
        SELECT category_id, emp_no, NOW(), NOW()
        FROM contact_assignments
        WHERE emp_no IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_mail_logs_recipient_emp_no", table_name="mail_logs")
    op.drop_index("ix_mail_logs_status", table_name="mail_logs")
    op.drop_index("ix_mail_logs_event_type", table_name="mail_logs")
    op.drop_index("ix_mail_logs_event_key", table_name="mail_logs")
    op.drop_table("mail_logs")

    op.drop_constraint("uq_contact_assignment_members_category_emp", "contact_assignment_members", type_="unique")
    op.drop_index("ix_contact_assignment_members_emp_no", table_name="contact_assignment_members")
    op.drop_index("ix_contact_assignment_members_category_id", table_name="contact_assignment_members")
    op.drop_table("contact_assignment_members")
