# IT Service Desk

학교 전산팀을 위한 헬프데스크 / 티켓 관리 시스템 (Backend 중심 PoC)

학생·교직원은 IT 이슈를 티켓으로 접수하고,
전산팀(Agent/Admin)은 티켓을 관리·처리·이력 추적할 수 있는 시스템입니다.

---

## Tech Stack

### Backend

* FastAPI
* SQLAlchemy 2.x
* Alembic
* PostgreSQL

### Infra / DevOps

* Docker
* Docker Compose
* NCP Object Storage (S3-compatible, Presigned URL)

### Auth

* JWT 기반 인증
* Role 기반 접근 제어 (RBAC)

---

## User Roles

Role | 설명
requester | 학생 / 교직원 (티켓 생성, 외부 댓글·첨부, 본인 티켓 조회)
agent | 전산팀 담당자 (티켓 처리, 내부 댓글·첨부)
admin | 전산팀 관리자 (agent 권한 포함)

---

## Project Structure

```
.
├─ infra/
│  ├─ docker-compose.yml
│  └─ .env
│
├─ apps/
│  ├─ api/
│  │  ├─ app/
│  │  │  ├─ core/
│  │  │  ├─ models/
│  │  │  ├─ routers/
│  │  │  └─ schemas/
│  │  ├─ alembic/
│  │  ├─ Dockerfile
│  │  └─ alembic.ini
│  │
│  └─ web/        (추후 프론트엔드)
│
├─ docs/
│  ├─ api/
│  └─ adr/
│
└─ README.md
```

---

## Run Locally (Backend)

### 1. 환경변수 준비

다음 파일을 생성하세요.

* infra/.env
* apps/api/.env

각 파일은 .env.example 파일을 참고해 작성합니다.

---

### 2. Docker Compose 실행

```
cd infra
docker compose up --build
```

실행 후 접속 주소:

* API 서버: [http://localhost:8000](http://localhost:8000)
* Swagger 문서: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Quick API Test (PowerShell)

### 로그인

```
Invoke-RestMethod -Uri http://localhost:8000/auth/login `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"test@kdischool.ac.kr","password":"kdi3299!@"}'
```

토큰 저장:

```
$token = $login.access_token
$hUser = @{ Authorization = "Bearer $token" }
```

---

### 내 정보 조회

```
Invoke-RestMethod -Uri http://localhost:8000/me `
  -Method GET `
  -Headers $hUser
```

---

### 티켓 생성

```
Invoke-RestMethod -Uri http://localhost:8000/tickets `
  -Method POST `
  -Headers $hUser `
  -ContentType "application/json" `
  -Body '{
    "title":"와이파이 불안정",
    "description":"기숙사 3층에서 연결이 자주 끊깁니다.",
    "priority":"high",
    "category":"network"
  }'
```

---

## File Upload Flow (Presigned URL)

1. API에서 presigned PUT URL 발급
2. 클라이언트가 Object Storage로 직접 업로드
3. 업로드 완료 후 메타데이터를 API에 등록
4. 다운로드 시 presigned GET URL 사용

대용량 파일도 서버 부하 없이 처리 가능합니다.

---

## Development Notes

* 개발 편의를 위해 서버 시작 시 seed 계정이 자동 생성됩니다.
* 운영 환경에서는 다음을 권장합니다.

  * Alembic migration 기반 스키마 관리
  * seed 로직 분리
  * Object Storage key 정책 고정
  * JWT 만료/회전 정책 적용
  * CORS 제한 강화

---

## License

Internal PoC / Educational Use

---
