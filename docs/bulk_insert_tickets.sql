-- tickets 테이블 80개 대량 INSERT (스키마: ticket)
-- requester_emp_no 는 ticket.users 에 있는 emp_no 를 자동으로 사용합니다.

INSERT INTO ticket.tickets (
  title,
  description,
  status,
  priority,
  category_id,
  work_type,
  project_id,
  requester_emp_no,
  assignee_emp_no,
  requester_kor_name,
  requester_title,
  requester_department,
  created_at,
  updated_at
)
SELECT
  '테스트 요청 ' || n || ' - ' || (ARRAY['로그인 오류', '비밀번호 초기화', '프린터 연결', '메일 설정', '권한 문의', '시스템 접속', '재택 환경 설정', '회의실 예약'])[1 + (n % 8)],
  '요청 내용 ' || n || E'입니다.\n상세 설명을 여기에 기록합니다. 필요 시 추가 문의 드리겠습니다.',
  (ARRAY['open', 'in_progress', 'resolved', 'closed'])[1 + (n % 4)],
  (ARRAY['low', 'medium', 'high'])[1 + (n % 3)],
  (SELECT id FROM ticket.ticket_categories ORDER BY random() LIMIT 1),
  (ARRAY['일반문의', '장애신고', '개선요청', '기타'])[1 + (n % 4)],
  NULL,
  (SELECT emp_no FROM ticket.users LIMIT 1),
  NULL,
  (ARRAY['김철수', '이영희', '박지훈', '정민수', '최수진', '한동훈', '윤서연', '임재현'])[1 + (n % 8)],
  (ARRAY['전문원', '선임전문원', '책임전문원', '인턴'])[1 + (n % 4)],
  (ARRAY['인사팀', '재무팀', '기획팀', '전산2팀', '대외협력팀', '도서2팀', '전략기획팀', '총장실'])[1 + (n % 8)],
  date '2026-01-01' + (floor(random() * 31)::int) * interval '1 day' + (random() * 86400)::int * interval '1 second',
  date '2026-01-01' + (floor(random() * 31)::int) * interval '1 day' + (random() * 86400)::int * interval '1 second'
FROM generate_series(1, 80) AS n;
