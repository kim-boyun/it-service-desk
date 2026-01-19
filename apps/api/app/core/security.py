from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
from passlib.context import CryptContext
import jwt
from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)

def hash_password_sha256_b64(pw: str) -> str:
    digest = hashlib.sha256(pw.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")

def _is_sha256_b64(value: str) -> bool:
    try:
        raw = base64.b64decode(value, validate=True)
    except Exception:
        return False
    return len(raw) == 32

def verify_password(pw: str, hashed: str) -> bool:
    if not hashed:
        return False
    if hashed.startswith("$2"):
        return pwd_context.verify(pw, hashed)
    if _is_sha256_b64(hashed):
        return hmac.compare_digest(hash_password_sha256_b64(pw), hashed)
    try:
        return pwd_context.verify(pw, hashed)
    except Exception:
        return False

def create_access_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expires_min)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
