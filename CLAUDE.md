# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IT Service Desk is a ticket management system for university/public institution IT teams, built with FastAPI backend and Next.js 16 frontend. The system handles ticket requests, assignments, comments, attachments, and email/app notifications.

**Tech Stack:**
- Backend: FastAPI + SQLAlchemy 2.x + Alembic + PostgreSQL
- Frontend: Next.js 16 + React 19 + Tailwind CSS 4 + React Query
- Storage: NCP Object Storage (S3-compatible) or local filesystem
- Email: SMTP integration for notifications

## Development Commands

### Docker Compose (Primary Development Method)

```bash
# Start all services (web + api + optional postgres)
cd infra
docker compose up --build

# Access points:
# - Web: http://localhost:3000
# - API: http://localhost:8000
# - Swagger docs: http://localhost:8000/docs

# Run database migrations
docker compose exec api alembic upgrade head

# Manual user sync from external MIS DB (if configured)
docker compose exec api python -c "from app.core.user_sync import sync_users_once; sync_users_once()"

# Stop services
docker compose down
```

### Backend (FastAPI)

```bash
cd apps/api

# Run API server directly (requires Python 3.10+)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Database migrations
alembic upgrade head                    # Apply all migrations
alembic downgrade -1                    # Rollback one migration
alembic revision --autogenerate -m "description"  # Generate new migration
```

### Frontend (Next.js)

```bash
cd apps/web

# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build
npm run start

# Linting
npm run lint
```

## Architecture

### Backend Structure

**Core Components:**
- `app/main.py`: FastAPI application setup, router registration, CORS, startup hooks
- `app/db.py`: SQLAlchemy engine and session management
- `app/core/`: Core configuration and utilities
  - `settings.py`: Environment-based configuration via Pydantic
  - `security.py`: JWT tokens, password hashing (bcrypt + legacy SHA256 support)
  - `storage.py`: Presigned URL generation for Object Storage (S3-compatible)
  - `user_sync.py`: Background thread for syncing users from external MIS database
  - `current_user.py`: FastAPI dependency for authenticated user extraction
  - `roles.py`: Role definitions (admin, agent, requester)
  - `tiptap.py`: HTML sanitization for Tiptap editor content

**Data Layer:**
- `app/models/`: SQLAlchemy ORM models (User, Ticket, Comment, Attachment, etc.)
- `app/schemas/`: Pydantic schemas for request/response validation
- `alembic/`: Database migration scripts

**API Layer:**
- `app/routers/`: API endpoint handlers organized by resource
  - Key routers: `tickets.py`, `comments.py`, `attachments.py`, `auth.py`, `admin_users.py`, `notices.py`, `faqs.py`, `ticket_categories.py`, `notifications.py`
- `app/services/`: Business logic services
  - `mail_service.py`: Background mail worker thread with queue
  - `mail_events.py`: Event-driven mail triggers (ticket created, assigned, commented, etc.)
  - `mail_notifications.py`: Email template composition
  - `assignment_service.py`: Ticket assignment logic

**File Upload Flow:**
1. Client requests presigned PUT URL from `/attachments/upload-url`
2. Client uploads directly to Object Storage using presigned URL
3. Client registers metadata with API via `/attachments`
4. Download uses presigned GET URLs via `/attachments/{id}/download`

**Authentication:**
- JWT tokens with configurable expiration (`JWT_EXPIRES_MIN`)
- Password storage: bcrypt for new users, legacy SHA256-base64 support for migrated users
- Token extraction via `Authorization: Bearer <token>` header
- Frontend stores token in localStorage

### Frontend Structure

**App Router Layout (Next.js 16):**
- `app/(auth)/`: Authentication routes (login)
- `app/(app)/`: Main application routes (requires auth)
  - `home/`: Dashboard with statistics and recent tickets
  - `tickets/`: Ticket list, detail, creation
  - `admin/`: Admin dashboard, user management, ticket management
  - `notices/`: Notice list and detail
  - `faq/`: FAQ list and detail
  - `layout.tsx`: Shared layout with Sidebar + TopBar

**Components:**
- `components/`: Shared components (Sidebar, TopBar, PageHeader, Pagination, etc.)
- `components/ui/`: Design system components (Button, Badge, Card, Input, Select, EmptyState, LoadingSpinner)
- `components/EditorToolbar.tsx`, `RichTextEditor.tsx`: Tiptap editor integration

**State Management:**
- React Query (TanStack Query) for server state
- `lib/api.ts`: API client wrapper with auth token injection
- `lib/auth.ts`: Token storage/retrieval helpers
- `lib/queryClient.ts`: React Query client configuration

**Design System:**
- `app/design-tokens.css`: CSS custom properties for colors, spacing, typography, shadows
- Tailwind CSS 4 for utility classes
- 8px-based spacing scale
- Color palette: Neutral (gray), Primary (teal), Success (green), Warning (orange), Danger (red), Info (blue)

### Key Environment Variables

**Backend (`apps/api/.env`):**
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`, `JWT_EXPIRES_MIN`: Authentication settings
- `STORAGE_BACKEND`: `local` or `object`
- `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`: S3-compatible storage config
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`: Email settings
- `APP_BASE_URL`: Base URL for email links
- `AUTO_DB_BOOTSTRAP`: Auto-create tables on startup (disable in production)
- `SYNC_ENABLED`, `SYNC_SOURCE_DATABASE_URL`: External user sync config

**Frontend (Docker Compose `infra/.env`):**
- `NEXT_PUBLIC_API_BASE_URL`: API base URL for client-side fetching

## Development Notes

### Database Migrations

- Use Alembic for schema changes
- Models are in `apps/api/app/models/`
- After model changes: `alembic revision --autogenerate -m "description"`
- Review generated migration before applying
- Apply with: `alembic upgrade head`

### User Roles and Permissions

- **requester**: Can create tickets, view own tickets, comment
- **agent**: Can view all tickets, assign tickets, comment, resolve
- **admin**: Full access including user management, ticket categories, notices, FAQs

Role checks are enforced in API routers using `current_user` dependency with role validation.

### Background Workers

Two daemon threads start automatically on API startup:
1. **User Sync Thread** (`user_sync.py`): Periodically syncs users from external MIS database if `SYNC_ENABLED=true`
2. **Mail Worker Thread** (`mail_service.py`): Processes queued email notifications asynchronously

### File Storage

- **Local mode** (`STORAGE_BACKEND=local`): Files stored in `/data/uploads/` (Docker volume)
- **Object mode** (`STORAGE_BACKEND=object`): Files stored in S3-compatible object storage using presigned URLs
- Frontend never handles files directly; uses presigned URLs for upload/download

### Authentication Flow

1. User submits email/password to `/auth/login`
2. API validates credentials, generates JWT token
3. Frontend stores token in localStorage
4. Subsequent requests include `Authorization: Bearer <token>`
5. API extracts user via `get_current_user` dependency
6. Token expiration handled via 401 responses → redirect to login

### Tiptap Editor Integration

- Used for rich text in tickets, comments, notices, FAQs
- Image upload via inline base64 or separate attachment flow
- HTML sanitization in backend via `core/tiptap.py`
- Frontend components: `RichTextEditor.tsx`, `TiptapViewer.tsx`

## Common Patterns

### Adding a New API Endpoint

1. Define Pydantic schema in `apps/api/app/schemas/`
2. Add route handler in appropriate `apps/api/app/routers/` file
3. Use `Depends(get_current_user)` for auth
4. Add business logic to `apps/api/app/services/` if complex
5. Register router in `apps/api/app/main.py` if new router file

### Adding a New Frontend Page

1. Create route in `apps/web/app/(app)/[route]/page.tsx`
2. Use `api()` from `lib/api.ts` for data fetching
3. Use React Query hooks for server state
4. Wrap mutations with error handling
5. Use design system components from `components/ui/`
6. Add navigation link to `components/Sidebar.tsx` if needed

### Adding a New Database Model

1. Create model in `apps/api/app/models/[name].py`
2. Import model in `apps/api/app/main.py` (after imports section)
3. Generate migration: `alembic revision --autogenerate -m "add [name] table"`
4. Review migration SQL, apply with `alembic upgrade head`

## Testing Environment

No test suite is currently configured. When adding tests:
- Backend: Use pytest with FastAPI TestClient
- Frontend: Use Jest + React Testing Library
- E2E: Use Playwright or Cypress
