from pydantic import BaseModel, Field, field_validator


class LoginIn(BaseModel):
    employee_no: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("password")
    @classmethod
    def login_password_bytes_le_72(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be <= 72 bytes (bcrypt limit).")
        return v


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
