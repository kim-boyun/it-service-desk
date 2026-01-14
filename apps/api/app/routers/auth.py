from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..schemas.auth import LoginIn, TokenOut
from ..core.security import verify_password, create_access_token
from ..models.user import User
from ..db import get_session

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, session: Session = Depends(get_session)):
    user = session.scalar(select(User).where(User.employee_no == payload.employee_no))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Account not verified.")
    return TokenOut(access_token=create_access_token(str(user.id)))
