from pydantic import BaseModel
import os

class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret")
    jwt_expires_min: int = int(os.getenv("JWT_EXPIRES_MIN", "120"))
    allowed_email_domains: list[str] = [
        d.strip().lower()
        for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "").split(",")
        if d.strip()
    ]
    sync_enabled: bool = os.getenv("SYNC_ENABLED", "false").lower() == "true"
    sync_interval_seconds: int = int(os.getenv("SYNC_INTERVAL_SECONDS", "300"))
    sync_source_database_url: str = os.getenv("SYNC_SOURCE_DATABASE_URL", "")
    sync_source_schema: str = os.getenv("SYNC_SOURCE_SCHEMA", "kdis")
    sync_emp_no_prefix: str = os.getenv("SYNC_EMP_NO_PREFIX", "3")
    sync_force_full: bool = os.getenv("SYNC_FORCE_FULL", "false").lower() == "true"
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "25"))
    smtp_from: str = os.getenv("SMTP_FROM", "")
    app_base_url: str = os.getenv("APP_BASE_URL", "http://localhost:3000")

settings = Settings()
