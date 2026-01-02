# Architecture

## Components
- Frontend (to-be): Web UI (학생/교직원, 전산팀)
- Backend: FastAPI (apps/api)
- DB: PostgreSQL (infra/db)
- Object Storage: NCP Object Storage (S3 compatible)

## Data Flow
### Ticket CRUD
Frontend → API → DB

### File Upload (Presigned)
1) Frontend → API: `POST /uploads/presign` (key + presigned url)
2) Frontend → Object Storage: PUT 업로드 (presigned url 사용)
3) Frontend → API: `POST /tickets/{id}/attachments` (key/filename/content_type/size 저장)
4) 조회 시 API는 `GET /attachments/{id}/download-url`로 presigned GET 발급

## Authorization (Roles)
- requester: 본인 티켓만 접근 + 내부자료(is_internal) 접근 불가
- agent/admin: 전체 접근 가능, 상태/배정/내부댓글/첨부 관리 가능

## Tables (concept)
- users(id, email, password_hash, role, is_verified, created_at)
- tickets(id, title, description, status, priority, category, requester_id, assignee_id, created_at)
- comments(id, ticket_id, author_id, body, is_internal, created_at)
- ticket_events(id, ticket_id, actor_id, type, from_value, to_value, note, created_at)
- attachments(id, key, filename, content_type, size, ticket_id, comment_id, is_internal, uploaded_by, created_at)

## Dev → Prod Notes
- DEV에서는 seed 및 create_all을 사용(편의)
- PROD에서는 Alembic migration 기반으로 전환 권장
