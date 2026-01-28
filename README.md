# IT Service Desk

대학/공공기관 전산팀용 **티켓(요청) 관리 시스템**입니다.  
요청 접수·처리·배정·댓글·첨부파일·알림(메일/앱)을 하나의 플로우로 제공하며, 요청자(requester)와 관리자(admin) 역할에 따라 화면·API가 구분됩니다.

---

## 1. 시스템 한눈에 보기

### 1.1 역할과 화면 흐름

| 역할 | 설명 | 대표 화면 |
|------|------|-----------|
| **요청자(requester)** | 전산 지원 요청을 등록·조회하는 사용자 | 작성(5단계 워크플로우), 처리 현황, 처리 완료, 사업 검토 |
| **관리자(admin)** | 요청 접수·배정·처리·통계를 담당하는 전산팀 | 대시보드, 사용자/카테고리/프로젝트 관리, 내 담당 요청, 모든 요청 |

- **인증**: JWT 기반. `POST /auth/login` 후 토큰을 헤더에 실어 API 호출.
- **라우팅**: `/` → `/home` 리다이렉트. `/home`이 메인 진입점이며, 비로그인 시 `/login`으로 보냄.

### 1.2 요청(티켓) 생명주기

```
[요청자] 작성(작업구분·제목·카테고리·본문·첨부) 
    → POST /tickets 
    → status: open
[관리자] 접수·배정·답변·상태 변경 
    → PATCH /tickets/{id}/status, assign, assignees, admin-meta
    → open → in_progress → resolved | closed
[요청자/관리자] 처리 완료·사업 검토 목록에서 조회
```

- **상태**: `open`(대기) → `in_progress`(진행) → `resolved`(완료) → `closed`(사업 검토).
- **작업 구분(work_type)**: 장애 / 요청 / 변경 / 기타.
- **카테고리**: 티켓 1건당 1개 이상 연결 가능(`ticket_categories` + `ticket_category_links`). 관리자가 카테고리를 생성·수정·삭제.

### 1.3 구성 요소 개요

- **Frontend**: Next.js(App Router). `(app)/` – 로그인 후 메인, `(auth)/` – 로그인.
- **Backend**: FastAPI. REST API + JWT, CORS, SQLAlchemy 2.x, Alembic.
- **DB**: PostgreSQL. 마이그레이션은 Alembic 전담. 시드는 **티켓 카테고리만** 적용(기본 사용자 생성 없음).
- **파일**: 로컬(`/data/uploads`) 또는 NCP/S3 호환 Object Storage. 업로드 시 Presigned URL 흐름 사용.

---

## 2. 프로젝트 구조 (전체)

```
it-service-desk/
├── .claude/                    # 에디터/도구용 설정
├── .gitignore
├── CLAUDE.md                   # AI 지원용 프로젝트 설명
├── README.md                   # 본 문서
│
├── apps/
│   ├── api/                    # FastAPI 백엔드
│   │   ├── .env.example
│   │   ├── alembic.ini
│   │   ├── requirement.txt
│   │   ├── Dockerfile
│   │   ├── alembic/
│   │   │   ├── env.py
│   │   │   ├── script.py.mako
│   │   │   └── versions/       # 마이그레이션 스크립트
│   │   │       ├── 5b8c63cdc40e_init.py
│   │   │       ├── c2d7b1a4e9f0_add_category_order_and_none_project.py
│   │   │       ├── e1a2b3c4d5f6_add_project_sort_order.py
│   │   │       ├── f2b3c4d5e6f7_add_ticket_requester_snapshot.py
│   │   │       ├── a1b2c3d4e5f6_remove_default_none_project.py
│   │   │       └── … (기타 revision)
│   │   └── app/
│   │       ├── main.py         # FastAPI 앱, 라우터 등록, CORS, startup(시드·user_sync·mail_worker)
│   │       ├── db.py           # 엔진·SessionLocal (config에서 DATABASE_URL)
│   │       ├── core/
│   │       │   ├── config.py       # DB/JWT/SYNC/SMTP/APP_BASE_URL 등 (os.getenv)
│   │       │   ├── settings.py     # STORAGE_BACKEND, AUTO_DB_BOOTSTRAP 등 (pydantic-settings)
│   │       │   ├── current_user.py # get_current_user (JWT 검증)
│   │       │   ├── security.py    # 비밀번호 해시 등
│   │       │   ├── roles.py       # 권한 체크
│   │       │   ├── seed.py        # seed_ticket_categories 만 호출 (admin/test 시드 없음)
│   │       │   ├── user_sync.py   # MIS DB → users 동기화 (선택)
│   │       │   ├── storage.py     # 로컬 스토리지
│   │       │   ├── object_storage.py
│   │       │   ├── ticket_rules.py
│   │       │   └── tiptap.py
│   │       ├── models/         # SQLAlchemy ORM
│   │       │   ├── user.py
│   │       │   ├── ticket.py, ticket_category.py
│   │       │   ├── ticket_assignees → tickets 라우터에서 사용
│   │       │   ├── comment.py, event.py, attachment.py
│   │       │   ├── project.py, project_member.py
│   │       │   ├── knowledge_item.py   # notices + faqs (kind로 구분)
│   │       │   ├── contact_assignment.py, contact_assignment_member.py
│   │       │   ├── mail_log.py, sync_state.py
│   │       │   └── …
│   │       ├── routers/
│   │       │   ├── auth.py          # POST /auth/login
│   │       │   ├── health.py        # GET /health
│   │       │   ├── me.py            # GET /me
│   │       │   ├── tickets.py       # 티켓 CRUD, status/assign/assignees/admin-meta, list, detail
│   │       │   ├── comments.py      # 댓글 목록/생성
│   │       │   ├── attachments.py  # 티켓·공지 첨부 업로드/다운로드URL/삭제
│   │       │   ├── uploads.py       # presign, images (에디터 이미지)
│   │       │   ├── ticket_categories.py
│   │       │   ├── projects.py      # 프로젝트 CRUD, reorder
│   │       │   ├── admin_users.py   # 관리자 목록, role 변경
│   │       │   ├── users.py         # GET /users/search
│   │       │   ├── notices.py      # 공지 CRUD (KnowledgeItem kind=notice)
│   │       │   ├── faqs.py          # FAQ CRUD (KnowledgeItem kind=faq)
│   │       │   ├── notifications.py # GET /notifications (알림 목록)
│   │       │   └── contact_assignments.py # 카테고리별 담당자 매핑
│   │       ├── schemas/        # Pydantic 입출력
│   │       └── services/
│   │           ├── mail_service.py   # SMTP 발송·큐
│   │           ├── mail_events.py
│   │           ├── mail_notifications.py
│   │           └── assignment_service.py
│   │
│   └── web/                    # Next.js 프론트엔드
│       ├── .dockerignore, .gitignore
│       ├── package.json, next.config.ts, tsconfig.json
│       ├── eslint.config.mjs, postcss.config.mjs
│       ├── Dockerfile
│       ├── app/
│       │   ├── layout.tsx          # 루트 레이아웃, globals.css, ThemeProvider
│       │   ├── page.tsx            # redirect("/home")
│       │   ├── design-tokens.css   # 라이트/다크 토큰
│       │   ├── globals.css         # 공통 스타일, tiptap 등
│       │   ├── (auth)/
│       │   │   └── login/page.tsx   # 로그인 폼
│       │   └── (app)/
│       │       ├── layout.tsx      # AuthGuard, AppShell(Sidebar+TopBar), QueryClient
│       │       ├── page.tsx        # (미사용 시 redirect 등)
│       │       ├── home/page.tsx   # 요청 작성 5단계 (welcome→work_type→title→category→description→review)
│       │       ├── tickets/
│       │       │   ├── page.tsx         # 처리 현황 목록
│       │       │   ├── resolved/page.tsx # 처리 완료
│       │       │   ├── review/page.tsx   # 사업 검토
│       │       │   ├── [id]/page.tsx     # 상세 + 댓글 + 첨부
│       │       │   ├── [id]/edit/page.tsx
│       │       │   └── [id]/comments/new/page.tsx
│       │       ├── notices/
│       │       │   ├── page.tsx, new/page.tsx
│       │       │   └── [id]/page.tsx    # 조회/수정(관리자)
│       │       ├── faq/
│       │       │   ├── page.tsx, new/page.tsx
│       │       │   └── [id]/edit/page.tsx
│       │       └── admin/
│       │           ├── page.tsx           # 대시보드(도넛·영역차트·일별/월별/전체 필터)
│       │           ├── users/page.tsx     # 사용자 관리
│       │           ├── manager/page.tsx  # 카테고리 관리
│       │           ├── project/page.tsx   # 프로젝트 관리
│       │           ├── tickets/page.tsx  # 내 담당 요청 (필터·검색·정렬)
│       │           ├── tickets/all/page.tsx # 모든 요청
│       │           └── tickets/[id]/page.tsx # 상세·배정·상태·답변·첨부
│       ├── components/
│       │   ├── AuthGuard.tsx, Sidebar.tsx, TopBar.tsx, PageHeader.tsx
│       │   ├── RichTextEditor.tsx, TiptapViewer.tsx, EditorToolbar.tsx, LinkModal.tsx
│       │   ├── ErrorDialog.tsx, Pagination.tsx, ProjectPickerModal.tsx
│       │   ├── ThemeToggle.tsx
│       │   └── ui/  (Badge, Button, Card, Input, Select, EmptyState, LoadingSpinner, StatCard)
│       ├── lib/
│       │   ├── api.ts, auth.ts, auth-context.tsx, queryClient.ts
│       │   ├── theme-context.tsx, tiptap.ts
│       │   ├── use-notifications.ts, use-ticket-categories.ts, use-unsaved-changes.ts
│       │   └── …
│       └── public/
│           ├── kdi-school-logo.png, kdis-desk-logo.png
│           └── …
│
├── docs/
│   ├── api/README.md      # API 엔드포인트 요약
│   ├── ARCHITECTURE.md    # 아키텍처·데이터 흐름 요약
│   ├── DB_RESET.md        # DB 완전 초기화(ID 1부터) 방법
│   └── TROUBLESHOOTING.md # 트러블슈팅
│
└── infra/
    ├── .env.example
    ├── docker-compose.yml   # web(3000), api(8000), volumes, env
    └── db/
        └── init.sql         # 스키마 참고용 (실제 스키마는 Alembic 버전 사용)
```

---

## 3. Tech Stack

| 구분 | 기술 |
|------|------|
| Backend | FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL |
| Frontend | Next.js(App Router), React 19, Tailwind CSS, TanStack Query |
| 스타일 | design-tokens.css(라이트/다크), CSS 변수, Tiptap 리치 에디터 |
| Infra | Docker / Docker Compose, NCP Object Storage(S3 호환), SMTP |

---

## 4. 도메인·로직 요약

### 4.1 사용자·권한

- **users**: `emp_no`(PK), `password`, `role`(requester | agent | admin), `kor_name`, `title`, `department` 등.
- **권한**:
  - `requester`: 본인 티켓만 조회·댓글; 공지/FAQ 조회; 관리자 전용 API 불가.
  - `admin`: 모든 티켓·댓글·첨부, 상태/배정/카테고리/프로젝트/공지/FAQ/사용자 관리, 대시보드, 알림 전체.

- **시드**: `AUTO_DB_BOOTSTRAP` 시 `seed_ticket_categories`만 실행. **admin/test 등 기본 계정은 생성하지 않음.**

### 4.2 요청(티켓)

- **tickets**: `title`, `description`(Tiptap JSON), `status`, `priority`, `category_id`, `work_type`, `project_id`, `requester_emp_no`, `assignee_emp_no`, 요청 시점 스냅샷(`requester_kor_name` 등).
- **다대다**: `ticket_category_links`(티켓–카테고리), `ticket_assignees`(티켓–담당자 복수).
- **이벤트**: `events`에 접수·상태변경·배정·답변 등 이력 저장. 상세 화면·알림에 활용.

### 4.3 카테고리·프로젝트

- **ticket_categories**: `code`, `name`, `description`, `sort_order`. 시드에서 MIS(학사)·MIS(일반행정)·포탈·두레이·VDI·IT서비스·인프라·기타 등 생성.
- **projects**: 이름·기간·`created_by_emp_no`, `sort_order`. “없음” 기본 프로젝트는 생성하지 않음. 관리자만 CRUD·순서 변경.

### 4.4 공지·FAQ

- **knowledge_items**: `kind`가 `notice`면 공지, `faq`면 FAQ. 제목·본문(Tiptap)·카테고리·첨부.
- **공지**: 목록/상세는 모두 조회 가능. 생성·수정·삭제는 관리자.
- **FAQ**: 목록/상세 조회. 생성·수정·삭제는 관리자.

### 4.5 첨부·업로드

- **attachments**: `ticket_id` 또는 `comment_id` 또는 `notice_id`에 연결. `key`(스토리지 경로), `filename`, `content_type`, `size`.
- **업로드 흐름**:
  1. 본문 이미지: `POST /uploads/images`(multipart) 또는 presign 후 클라이언트가 스토리지에 직접 업로드.
  2. 티켓/댓글/공지 첨부: `POST /tickets/{id}/attachments/upload`, `POST /notices/{id}/attachments/upload` 등으로 서버가 파일 수신 후 로컬 또는 Object Storage에 저장.
- **다운로드**: `GET /attachments/{id}/download-url`로 Presigned GET 또는 상대 URL 반환. **첨부파일은 항상 다운로드(저장) 동작**으로 처리하며, 이미지도 새 탭으로 열지 않음.

### 4.6 알림

- **notifications**: 이벤트 기반으로 생성. 요청 접수·상태 변경·요청자 댓글·담당자 댓글 등.
- **알림 API**: `GET /notifications`. 웹 TopBar 종 아이콘에서 드롭다운으로 최근 N건 표시, “모두 읽음” 처리.
- **메일**: SMTP 설정 시 동일 조건으로 이메일 발송(별도 워커).

### 4.7 담당자 매핑(Contact Assignments)

- **contact_assignments** / **contact_assignment_members**: 카테고리별 담당자(emp_no) 매핑. 관리자가 설정하며, 배정·알림 정책에서 참고할 수 있음.

---

## 5. 웹 라우트·화면 역할

| 경로 | 역할 | 설명 |
|------|------|------|
| `/`, `/home` | 공통 | `/`는 `/home` 리다이렉트. `/home`은 5단계 요청 작성(작업구분→제목→카테고리→본문→검토). |
| `/login` | 공통 | 로그인 폼. |
| `/notices`, `/notices/new`, `/notices/[id]` | 공통/관리자 | 공지 목록·상세. 관리자는 작성·수정. |
| `/faq`, `/faq/new`, `/faq/[id]/edit` | 공통/관리자 | FAQ 목록·상세·관리자 편집. |
| `/tickets` | 공통 | 처리 현황(내 요청 목록). |
| `/tickets/resolved`, `/tickets/review` | 공통 | 처리 완료·사업 검토 목록. |
| `/tickets/[id]`, `/tickets/[id]/edit`, `/tickets/[id]/comments/new` | 공통 | 요청 상세·수정·답변 등록. |
| `/admin` | admin | 대시보드(도넛·영역차트, 일/월/전체 필터). |
| `/admin/users` | admin | 사용자 목록·역할 변경. |
| `/admin/manager` | admin | 카테고리 CRUD. |
| `/admin/project` | admin | 프로젝트 CRUD·순서. |
| `/admin/tickets` | admin | 내 담당 요청(필터: 전체/대기·진행/완료/사업검토, 검색, 기본 정렬: 상태→작성일). |
| `/admin/tickets/all` | admin | 전체 요청(동일 필터·검색·정렬). |
| `/admin/tickets/[id]` | admin | 요청 상세·배정·상태·메타·답변·첨부. |

---

## 6. API 라우터 요약

| prefix | 파일 | 주요 기능 |
|--------|------|-----------|
| (없음) | health | `GET /health` |
| `/auth` | auth | `POST /auth/login` |
| `/me` | me | `GET /me` (현재 사용자) |
| `/tickets` | tickets | CRUD, `PATCH …/status`, `…/assign`, `…/assignees`, `…/admin-meta`, `GET …/detail`, `…/events` |
| `/tickets/…/comments` | comments | `GET/POST /tickets/{id}/comments` |
| `/uploads` | uploads | `POST /presign`, `POST /images` |
| `/attachments` | attachments | 티켓/공지 첨부 업로드, `GET …/download-url`, `GET …/download`, `DELETE …` |
| `/ticket-categories` | ticket_categories | CRUD |
| `/projects` | projects | CRUD, `POST /reorder` |
| `/admin/users` | admin_users | `GET`, `PATCH …/{emp_no}/role` |
| `/users` | users | `GET /search` |
| `/notices` | notices | CRUD (KnowledgeItem kind=notice) |
| `/faqs` | faqs | CRUD (KnowledgeItem kind=faq) |
| `/notifications` | notifications | `GET /notifications` |
| `/contact-assignments` | contact_assignments | `GET`, `PUT` (관리자) |

상세 경로·스키마는 `docs/api/README.md`와 Swagger(`/docs`) 참고.

---

## 7. 환경 변수

### 7.1 infra (Docker Compose)

- `NEXT_PUBLIC_API_BASE_URL`: 웹이 호출할 API 기본 URL (예: `http://localhost:8000`).
- Compose가 `infra/.env`를 읽어 `web`·`api` 컨테이너에 전달. 실제 DB/스토리지/SMTP 등은 `api`용 env와 동일하게 두거나 `infra/.env`에 모아 두어도 됨.

### 7.2 apps/api

- **DB**: `DATABASE_URL` (PostgreSQL, 예: `postgresql+psycopg://…`).
- **인증**: `JWT_SECRET`, `JWT_EXPIRES_MIN`.
- **CORS**: `CORS_ORIGINS` (쉼표 구분).
- **스토리지**: `STORAGE_BACKEND`=`local`|`object`, `LOCAL_UPLOAD_ROOT`, `OBJECT_STORAGE_*`.
- **안전**: `AUTO_DB_BOOTSTRAP`=`false` 권장(테이블/시드는 Alembic·수동).
- **동기화**: `SYNC_ENABLED`, `SYNC_SOURCE_DATABASE_URL`, `SYNC_SOURCE_SCHEMA`, `SYNC_EMP_NO_PREFIX` 등.
- **메일**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `APP_BASE_URL`.

템플릿: `apps/api/.env.example`, `infra/.env.example`.

---

## 8. 로컬 실행·배포

### 8.1 Docker Compose (infra)

```bash
cd infra
# .env 파일 준비 (또는 .env.example 복사 후 수정)
docker compose up --build
```

- Web: http://localhost:3000  
- API: http://localhost:8000  
- Swagger: http://localhost:8000/docs  

### 8.2 마이그레이션

```bash
cd infra
docker compose exec api alembic upgrade head
```

초기 스키마는 Alembic으로 적용. `infra/db/init.sql`은 참고용이며, 실제 스키마는 `apps/api/alembic/versions/` 기준.

### 8.3 DB 완전 초기화 (ID 1부터)

DB를 비우고 시퀀스를 1부터 다시 쓰려면 `docs/DB_RESET.md`를 따르면 됩니다. (DROP/CREATE DB 후 `alembic upgrade head` 등.)

---

## 9. 참고 문서

- **docs/api/README.md**: API 엔드포인트 한눈에 보기.
- **docs/ARCHITECTURE.md**: 컴포넌트·데이터 흐름·권한·테이블 개념.
- **docs/DB_RESET.md**: DB 완전 초기화 절차.
- **docs/TROUBLESHOOTING.md**: 자주 묻는 오류·조치.

---

## 10. License

Internal / Educational Use.
