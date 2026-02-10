from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import logging
import re
import threading
import time

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db import SessionLocal
from ..models.sync_state import SyncState


SYNC_KEY_PASSWORD = "users_password_sync"
SYNC_KEY_PROFILE = "users_profile_sync"
KST = ZoneInfo("Asia/Seoul")
_force_full_done = False
logger = logging.getLogger(__name__)


@dataclass
class SyncConfig:
    source_url: str
    source_schema: str
    emp_no_prefix: str
    password_interval_seconds: int
    full_at_hour_kst: int
    full_at_minute_kst: int


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
        password_interval_seconds=max(60, settings.sync_password_interval_seconds),
        full_at_hour_kst=settings.sync_full_at_hour_kst,
        full_at_minute_kst=settings.sync_full_at_minute_kst,
    )


def _source_query_password(schema: str) -> str:
    """Rows from ca_user_m (and gp_master for filter) where password was updated after last_sync."""
    return f"""
        SELECT cu.user_id AS emp_no, cu.password, cu.update_dtime AS updated_at
        FROM {schema}.ca_user_m AS cu
        JOIN {schema}.gp_master AS gm ON gm.emp_no = cu.user_id
        WHERE gm.emp_no LIKE :emp_like
          AND gm.work_tp IN ('1', '3')
          AND gm.emp_tp IN ('1', '2')
          AND cu.password IS NOT NULL
          AND cu.update_dtime > :last_sync
    """


def _source_query_profile(schema: str) -> str:
    """Full profile (name, title, dept, email); password in SELECT for INSERT of new users only."""
    return f"""
        SELECT
            gm.emp_no,
            gm.kor_name,
            gm.eng_name,
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


def sync_password_once() -> int:
    """Sync only password from source; runs every sync_password_interval_seconds."""
    cfg = _load_config()
    if not cfg:
        logger.info("user password sync skipped (disabled or missing source URL)")
        return 0

    source_engine = create_engine(cfg.source_url, pool_pre_ping=True)
    max_updated = None
    affected = 0

    with source_engine.connect() as source_conn, SessionLocal() as session:
        state = session.get(SyncState, SYNC_KEY_PASSWORD)
        last_sync = state.last_synced_at if state and state.last_synced_at else datetime(1970, 1, 1, tzinfo=timezone.utc)

        rows = source_conn.execute(
            text(_source_query_password(cfg.source_schema)),
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
                    UPDATE users
                    SET password = :password, updated_at = NOW()
                    WHERE emp_no = :emp_no
                    """
                ),
                {"emp_no": row.get("emp_no"), "password": row.get("password")},
            )

        if affected:
            if not state:
                state = SyncState(key=SYNC_KEY_PASSWORD)
                session.add(state)
            state.last_synced_at = max_updated or datetime.now(timezone.utc)
        session.commit()

    if affected:
        logger.info("user password sync completed; rows=%d", affected)
    return affected


def sync_profile_once() -> int:
    """Sync profile (name, title, department, email) only; intended to run once per day at midnight KST."""
    cfg = _load_config()
    if not cfg:
        logger.info("user profile sync skipped (disabled or missing source URL)")
        return 0

    source_engine = create_engine(cfg.source_url, pool_pre_ping=True)
    max_updated = None
    affected = 0

    with source_engine.connect() as source_conn, SessionLocal() as session:
        state = session.get(SyncState, SYNC_KEY_PROFILE)
        global _force_full_done
        if settings.sync_force_full and not _force_full_done:
            last_sync = datetime(1970, 1, 1, tzinfo=timezone.utc)
        else:
            last_sync = (
                state.last_synced_at
                if state and state.last_synced_at
                else datetime(1970, 1, 1, tzinfo=timezone.utc)
            )

        rows = source_conn.execute(
            text(_source_query_profile(cfg.source_schema)),
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
                        eng_name,
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
                        :eng_name,
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
                        eng_name = EXCLUDED.eng_name,
                        title = EXCLUDED.title,
                        department = EXCLUDED.department,
                        email = EXCLUDED.email,
                        updated_at = NOW()
                    """
                ),
                {
                    "emp_no": row.get("emp_no"),
                    "kor_name": row.get("kor_name"),
                    "eng_name": row.get("eng_name"),
                    "title": row.get("title"),
                    "department": row.get("department"),
                    "password": row.get("password"),
                    "email": row.get("email"),
                },
            )

        if affected:
            if not state:
                state = SyncState(key=SYNC_KEY_PROFILE)
                session.add(state)
            state.last_synced_at = max_updated or datetime.now(timezone.utc)
        session.commit()

        if settings.sync_force_full:
            _force_full_done = True

    logger.info("user profile sync completed; rows=%d", affected)
    return affected


def _is_midnight_kst(cfg: SyncConfig) -> bool:
    now = datetime.now(KST)
    return now.hour == cfg.full_at_hour_kst and now.minute == cfg.full_at_minute_kst


def _sync_loop() -> None:
    cfg = _load_config()
    if not cfg:
        return

    last_password_run = 0.0
    last_profile_date_kst: datetime | None = None
    check_interval = 60

    while True:
        try:
            now_ts = time.time()
            now_kst = datetime.now(KST)

            # Password: every sync_password_interval_seconds
            if now_ts - last_password_run >= cfg.password_interval_seconds:
                sync_password_once()
                last_password_run = now_ts

            # Profile: once per day when we're in the configured hour (KST)
            if now_kst.hour == cfg.full_at_hour_kst and (
                last_profile_date_kst is None or now_kst.date() > last_profile_date_kst.date()
            ):
                sync_profile_once()
                last_profile_date_kst = now_kst
        except Exception:
            logger.exception("user sync failed")

        time.sleep(check_interval)


def start_user_sync_thread() -> None:
    cfg = _load_config()
    if not cfg:
        return
    t = threading.Thread(target=_sync_loop, name="user-sync", daemon=True)
    t.start()
    logger.info(
        "user sync started: password every %ds, profile at %02d:%02d KST",
        cfg.password_interval_seconds,
        cfg.full_at_hour_kst,
        cfg.full_at_minute_kst,
    )
