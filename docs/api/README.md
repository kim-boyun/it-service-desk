## 4) `docs/api/README.md` (API 한눈 정리)
`docs/api` 폴더가 이미 있으니 여기 넣자.

**파일:** `docs/api/README.md`
```md
# API Endpoints

Base URL: `http://localhost:8000`

## Auth
- `POST /auth/register` (학교메일 도메인 정책 적용 가능)
- `POST /auth/login`
- `GET /me`

## Tickets
- `POST /tickets` (requester)
- `GET /tickets` (requester: 내것만 / staff: 전체 + 필터 + 페이지네이션)
- `GET /tickets/{ticket_id}`
- `GET /tickets/{ticket_id}/detail` (ticket + comments + events + attachments)
- `PATCH /tickets/{ticket_id}/status` (agent/admin)
- `PATCH /tickets/{ticket_id}/assign` (agent/admin)
- `GET /tickets/{ticket_id}/events` (requester는 본인 티켓만)

## Comments
- `POST /tickets/{ticket_id}/comments`
- `GET /tickets/{ticket_id}/comments`
- 내부 댓글(`is_internal=true`)은 staff만 작성/조회 가능 정책 적용

## Uploads / Attachments
- `POST /uploads/presign` (presigned PUT URL 발급)
- `POST /tickets/{ticket_id}/attachments` (업로드 완료 후 메타데이터 등록)
- `GET /attachments/{attachment_id}/download-url`
- `DELETE /attachments/{attachment_id}` (agent/admin)`
```