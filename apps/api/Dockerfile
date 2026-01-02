FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi==0.115.* \
    "uvicorn[standard]==0.30.*" \
    sqlalchemy==2.0.* \
    "psycopg[binary]==3.2.*" \
    pydantic==2.* \
    email-validator==2.* \
    passlib==1.7.* \
    bcrypt==3.2.2 \
    PyJWT==2.* \
    alembic==1.13.*\
    boto3==1.*\
    botocore==1.*\
    python-multipart==0.0.*\
    pydantic-settings


# app/ + alembic/ + alembic.ini까지 모두 포함되도록
COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
