-- DBeaver에서 실행: 모든 테이블 컬럼에 코멘트 등록 (스키마: ticket)

-- 1. users
COMMENT ON COLUMN ticket.users.emp_no IS '사번 (PK)';
COMMENT ON COLUMN ticket.users.kor_name IS '한글 이름';
COMMENT ON COLUMN ticket.users.eng_name IS '영문 이름';
COMMENT ON COLUMN ticket.users.password IS '비밀번호 해시';
COMMENT ON COLUMN ticket.users.role IS '역할: requester(요청자), admin(관리자)';
COMMENT ON COLUMN ticket.users.title IS '직급';
COMMENT ON COLUMN ticket.users.department IS '부서';
COMMENT ON COLUMN ticket.users.email IS '이메일';
COMMENT ON COLUMN ticket.users.is_verified IS '이메일 인증 여부';
COMMENT ON COLUMN ticket.users.created_at IS '생성 시각';
COMMENT ON COLUMN ticket.users.updated_at IS '수정 시각';

-- 2. ticket_categories
COMMENT ON COLUMN ticket.ticket_categories.id IS '카테고리 ID (PK)';
COMMENT ON COLUMN ticket.ticket_categories.code IS '카테고리 코드 (고유)';
COMMENT ON COLUMN ticket.ticket_categories.name IS '카테고리명';
COMMENT ON COLUMN ticket.ticket_categories.description IS '설명';
COMMENT ON COLUMN ticket.ticket_categories.sort_order IS '정렬 순서 (작을수록 위)';

-- 3. projects
COMMENT ON COLUMN ticket.projects.id IS '프로젝트 ID (PK)';
COMMENT ON COLUMN ticket.projects.name IS '프로젝트명';
COMMENT ON COLUMN ticket.projects.start_date IS '시작일';
COMMENT ON COLUMN ticket.projects.end_date IS '종료일';
COMMENT ON COLUMN ticket.projects.created_by_emp_no IS '생성자 사번';
COMMENT ON COLUMN ticket.projects.created_at IS '생성 시각';
COMMENT ON COLUMN ticket.projects.sort_order IS '노출 순서 (작을수록 위)';

-- 4. project_members
COMMENT ON COLUMN ticket.project_members.project_id IS '프로젝트 ID (PK)';
COMMENT ON COLUMN ticket.project_members.user_emp_no IS '사용자 사번 (PK)';
COMMENT ON COLUMN ticket.project_members.created_at IS '등록 시각';

-- 5. knowledge_items
COMMENT ON COLUMN ticket.knowledge_items.id IS 'ID (PK)';
COMMENT ON COLUMN ticket.knowledge_items.kind IS '종류: notice(공지), faq(FAQ)';
COMMENT ON COLUMN ticket.knowledge_items.title IS '제목';
COMMENT ON COLUMN ticket.knowledge_items.body IS '본문';
COMMENT ON COLUMN ticket.knowledge_items.category_id IS '카테고리 ID';
COMMENT ON COLUMN ticket.knowledge_items.author_emp_no IS '작성자 사번';
COMMENT ON COLUMN ticket.knowledge_items.created_at IS '생성 시각';
COMMENT ON COLUMN ticket.knowledge_items.updated_at IS '수정 시각';

-- 6. tickets
COMMENT ON COLUMN ticket.tickets.id IS '티켓 ID (PK)';
COMMENT ON COLUMN ticket.tickets.title IS '제목';
COMMENT ON COLUMN ticket.tickets.description IS '내용';
COMMENT ON COLUMN ticket.tickets.status IS '상태: open, in_progress, resolved, closed';
COMMENT ON COLUMN ticket.tickets.priority IS '우선순위';
COMMENT ON COLUMN ticket.tickets.category_id IS '카테고리 ID (단일, 레거시)';
COMMENT ON COLUMN ticket.tickets.work_type IS '업무 유형';
COMMENT ON COLUMN ticket.tickets.project_id IS '프로젝트 ID';
COMMENT ON COLUMN ticket.tickets.requester_emp_no IS '요청자 사번';
COMMENT ON COLUMN ticket.tickets.assignee_emp_no IS '담당자 사번 (단일, 레거시)';
COMMENT ON COLUMN ticket.tickets.requester_kor_name IS '요청 시점 요청자 한글명 스냅샷';
COMMENT ON COLUMN ticket.tickets.requester_title IS '요청 시점 요청자 직급 스냅샷';
COMMENT ON COLUMN ticket.tickets.requester_department IS '요청 시점 요청자 부서 스냅샷';
COMMENT ON COLUMN ticket.tickets.created_at IS '생성 시각';
COMMENT ON COLUMN ticket.tickets.updated_at IS '수정 시각';
COMMENT ON COLUMN ticket.tickets.resolved_at IS '처리완료 시각 (status=resolved 된 시점)';
COMMENT ON COLUMN ticket.tickets.closed_at IS '사업검토 시각 (status=closed 된 시점)';
COMMENT ON COLUMN ticket.tickets.reopen_count IS '재요청 횟수';

-- 7. ticket_reopens
COMMENT ON COLUMN ticket.ticket_reopens.id IS '재요청 ID (PK)';
COMMENT ON COLUMN ticket.ticket_reopens.ticket_id IS '티켓 ID';
COMMENT ON COLUMN ticket.ticket_reopens.description IS '재요청 사유/설명';
COMMENT ON COLUMN ticket.ticket_reopens.requester_emp_no IS '재요청한 요청자 사번';
COMMENT ON COLUMN ticket.ticket_reopens.created_at IS '재요청 시각';

-- 8. ticket_category_links
COMMENT ON COLUMN ticket.ticket_category_links.ticket_id IS '티켓 ID (PK)';
COMMENT ON COLUMN ticket.ticket_category_links.category_id IS '카테고리 ID (PK)';
COMMENT ON COLUMN ticket.ticket_category_links.created_at IS '연결 시각';

-- 9. ticket_assignees
COMMENT ON COLUMN ticket.ticket_assignees.ticket_id IS '티켓 ID (PK)';
COMMENT ON COLUMN ticket.ticket_assignees.emp_no IS '담당자 사번 (PK)';
COMMENT ON COLUMN ticket.ticket_assignees.created_at IS '등록 시각';

-- 10. ticket_comments
COMMENT ON COLUMN ticket.ticket_comments.id IS '댓글 ID (PK)';
COMMENT ON COLUMN ticket.ticket_comments.ticket_id IS '티켓 ID';
COMMENT ON COLUMN ticket.ticket_comments.author_emp_no IS '작성자 사번';
COMMENT ON COLUMN ticket.ticket_comments.title IS '댓글 제목';
COMMENT ON COLUMN ticket.ticket_comments.body IS '댓글 본문';
COMMENT ON COLUMN ticket.ticket_comments.created_at IS '작성 시각';

-- 11. ticket_events
COMMENT ON COLUMN ticket.ticket_events.id IS '이벤트 ID (PK)';
COMMENT ON COLUMN ticket.ticket_events.ticket_id IS '티켓 ID';
COMMENT ON COLUMN ticket.ticket_events.actor_emp_no IS '수행자 사번';
COMMENT ON COLUMN ticket.ticket_events.type IS '이벤트 유형 (예: status_changed, assigned)';
COMMENT ON COLUMN ticket.ticket_events.from_value IS '변경 전 값';
COMMENT ON COLUMN ticket.ticket_events.to_value IS '변경 후 값';
COMMENT ON COLUMN ticket.ticket_events.note IS '메모';
COMMENT ON COLUMN ticket.ticket_events.created_at IS '발생 시각';

-- 12. attachments
COMMENT ON COLUMN ticket.attachments.id IS '첨부 ID (PK)';
COMMENT ON COLUMN ticket.attachments.key IS '객체 스토리지 키';
COMMENT ON COLUMN ticket.attachments.filename IS '파일명';
COMMENT ON COLUMN ticket.attachments.content_type IS 'MIME 타입';
COMMENT ON COLUMN ticket.attachments.size IS '파일 크기(바이트)';
COMMENT ON COLUMN ticket.attachments.ticket_id IS '연결된 티켓 ID (nullable)';
COMMENT ON COLUMN ticket.attachments.comment_id IS '연결된 댓글 ID (nullable)';
COMMENT ON COLUMN ticket.attachments.notice_id IS '연결된 공지/FAQ ID (nullable)';
COMMENT ON COLUMN ticket.attachments.uploaded_emp_no IS '업로드한 사용자 사번';
COMMENT ON COLUMN ticket.attachments.created_at IS '업로드 시각';

-- 13. contact_assignment_members
COMMENT ON COLUMN ticket.contact_assignment_members.id IS 'ID (PK)';
COMMENT ON COLUMN ticket.contact_assignment_members.category_id IS '카테고리 ID';
COMMENT ON COLUMN ticket.contact_assignment_members.emp_no IS '멤버 사번';
COMMENT ON COLUMN ticket.contact_assignment_members.created_at IS '등록 시각';
COMMENT ON COLUMN ticket.contact_assignment_members.updated_at IS '수정 시각';

-- 14. mail_logs
COMMENT ON COLUMN ticket.mail_logs.id IS '로그 ID (PK)';
COMMENT ON COLUMN ticket.mail_logs.event_key IS '이벤트 고유 키';
COMMENT ON COLUMN ticket.mail_logs.event_type IS '이벤트 유형';
COMMENT ON COLUMN ticket.mail_logs.ticket_id IS '관련 티켓 ID (nullable)';
COMMENT ON COLUMN ticket.mail_logs.recipient_emp_no IS '수신자 사번';
COMMENT ON COLUMN ticket.mail_logs.recipient_email IS '수신 이메일';
COMMENT ON COLUMN ticket.mail_logs.subject IS '메일 제목';
COMMENT ON COLUMN ticket.mail_logs.body_text IS '본문(텍스트)';
COMMENT ON COLUMN ticket.mail_logs.body_html IS '본문(HTML)';
COMMENT ON COLUMN ticket.mail_logs.status IS '발송 상태 (예: pending, sent)';
COMMENT ON COLUMN ticket.mail_logs.attempts IS '발송 시도 횟수';
COMMENT ON COLUMN ticket.mail_logs.last_attempt_at IS '마지막 시도 시각';
COMMENT ON COLUMN ticket.mail_logs.next_attempt_at IS '다음 시도 예정 시각';
COMMENT ON COLUMN ticket.mail_logs.error_message IS '오류 메시지';
COMMENT ON COLUMN ticket.mail_logs.created_at IS '생성 시각';
COMMENT ON COLUMN ticket.mail_logs.updated_at IS '수정 시각';

-- 15. sync_state
COMMENT ON COLUMN ticket.sync_state.key IS '상태 키 (PK)';
COMMENT ON COLUMN ticket.sync_state.last_synced_at IS '마지막 동기화 시각';
COMMENT ON COLUMN ticket.sync_state.updated_at IS '수정 시각';
