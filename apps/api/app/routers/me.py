from fastapi import APIRouter, Depends
from app.core.current_user import get_current_user
from app.models.user import User

router = APIRouter(tags=["me"])

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "employee_no": user.employee_no,
        "name": user.name,
        "title": user.title,
        "department": user.department,
        "role": user.role,
    }
