"""add ticket category order and none project

Revision ID: c2d7b1a4e9f0
Revises: 7c8e4a9b1f2c, d2b9f9f0a3b1
Create Date: 2026-01-23 12:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "c2d7b1a4e9f0"
down_revision = ("7c8e4a9b1f2c", "d2b9f9f0a3b1")
branch_labels = None
depends_on = None


def _ensure_category(conn, code: str, name: str, sort_order: int) -> int:
    category_id = conn.execute(
        sa.text("select id from ticket_categories where code = :code"),
        {"code": code},
    ).scalar()
    if category_id is None:
        conn.execute(
            sa.text(
                "insert into ticket_categories (code, name, description, sort_order) "
                "values (:code, :name, :description, :sort_order)"
            ),
            {
                "code": code,
                "name": name,
                "description": name,
                "sort_order": sort_order,
            },
        )
        category_id = conn.execute(
            sa.text("select id from ticket_categories where code = :code"),
            {"code": code},
        ).scalar()
    return int(category_id)


def upgrade() -> None:
    op.add_column(
        "ticket_categories",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="999"),
    )
    conn = op.get_bind()

    infra_id = _ensure_category(conn, "infra", "인프라", 70)
    old_ids = [
        row[0]
        for row in conn.execute(
            sa.text("select id from ticket_categories where code in ('cloud', 'network_server')")
        ).fetchall()
    ]

    if infra_id and old_ids:
        conn.execute(
            sa.text(
                "delete from ticket_category_links "
                "where category_id in :old_ids "
                "and ticket_id in (select ticket_id from ticket_category_links where category_id = :infra_id)"
            ).bindparams(sa.bindparam("old_ids", expanding=True)),
            {"old_ids": old_ids, "infra_id": infra_id},
        )
        conn.execute(
            sa.text(
                "update ticket_category_links set category_id = :infra_id where category_id in :old_ids"
            ).bindparams(sa.bindparam("old_ids", expanding=True)),
            {"old_ids": old_ids, "infra_id": infra_id},
        )
        conn.execute(
            sa.text("update tickets set category_id = :infra_id where category_id in :old_ids")
            .bindparams(sa.bindparam("old_ids", expanding=True)),
            {"old_ids": old_ids, "infra_id": infra_id},
        )
        conn.execute(
            sa.text("update draft_tickets set category_id = :infra_id where category_id in :old_ids")
            .bindparams(sa.bindparam("old_ids", expanding=True)),
            {"old_ids": old_ids, "infra_id": infra_id},
        )
        conn.execute(
            sa.text("update knowledge_items set category_id = :infra_id where category_id in :old_ids")
            .bindparams(sa.bindparam("old_ids", expanding=True)),
            {"old_ids": old_ids, "infra_id": infra_id},
        )
        conn.execute(
            sa.text(
                "delete from contact_assignment_members "
                "where category_id in :old_ids "
                "and emp_no in (select emp_no from contact_assignment_members where category_id = :infra_id)"
            ).bindparams(sa.bindparam("old_ids", expanding=True)),
            {"old_ids": old_ids, "infra_id": infra_id},
        )
        conn.execute(
            sa.text(
                "update contact_assignment_members set category_id = :infra_id where category_id in :old_ids"
            ).bindparams(sa.bindparam("old_ids", expanding=True)),
            {"old_ids": old_ids, "infra_id": infra_id},
        )
        conn.execute(
            sa.text("delete from ticket_categories where id in :old_ids").bindparams(
                sa.bindparam("old_ids", expanding=True)
            ),
            {"old_ids": old_ids},
        )

    ordered = [
        ("mis_academic", "MIS(학사)", 10),
        ("mis_admin", "MIS(일반행정)", 20),
        ("portal", "포탈", 30),
        ("dooray", "두레이", 40),
        ("vdi_gabia_daas", "VDI(Gabia DaaS)", 50),
        ("it_service", "IT 서비스", 60),
        ("infra", "인프라", 70),
        ("etc", "기타", 80),
    ]
    for code, name, order in ordered:
        _ensure_category(conn, code, name, order)
        conn.execute(
            sa.text(
                "update ticket_categories set name = :name, description = :description, sort_order = :sort_order "
                "where code = :code"
            ),
            {"code": code, "name": name, "description": name, "sort_order": order},
        )

    existing = conn.execute(
        sa.text("select id from projects where name = :name"),
        {"name": "없음"},
    ).scalar()
    if not existing:
        admin_emp_no = conn.execute(
            sa.text("select emp_no from users where role = 'admin' order by emp_no limit 1")
        ).scalar()
        if not admin_emp_no:
            admin_emp_no = "admin"
        conn.execute(
            sa.text(
                "insert into projects (name, start_date, end_date, created_by_emp_no, created_at) "
                "values (:name, null, null, :emp_no, now())"
            ),
            {"name": "없음", "emp_no": admin_emp_no},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("delete from projects where name = :name"), {"name": "없음"})
    op.drop_column("ticket_categories", "sort_order")
