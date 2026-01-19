from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Storage
    STORAGE_BACKEND: str = "local"  # local | object
    LOCAL_UPLOAD_ROOT: str = "/data/uploads"

    # Object Storage (NCP / S3 compatible)
    OBJECT_STORAGE_ENDPOINT: str | None = None
    OBJECT_STORAGE_BUCKET: str | None = None
    OBJECT_STORAGE_PUBLIC_BASE_URL: str | None = None
    # DB bootstrap (dev only)
    AUTO_DB_BOOTSTRAP: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
