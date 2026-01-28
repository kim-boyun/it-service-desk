# 알림 조건 정리 (SMTP 메일 + 인앱 알림)

현재 **SMTP 메일 발송 조건**과 **인앱 알림(탑바 알림) 조건**을 요청자·관리자 기준으로 정리한 문서입니다.

---

## 1. 요청자 기준

### 1-1. SMTP 메일 발송 조건

| 조건 | 설명 | 발송 시점 |
|------|------|-----------|
| **요청 접수** | 본인이 신청한 요청이 접수된 경우 | 티켓 생성 완료 시 (`POST /tickets`) |
| **상태 변경** | 요청 상태가 **진행 / 완료 / 사업 검토**로 바뀐 경우 | 티켓 상태 PATCH 시 `to_value in ("resolved", "closed", "in_progress")` |
| **담당자 답변** | 담당자(관리자)가 답변을 등록한 경우 | 댓글 등록 시 `payload.notify_email == true` 이고, **작성자 역할이 admin**일 때 |

**참고**
- 담당자 변경(`notify_requester_assignee_changed`)은 **정의만 있고 호출处 없음** → 현재 SMTP로 발송되지 않음.

---

### 1-2. 인앱 알림 조건 (탑바 알림)

| 조건 | 설명 |
|------|------|
| **요청 접수** | 내가 요청자(`requester_emp_no`)인 티켓의 `ticket_created` 이벤트 |
| **상태 변경** | 내가 요청자인 티켓의 `status_changed` 이벤트이며, **진행/완료/사업 검토**(`to_value in ("resolved","closed","in_progress")`)로 변경된 경우만 |
| **담당자 답변** | 내가 요청자인 티켓에 **역할이 admin인 사용자**가 작성한 댓글 |

---

## 2. 관리자(담당자) 기준

### 2-1. SMTP 메일 발송 조건

| 조건 | 설명 | 발송 시점 |
|------|------|-----------|
| **신규 요청 접수** | **해당 요청의 카테고리 담당자**에게 발송 | 티켓 생성 완료 시, `get_category_admins(session, ticket.category_id)` 대상 |
| **요청자 답변** | **해당 요청의 담당자**에게 발송. 담당자 없으면 **카테고리 담당자**에게 | 댓글 등록 시 `payload.notify_email == true` 이고, **작성자가 요청자**일 때. 수신자: `assignee_emp_no`가 있으면 그 1명, 없으면 `get_category_admins(session, ticket.category_id)` |

---

### 2-2. 인앱 알림 조건 (탑바 알림)

| 조건 | 설명 |
|------|------|
| **신규 요청** | **내가 담당인 카테고리**(`ContactAssignmentMember`)에 속한 티켓이 **최근 30일 내** 생성된 경우 |
| **요청자 답변** | **내가 담당자**(`assignee_emp_no == user.emp_no`)인 티켓에 **역할이 requester인 사용자**가 작성한 댓글 |

---

## 3. 요약 비교

| 구분 | 요청자 | 관리자 |
|------|--------|--------|
| **SMTP** | 요청 접수, 상태 변경(진행/완료/사업 검토), 담당자 답변 | 신규 요청(카테고리 담당자), 요청자 답변(담당자 또는 카테고리 담당자) |
| **인앱** | 요청 접수, 상태 변경(진행/완료/사업 검토), 담당자 답변 | 신규 요청(담당 카테고리·30일), 요청자 답변(내 담당 요청) |

인앱 알림은 위 SMTP 발송 조건과 맞춰 두었으며, **담당자 배정/변경**은 SMTP에서 미발송이므로 인앱에서도 제외되어 있습니다.

---

## 4. 코드 위치 참고

- SMTP 발송: `apps/api/app/services/mail_events.py`, `mail_notifications.py`  
- 호출: `apps/api/app/routers/tickets.py`(티켓 생성·상태 변경), `apps/api/app/routers/comments.py`(답변 등록, `notify_email` 시)  
- 인앱 알림: `apps/api/app/routers/notifications.py` (`GET /notifications`)  
- 탑바 알림 기준 문구: `apps/web/components/TopBar.tsx` (알림 드롭다운 내 “알림이 달리는 기준”)
