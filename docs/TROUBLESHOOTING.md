# Troubleshooting

## PowerShell curl 헤더 오류
- Windows PowerShell의 `curl`은 alias로 `Invoke-WebRequest`인 경우가 많음
- REST 호출은 `Invoke-RestMethod` 권장

## bcrypt / passlib 이슈
- bcrypt 버전/패키지 충돌 시 passlib bcrypt backend 에러 가능
- requirements에 bcrypt 명시 및 버전 정합성 유지

## Alembic init/template 오류
- alembic 디렉토리 구조/템플릿 경로 불일치 시 `alembic/script.py.mako` 오류 발생
- `alembic init`은 프로젝트 루트 기준으로 1회만 수행, 이후 `revision --autogenerate` 사용

## "Not authenticated" vs "Invalid token"
- Header 형식: `@{ Authorization = "Bearer $token" }`
- 서버 재시작 후 토큰 만료 가능 → 재로그인 필요
