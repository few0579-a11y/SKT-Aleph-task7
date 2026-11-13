# Plan-Do-See 다이어리 2 (ALEPH T07)

T06 다이어리(계획 → 할 일·실행 기록 → 회고 → 다음 계획)에 **회원 가입·로그인, 세션 관리, 사용자별 접근 제어**를 붙이고, 5일 관찰 화면과 계정 삭제를 더했습니다.

- 결과물: https://skt-aleph-task7.vercel.app — 첫 화면은 로그인 화면이고, 내 기록은 로그인한 뒤에만 보입니다.
- 소스: https://github.com/few0579-a11y/SKT-Aleph-task7
- **인증 구현 설명서: [docs/AUTH.md](docs/AUTH.md)** (① 무엇으로 붙였나 ~ ⑥ 아직 못 막은 것)
- 제출 정보·확인 방법: [docs/SUBMISSION.md](docs/SUBMISSION.md)
- 증거: [인증·인가 확인 기록](docs/evidence/t07-auth-evidence.md) · [저장값·비밀값](docs/evidence/t07-db-and-secrets.md) · [계정 삭제 화면](docs/evidence/t07-c134-account-deleted.png)

## T06에서 이어 온 것
- T06 결과: https://skt-aleph-task6.vercel.app · 소스: https://github.com/few0579-a11y/SKT-Aleph-task6
- 제출 당시 고정 commit **`cbd41ef`** 이 이 저장소 이력의 조상입니다(`git merge-base --is-ancestor cbd41ef main` → 성공).
- T06 주소는 그대로 두려고 저장소·Vercel 프로젝트를 새로 만들었고, DB는 같은 Supabase 프로젝트의 별도 스키마 `t07`을 씁니다(무료 플랜 프로젝트 2개 한도).
- T06에 입력한 본인 기록(계획 3·이력 4·할 일 10·완료 2·실행 3·회고 2)은 `scripts/t06-to-t07-sql.mjs`로 본인 계정에 옮겼고, 이관 뒤 내보내기의 6개 표가 T06 내보내기와 체크섬까지 같습니다.

## 구조
| 경로 | 역할 |
|---|---|
| `public/` | 화면(순수 HTML/CSS/JS). 로그인 전에는 로그인·가입 화면만 그린다. 사용자 입력은 `textContent`로만 그린다 |
| `api/router.js` | Vercel 서버 함수. `/api/*` 요청(쿠키 헤더 포함)을 `lib/handler.mjs`로 넘긴다 |
| `lib/auth.mjs` | 비밀번호 해시(argon2id), 세션 값 생성·해시, 쿠키 |
| `lib/handler.mjs` | API 로직. 인증(가입·로그인·로그아웃·비밀번호 변경·계정 삭제), 요청마다 세션 확인, 모든 자료 쿼리에 소유자 조건 |
| `lib/observation.mjs` | 5일 관찰 집계(날짜별 실행 시간, 겹침·이상값·결측 규칙, 규칙 변경 순서 확인) |
| `db/` | `t07-role.sql` → `schema.sql` → `t07-observation.sql` → `t07-account-delete.sql` 순서로 Supabase SQL Editor에서 실행(다시 실행해도 안전) |
| `scripts/evidence-auth.mjs` | 카드 2~4 증거 수집(성공·거절 요청을 나란히, 비밀번호·세션 값은 가림) |
| `scripts/t06-to-t07-sql.mjs` | T06 내보내기를 내 계정으로 옮기는 SQL 생성 |
| `server.mjs` | 로컬 실행용 서버 |

## 인증·인가 요약 (자세한 내용은 [docs/AUTH.md](docs/AUTH.md))
- 비밀번호: `@node-rs/argon2` 2.2.2로 argon2id 해시만 저장(평문 열 없음, 계정마다 솔트가 다름).
- 세션: 무작위 32바이트를 `sid` 쿠키(HttpOnly·Secure·SameSite=Lax)로 주고 DB에는 SHA-256만 저장. 만료는 로그인 후 7일 고정. 로그아웃·비밀번호 변경 때 서버에서 세션 행을 지워 같은 값이 바로 거절된다. 서명용 비밀키는 쓰지 않는다.
- 인가: 사용자 id는 쿠키로 찾은 값만 쓴다(주소·헤더·본문의 사용자 값은 무시). 다른 사람의 계획·할 일은 404, 로그인 없는 요청은 401.
- DB: 앱은 전용 역할 `t07_app`으로만 접속하고, 이 역할은 `t07` 스키마에만 권한이 있으며 직접 지울 수 있는 것은 세션뿐이다. 계정과 자료 삭제는 `delete_account()` 함수로만 한다.

## 화면
- 로그인 / 회원 가입 / 계정(비밀번호 변경, 계정 삭제)
- 계획 목록 → 계획(개요·할 일 / 타임테이블 / 캘린더 / 회고) — T06과 같다
- **5일 관찰**: 관찰 설정(1일차 전에 한 번, 고칠 수 없음), 날짜별 하루 실행 시간과 근거 기록, 규칙 변경 전후 비교, 손으로 더한 합계, 규칙 변경 기록(2일차 뒤·3일차 앞에 한 번)
- 내 데이터 내보내기(JSON 파일 하나, 관찰 포함)

## API
- 인증: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password`, `POST /api/auth/delete-account`
- 자료(모두 로그인 필요, 본인 것만): T06과 같은 계획·할 일·완료·실행 기록·회고·태그 색 API, `GET /api/export`
- 5일 관찰: `GET /api/observation`, `POST /api/observation`, `POST /api/observation/rule-change`
- 상태: `GET /api/health` (접속 역할·스키마 표시)

## 비밀값
- DB 연결 문자열(`DATABASE_URL`, 역할 `t07_app`)은 Vercel 환경변수(Sensitive)에만 있다. `.env`는 Git에서 제외한다.
- 증거 문서에는 비밀번호를 적지 않고 세션 값은 앞 6자만 남긴다.

## 로컬 실행
```bash
npm install
DATABASE_URL=postgres://... node server.mjs        # http://localhost:3000
```
로컬 테스트 DB(PGlite)를 쓸 때는 `PG_POOL_MAX=1 LOCAL_SERIAL=1 PG_SEARCH_PATH=t07`을 함께 준다.

## 알려진 한계
[docs/AUTH.md ⑥ 아직 못 막은 것](docs/AUTH.md#-아직-못-막은-것) — 무차별 대입 제한 없음, 가입 화면으로 아이디 존재 노출, 비밀번호 재설정·MFA 없음, 유휴 만료 없음, 감사 로그 없음 등.
