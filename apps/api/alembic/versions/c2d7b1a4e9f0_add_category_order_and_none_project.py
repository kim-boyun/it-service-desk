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


def _has_table(conn, table: str) -> bool:
    r = conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"),
        {"t": table},
    ).scalar()
    return r is not None


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
                "where id in ("
                "  select id from contact_assignment_members "
                "  where category_id in :old_ids "
                "  and id not in ("
                "    select min(id) from contact_assignment_members "
                "    where category_id in :old_ids group by emp_no"
                "  )"
                ")"
            ).bindparams(sa.bindparam("old_ids", expanding=True)),
            {"old_ids": old_ids},
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
        if _has_table(conn, "contact_assignments"):
            conn.execute(
                sa.text("delete from contact_assignments where category_id in :old_ids")
                .bindparams(sa.bindparam("old_ids", expanding=True)),
                {"old_ids": old_ids},
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
        ("portal", "포탈 (전자결재)", 30),
        ("dooray", "두레이 (메일)", 40),
        ("vdi_gabia_daas", "VDI(Gabia DaaS)", 50),
        ("it_service", "IT 서비스 (컴퓨터, 프린터 등)", 60),
        ("infra", "인프라 (인터넷)", 70),
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

    # 기본 "없음" 프로젝트는 더 이상 생성하지 않음 (제거됨)


def downgrade() -> None:
    op.drop_column("ticket_categories", "sort_order")
