# T07 저장값·비밀값 확인 기록 (카드 2·3)

확인 시각: 2026-11-13 14:30경 (Asia/Seoul) · 대상: Supabase 프로젝트 `pds-diary-t06`의 `t07` 스키마(T07 전용), 배포본 https://skt-aleph-task7.vercel.app

## 카드 2 · 저장된 비밀번호 값 (C101~C104, C107)

- 방법: **argon2id** — 라이브러리 `@node-rs/argon2` **2.2.2**에 맡김(직접 만든 해시 없음). 설정 `m=19456 KiB, t=2, p=1`(OWASP 권장값). 솔트는 라이브러리가 해시마다 무작위 16바이트로 만든다.
- 고른 이유: argon2id는 메모리를 많이 쓰게 만들어 GPU로 대량 대입하기 어렵고, OWASP 비밀번호 저장 지침이 첫 번째로 권한다. bcrypt는 72바이트 넘는 비밀번호 뒷부분을 무시하고 메모리 부담이 없어 고르지 않았다.
- 코드: `lib/auth.mjs`(hashPassword/verifyPassword), 저장: `lib/handler.mjs` handleAuth의 signup·password.

증거용 두 계정은 **같은 비밀번호**로 가입했다(비밀번호는 적지 않음). SQL Editor에서 그대로 조회한 값:

```sql
select id, username, password_hash, length(password_hash) as len
from t07.users where username in ('evidencea', 'evidenceb') order by id;
```

| id | username | password_hash | len |
|---|---|---|---|
| 3 | evidencea | `$argon2id$v=19$m=19456,t=2,p=1$Tmo84HVkjPNxyQgCwa8W8g$CLaWUuwI1GV6XL30b83un7GN89cnKO13AXhpkFVavTo` | 97 |
| 4 | evidenceb | `$argon2id$v=19$m=19456,t=2,p=1$m+JIb/Egl3XvLyeexTNNJw$DBU4efYYCzLZAsnc/Ly6s0cAC6dPTh4gMV9g0/LiVAc` | 97 |

- 입력한 글자는 어디에도 보이지 않는다(형식: `$알고리즘$버전$설정$솔트$해시`).
- 같은 비밀번호인데 솔트(`Tmo84H…` / `m+JIb/…`)와 해시가 모두 다르다(C104).
- evidenceb는 카드 3 시험에서 비밀번호를 바꿨다가 같은 비밀번호로 되돌렸다. 되돌릴 때 새 솔트로 다시 해시되어 값이 처음과 달라졌지만, 비밀번호는 evidencea와 같다.

표 구조(평문 비밀번호 열이 없음):

| 표 | 열 |
|---|---|
| t07.users | id, username, password_hash, password_changed_at, created_at |
| t07.sessions | id, user_id, **token_hash**(쿠키 값의 SHA-256), created_at, expires_at |

DB 제약으로도 `password_hash`는 `$argon2id$`로 시작해야만 저장된다(`db/schema.sql`).

## 비밀번호 원문이 남지 않는 곳 (C105, C106)

- 로그인 요청·응답 기록: `t07-auth-evidence.md` #1~#4 — 응답 본문에 비밀번호·해시가 없다(스크립트가 검사, C105 통과).
- 서버 로그: 500 오류일 때만 `코드 + 메시지`를 남기고 요청 본문·쿼리 값은 남기지 않는다(`lib/handler.mjs` respond).
- 화면: 비밀번호 칸은 `type=password`, 로그인 실패 뒤 칸을 비운다(`public/app.js` showAuth).
- Supabase Postgres 로그: 역할 비밀번호를 정한 문장도 `password '{REDACTED}'`로 가려져 기록됐다.

## 카드 3 · 세션 값과 비밀키 (C108, C111~C113, C115)

- 식별 방식: **서버 세션**. 로그인하면 추측할 수 없는 무작위 32바이트(base64url)를 `sid` 쿠키(HttpOnly·Secure·SameSite=Lax)로 주고, DB에는 그 SHA-256 해시만 둔다. 요청마다 해시로 세션 행을 찾고 `expires_at > now()`인지 본다.
- 만료: 로그인 후 **7일 고정**(쿠키 `Max-Age=604800`, DB `expires_at` 같음, 쓰는 동안 늘리지 않음).
- 무효화: 로그아웃 → 그 세션 행 삭제 / 비밀번호 변경 → 그 계정의 세션 행 전부 삭제.
- **비밀키: 쓰지 않는다.** 서명하는 토큰(JWT)이 아니라 DB에서 찾는 무작위 값이라 만들 때 필요한 비밀키가 없다. 서버에 있는 비밀값은 DB 접속 문자열(`DATABASE_URL`) 하나이고, Vercel 환경변수(Sensitive)에만 있다.
- 세션 값은 URL에 들어가지 않는다(쿠키 헤더로만 오감, C112).

비밀값 검사(2026-11-13):

```bash
# Git 전체 이력
git log -p --all | grep -Ec 'postgres(ql)?://[^:@ ]+:[^@ \[]+@'   # → 0 (비밀번호가 든 접속 문자열)
git log -p --all | grep -Ec 'pooler\.supabase\.com:6543/postgres' # → 0
git log -p --all | grep -Ec 'eyJhbGciOi'                          # → 0 (JWT 키)
git ls-files | grep -Ei '\.env'                                   # → .env.example(값 비어 있음)만
# 배포된 브라우저 파일
for f in / /app.js /style.css /index.html; do curl -s https://skt-aleph-task7.vercel.app$f | grep -Eci 'postgres(ql)?://|DATABASE_URL|password_hash|argon2|service_role|eyJhbGciOi'; done  # → 0 0 0 0
```

`service_role` 1건은 `scripts/check-security.mjs`의 검사 패턴 주석이다(값 아님). 증거 문서 두 개(`t07-auth-evidence.md`, 이 문서)에는 세션 값이 앞 6자만 남고 가려져 있고(C115), 비밀번호 원문은 없다.
