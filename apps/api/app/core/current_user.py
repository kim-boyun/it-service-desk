from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db import get_session
from ..models.user import User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)

def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_token(creds.credentials)
        emp_no = str(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = session.scalar(select(User).where(User.emp_no == emp_no))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
