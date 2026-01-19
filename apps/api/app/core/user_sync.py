from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import re
import threading
import time

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db import SessionLocal
from ..models.sync_state import SyncState


SYNC_KEY = "users_from_misdb"
_force_full_done = False
logger = logging.getLogger(__name__)


@dataclass
class SyncConfig:
    source_url: str
    source_schema: str
    emp_no_prefix: str
    interval_seconds: int


def _safe_schema_name(raw: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", raw):
        raise ValueError("Invalid schema name")
    return raw


def _load_config() -> SyncConfig | None:
    if not settings.sync_enabled:
        return None
    if not settings.sync_source_database_url:
        return None
    return SyncConfig(
        source_url=settings.sync_source_database_url,
        source_schema=_safe_schema_name(settings.sync_source_schema),
        emp_no_prefix=settings.sync_emp_no_prefix,
        interval_seconds=settings.sync_interval_seconds,
    )


def _source_query(schema: str) -> str:
    return f"""
        SELECT
            gm.emp_no,
            gm.kor_name,
            cc.name AS title,
            d.dept_kname AS department,
            cu.password,
            mv.email,
            GREATEST(
                COALESCE(gm.update_dtime, TIMESTAMP '1970-01-01'),
                COALESCE(cu.update_dtime, TIMESTAMP '1970-01-01'),
                COALESCE(cc.update_dtime, TIMESTAMP '1970-01-01'),
                COALESCE(d.update_dtime, TIMESTAMP '1970-01-01')
            ) AS updated_at
        FROM {schema}.gp_master AS gm
        LEFT JOIN {schema}.ca_user_m AS cu
               ON cu.user_id = gm.emp_no
        LEFT JOIN {schema}.ca_code_c AS cc
               ON cc.gb_cd = 'GE11'
              AND cc.code  = gm.grade_cd
        LEFT JOIN {schema}.gp_dept AS d
               ON d.dept_cd = gm.dept_cd
        LEFT JOIN (
            SELECT DISTINCT ON (emp_no)
                   emp_no,
                   email
            FROM {schema}.v_gp_mail_user
            WHERE emp_no IS NOT NULL
              AND email IS NOT NULL
            ORDER BY emp_no, email
        ) AS mv
               ON mv.emp_no = cu.user_id
        WHERE cu.password IS NOT NULL
          AND gm.emp_no LIKE :emp_like
          AND gm.work_tp IN ('1', '3')
          AND gm.emp_tp IN ('1', '2')
          AND GREATEST(
                COALESCE(gm.update_dtime, TIMESTAMP '1970-01-01'),
                COALESCE(cu.update_dtime, TIMESTAMP '1970-01-01'),
                COALESCE(cc.update_dtime, TIMESTAMP '1970-01-01'),
                COALESCE(d.update_dtime, TIMESTAMP '1970-01-01')
          ) > :last_sync
    """


def sync_users_once() -> int:
    cfg = _load_config()
    if not cfg:
        logger.info("user sync skipped (disabled or missing source URL)")
        return 0

    source_engine = create_engine(cfg.source_url, pool_pre_ping=True)
    max_updated = None
    affected = 0

    with source_engine.connect() as source_conn, SessionLocal() as session:
        state = session.get(SyncState, SYNC_KEY)
        global _force_full_done
        if settings.sync_force_full and not _force_full_done:
            last_sync = datetime(1970, 1, 1, tzinfo=timezone.utc)
        else:
            last_sync = state.last_synced_at if state and state.last_synced_at else datetime(1970, 1, 1, tzinfo=timezone.utc)

        rows = source_conn.execute(
            text(_source_query(cfg.source_schema)),
            {"emp_like": f"{cfg.emp_no_prefix}%", "last_sync": last_sync},
        ).mappings()

        for row in rows:
            affected += 1
            updated_at = row.get("updated_at")
            if updated_at and (max_updated is None or updated_at > max_updated):
                max_updated = updated_at

            session.execute(
                text(
                    """
                    INSERT INTO users (
                        emp_no,
                        kor_name,
                        title,
                        department,
                        password,
                        email,
                        role,
                        is_verified,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        :emp_no,
                        :kor_name,
                        :title,
                        :department,
                        :password,
                        :email,
                        'requester',
                        TRUE,
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (emp_no) DO UPDATE SET
                        kor_name = EXCLUDED.kor_name,
                        title = EXCLUDED.title,
                        department = EXCLUDED.department,
                        password = EXCLUDED.password,
                        email = EXCLUDED.email,
                        updated_at = NOW()
                    """
                ),
                {
                    "emp_no": row.get("emp_no"),
                    "kor_name": row.get("kor_name"),
                    "title": row.get("title"),
                    "department": row.get("department"),
                    "password": row.get("password"),
                    "email": row.get("email"),
                },
            )

        if affected:
            if not state:
                state = SyncState(key=SYNC_KEY)
                session.add(state)
            state.last_synced_at = max_updated or datetime.now(timezone.utc)
        session.commit()

        if settings.sync_force_full:
            _force_full_done = True

    logger.info("user sync completed; rows=%d", affected)

    return affected


def _sync_loop() -> None:
    cfg = _load_config()
    if not cfg:
        return
    while True:
        try:
            sync_users_once()
        except Exception:
            logger.exception("user sync failed")
        time.sleep(max(10, cfg.interval_seconds))


def start_user_sync_thread() -> None:
    cfg = _load_config()
    if not cfg:
        return
    t = threading.Thread(target=_sync_loop, name="user-sync", daemon=True)
    t.start()
