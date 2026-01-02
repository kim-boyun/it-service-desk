from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Object Storage (NCP / S3 호환)
    OBJECT_STORAGE_ACCESS_KEY: str
    OBJECT_STORAGE_SECRET_KEY: str
    OBJECT_STORAGE_ENDPOINT: str
    OBJECT_STORAGE_BUCKET: str
    OBJECT_STORAGE_REGION: str = "kr-standard"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
