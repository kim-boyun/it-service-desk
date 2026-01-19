-- Initial schema for it_service_desk (compatible with current API models).

-- 0) users
CREATE TABLE IF NOT EXISTS users (
    emp_no VARCHAR(50) PRIMARY KEY,
    kor_name VARCHAR(100),
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('requester', 'agent', 'admin')),
    title VARCHAR(100),
    department VARCHAR(100),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1) ticket_categories
CREATE TABLE IF NOT EXISTS ticket_categories (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

-- 2) projects
CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    created_by_emp_no VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_projects_created_by
        FOREIGN KEY (created_by_emp_no)
        REFERENCES users(emp_no)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id BIGINT NOT NULL,
    user_emp_no VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (project_id, user_emp_no),

    CONSTRAINT fk_project_members_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_project_members_user
        FOREIGN KEY (user_emp_no)
        REFERENCES users(emp_no)
        ON DELETE CASCADE
);

-- 3) tickets
CREATE TABLE IF NOT EXISTS tickets (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    work_type VARCHAR(64) NULL,
    project_id BIGINT NULL,
    category_id BIGINT NULL,
    requester_emp_no VARCHAR(50) NOT NULL,
    assignee_emp_no VARCHAR(50) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_tickets_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_tickets_category
        FOREIGN KEY (category_id)
        REFERENCES ticket_categories(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_tickets_requester
        FOREIGN KEY (requester_emp_no)
        REFERENCES users(emp_no)
        ON DELETE RESTRICT,

    CONSTRAINT fk_tickets_assignee
        FOREIGN KEY (assignee_emp_no)
        REFERENCES users(emp_no)
        ON DELETE SET NULL
);

-- 3-1) draft_tickets
CREATE TABLE IF NOT EXISTS draft_tickets (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NULL,
    description TEXT NULL,
    priority VARCHAR(20) NULL,
    work_type VARCHAR(64) NULL,
    project_id BIGINT NULL,
    category_id BIGINT NULL,
    requester_emp_no VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_draft_tickets_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_draft_tickets_category
        FOREIGN KEY (category_id)
        REFERENCES ticket_categories(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_draft_tickets_requester
        FOREIGN KEY (requester_emp_no)
        REFERENCES users(emp_no)
        ON DELETE RESTRICT
);

-- 4) ticket_comments
CREATE TABLE IF NOT EXISTS ticket_comments (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    author_emp_no VARCHAR(50) NOT NULL,
    body TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ticket_comments_ticket
        FOREIGN KEY (ticket_id)
        REFERENCES tickets(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ticket_comments_author
        FOREIGN KEY (author_emp_no)
        REFERENCES users(emp_no)
        ON DELETE RESTRICT
);

-- 5) ticket_events
CREATE TABLE IF NOT EXISTS ticket_events (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    actor_emp_no VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    from_value TEXT,
    to_value TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ticket_events_ticket
        FOREIGN KEY (ticket_id)
        REFERENCES tickets(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ticket_events_actor
        FOREIGN KEY (actor_emp_no)
        REFERENCES users(emp_no)
        ON DELETE RESTRICT
);

-- 6) attachments
CREATE TABLE IF NOT EXISTS attachments (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NULL,
    comment_id BIGINT NULL,
    key VARCHAR(1024) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    size BIGINT,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_emp_no VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_attachments_ticket
        FOREIGN KEY (ticket_id)
        REFERENCES tickets(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_attachments_comment
        FOREIGN KEY (comment_id)
        REFERENCES ticket_comments(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_attachments_uploader
        FOREIGN KEY (uploaded_emp_no)
        REFERENCES users(emp_no)
        ON DELETE RESTRICT
);

-- 7) knowledge_items (notice/faq)
CREATE TABLE IF NOT EXISTS knowledge_items (
    id BIGSERIAL PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    category_id BIGINT NULL,
    author_emp_no VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_knowledge_items_category
        FOREIGN KEY (category_id)
        REFERENCES ticket_categories(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_knowledge_items_author
        FOREIGN KEY (author_emp_no)
        REFERENCES users(emp_no)
        ON DELETE RESTRICT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_status_updated_at ON tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_requester_emp_no ON tickets(requester_emp_no);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee_emp_no ON tickets(assignee_emp_no);
CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_draft_tickets_requester_emp_no ON draft_tickets(requester_emp_no);

CREATE INDEX IF NOT EXISTS idx_project_members_user_emp_no ON project_members(user_emp_no);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket_id ON attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_comment_id ON attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_attachments_key ON attachments(key);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_created_at ON knowledge_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_category_created_at ON knowledge_items(category_id, created_at DESC);
