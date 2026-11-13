# 인증 구현 설명서 (ALEPH T07 · Plan-Do-See 다이어리 2)

- 결과물: https://skt-aleph-task7.vercel.app (첫 화면 = 로그인 화면)
- 소스: https://github.com/few0579-a11y/SKT-Aleph-task7
- 이어서 만든 T06: 결과 https://skt-aleph-task6.vercel.app · 소스 https://github.com/few0579-a11y/SKT-Aleph-task6 · 제출 당시 고정 commit **`cbd41ef`**(이 저장소 이력에 조상으로 들어 있음: `git merge-base --is-ancestor cbd41ef main`)
- 증거 원본: [`docs/evidence/t07-auth-evidence.md`](evidence/t07-auth-evidence.md)(요청·응답 51건, 20/20 통과) · [`docs/evidence/t07-db-and-secrets.md`](evidence/t07-db-and-secrets.md)(저장값·비밀값)
- 이 문서와 증거에는 비밀번호·세션 값·비밀키 원문이 없다. 세션 쿠키는 `sid=Ab12Cd…(가림)`처럼 앞 6자만 남겼다.

---

## ① 무엇으로 붙였나

**방식: 라이브러리 + 직접 구현한 서버 세션.**

| 부분 | 무엇 | 이름·버전 |
|---|---|---|
| 비밀번호 저장 | argon2id 해시(솔트 자동, `m=19456 KiB, t=2, p=1`) | **`@node-rs/argon2` 2.2.2** |
| 세션 값 만들기 | 무작위 32바이트(base64url), DB에는 SHA-256만 | Node.js 내장 `node:crypto` (Node 20+) |
| 세션 보관 | Postgres `t07.sessions` 표(만료 7일 고정) | `postgres`(postgres.js) 3.4.5 |
| 쿠키 | `sid` · HttpOnly · Secure · SameSite=Lax · Max-Age=604800 | 직접 작성(`lib/auth.mjs`) |
| 인가 | 요청마다 쿠키 → 세션 → 사용자 id, 모든 자료 쿼리에 `user_id` 조건 | 직접 작성(`lib/handler.mjs`) |

외부 인증 서비스(Supabase Auth 등)는 쓰지 않았다. 비밀번호 해시 계산은 직접 만들지 않고 라이브러리에 맡겼다.

## ② 왜 그걸 골랐나

- **로그아웃이 진짜로 거절돼야 했다.** 세션을 DB에 두면 로그아웃·비밀번호 변경 때 행을 지우는 것만으로 같은 쿠키 값이 바로 401이 된다(카드 3의 핵심 요구).
- **지금 구조(Vercel 함수 → Postgres)에 그대로 붙는다.** 브라우저는 DB 키를 받지 않고, 서버 함수만 DB에 접속하는 T06 구조를 유지했다.
- **비밀번호는 검증된 라이브러리에 맡겼다.** argon2id는 OWASP 비밀번호 저장 지침이 첫 번째로 권하고, 메모리를 많이 쓰게 해 GPU 대량 대입을 어렵게 한다.
- **서명용 비밀키가 필요 없다.** 세션 값은 서명한 토큰이 아니라 DB에서 찾는 무작위 값이라, 새어 나갈 비밀키 자체가 없다.

함께 검토했지만 고르지 않은 방법:

| 방법 | 고르지 않은 이유(한 문장) |
|---|---|
| Supabase Auth(인증 서비스) | T06에서 Data API를 꺼 둔 구조와 맞지 않고, 로그아웃 뒤에도 access JWT가 만료(기본 1시간) 전까지 통해서 "로그아웃 뒤 같은 값 거절"을 따로 보장해야 했다. |
| 서명 JWT만 쓰는 무상태 토큰 | 서버가 발급한 토큰을 기억하지 않아 로그아웃·비밀번호 변경 뒤에도 만료 전까지 통하므로, 차단 목록을 따로 만들어야 했다. |
| bcrypt(`bcryptjs`) | 72바이트 넘는 비밀번호 뒷부분을 무시하고 메모리 부담이 없어 GPU 대입에 더 약하다. |

## ③ 어디를 어떻게 고쳤나

T06(`cbd41ef`)에서 바꾼 파일: `lib/auth.mjs`(새로), `lib/handler.mjs`, `lib/observation.mjs`(새로), `public/app.js`, `public/index.html`, `public/style.css`, `api/router.js`, `server.mjs`, `db/schema.sql`, `db/t07-role.sql`·`db/t07-observation.sql`·`db/t07-account-delete.sql`(새로), `scripts/t06-to-t07-sql.mjs`·`scripts/evidence-auth.mjs`(새로). 줄 번호는 commit `34f0b8f` 기준.

**네 흐름이 지나는 곳**

| 흐름 | 화면(public/app.js) | 서버(lib/handler.mjs · lib/auth.mjs) | DB |
|---|---|---|---|
| 가입 | `showAuth` (144~) 가입 폼 → `POST /api/auth/signup` | `handleAuth` signup (319~): 아이디 소문자 검사 → `hashPassword`(auth.mjs:15, argon2id) → `insert … on conflict (username) do nothing`(324) → 이미 있으면 409 | `t07.users`(schema.sql:221): `username` 유일 인덱스, `password_hash`는 `$argon2id$`로 시작해야 저장됨 |
| 로그인 | 로그인 폼 → `POST /api/auth/login`, 성공하면 열려던 주소로 | `handleAuth` login (328~): 사용자 조회 → `verifyPassword`(auth.mjs:16) 또는 없는 아이디면 `verifyAgainstDummy`(auth.mjs:20, 응답 시간 맞춤) → 실패는 둘 다 같은 401 `LOGIN_FAIL`(288) → `startSession`(310): `newToken`(auth.mjs:26) → `tokenHash`(auth.mjs:27) 저장 → `Set-Cookie`(auth.mjs:40) | `t07.sessions`(schema.sql:232): `token_hash`, `expires_at` |
| 로그아웃 | 메뉴 「로그아웃」(`renderNav` 119~, 128) → `POST /api/auth/logout` | `handleAuth` logout (337~): 쿠키 값의 해시로 세션 행 삭제(340) + 쿠키 비우기(auth.mjs:42) | `delete from sessions` |
| 자료 조회 | `route`(226~): 먼저 `GET /api/auth/me` → 401이면 자료 API를 부르지 않고 로그인 화면(234). 어느 화면이든 401을 받으면 로그인 화면(43) | `handle`(384~): `checkOrigin`(374, 다른 출처의 쓰기 거절) → 인증 경로가 아니면 `currentUser`(301: 쿠키 → 해시 → 만료 안 된 세션) 없으면 401(396~397) → `uid`는 쿠키로 찾은 값만 사용 → `getPlan`(280: `id`와 `user_id` 둘 다 맞아야) / `getTask`(272: 계획을 거쳐 주인 확인) 아니면 404 · 목록은 `where user_id = uid`(402) | 계획에 `user_id`(schema.sql:242), 할 일·완료·실행·회고·이력은 계획을 거쳐 주인을 찾음 |

**거절을 만드는 소스 위치(C126)**

- 로그인 안 함 → 401: `lib/handler.mjs:396-397` (`currentUser` 301~308).
- 다른 계정의 계획 → 404: `getPlan` `lib/handler.mjs:280-284` — 계획 읽기·고치기·할 일 목록·실행 기록 목록·회고·집계 모두 여기를 거친다(117, 524, 542 등).
- 다른 계정의 할 일 → 404: `getTask` `lib/handler.mjs:272-278` — 할 일 읽기·고치기·지우기·완료가 모두 `const cur = await getTask(...)`(484)에서 먼저 막혀 **쓰기 쿼리가 실행되지 않는다**(그래서 거절 전후 건수가 같다).
- 목록에 남의 자료 없음: `select * from plans where user_id = ${uid}`(402), 내보내기도 모든 표를 `user_id`로 거른다(599~).
- 주소·헤더·본문의 사용자 값 무시: `uid = me.id`만 쓰고, 계획을 만들 때도 `user_id: uid`로 덮어쓴다.
- DB 단계: 앱 역할 `t07_app`은 `t07` 스키마에만 권한이 있고(T06 표 읽기 불가), 삭제는 세션만 가능하다(`db/schema.sql:269`, `db/t07-account-delete.sql:93`). 계정 삭제는 `delete_account()`(t07-account-delete.sql:52)로만 된다.

**그 밖에 바꾼 것**: T06 기록을 내 계정으로 옮기는 SQL(`scripts/t06-to-t07-sql.mjs`, 이관 뒤 6개 표가 T06 내보내기와 체크섬까지 같음), 비밀번호 변경(`handleAuth` password 348~, 모든 세션 삭제 356), 계정 삭제(361~, 비밀번호 + 아이디 다시 입력), 5일 관찰 화면(`lib/observation.mjs`, `#/observe`).

## ④ 안 열리는 것을 확인한 기록

운영본(https://skt-aleph-task7.vercel.app)에 2026-11-13 14:26(서울) `node scripts/evidence-auth.mjs`로 보낸 실제 요청과 응답이다. 증거용 계정 `evidencea`(A, id 3)·`evidenceb`(B, id 4)는 같은 비밀번호로 가입했고 비밀번호는 적지 않는다. 번호(#)는 [증거 원본](evidence/t07-auth-evidence.md)의 번호다.

### 확인 1 · 로그인 없이 자료 화면·자료 API → 로그인 화면 / 401

| | 요청 | 응답 |
|---|---|---|
| 성공(로그인함) | #6 `GET /api/plans` + `Cookie: sid=T7M_L6…(가림)` | **200** `{"plans":[]}` |
| 거절(로그인 안 함) | #48 `GET /api/plans` (쿠키 없음) | **401** `{"error":"로그인이 필요합니다"}` |
| 거절 | #49 `GET /api/plans/4` · #50 `DELETE /api/tasks/11` · #51 `GET /api/export` (쿠키 없음) | **401** · **401** · **401** |

화면: 로그인 없이 `#/plan/1` 같은 자료 주소를 열면 자료 API를 부르지 않고 로그인 화면이 그려진다(`public/app.js:234`).

### 확인 2 · 저장된 비밀번호에 평문이 없음, 같은 비밀번호라도 저장값이 다름

| | 저장값(`t07.users.password_hash`) |
|---|---|
| A `evidencea` | `$argon2id$v=19$m=19456,t=2,p=1$Tmo84HVkjPNxyQgCwa8W8g$CLaWUuwI1GV6XL30b83un7GN89cnKO13AXhpkFVavTo` |
| B `evidenceb` (같은 비밀번호) | `$argon2id$v=19$m=19456,t=2,p=1$m+JIb/Egl3XvLyeexTNNJw$DBU4efYYCzLZAsnc/Ly6s0cAC6dPTh4gMV9g0/LiVAc` |

- 입력한 글자는 보이지 않고, 솔트·해시가 서로 다르다. 표에 평문 비밀번호 열이 없다([저장값 기록](evidence/t07-db-and-secrets.md)).
- 로그인 요청 #1의 응답(200)에 비밀번호·해시가 없다. 틀린 비밀번호 #3과 없는 아이디 #4는 **똑같이** 401 `아이디 또는 비밀번호가 올바르지 않습니다`. 같은 아이디(대소문자만 바꿈) 재가입 #2는 **409** `이미 사용 중인 아이디입니다`.

### 확인 3 · 로그아웃 뒤 같은 세션 값으로 다시 요청하면 거절 (같은 주소·같은 방식)

| | 요청 | 응답 |
|---|---|---|
| 성공(로그아웃 전) | #6 `GET /api/plans` + `Cookie: sid=T7M_L6…(가림)` | **200** `{"plans":[]}` |
| (사이에 한 일) | #7 `POST /api/auth/logout` + 같은 쿠키 | 200 `{"logged_out":true,"sessions_ended":1}` |
| 거절(로그아웃 후) | #8 `GET /api/plans` + **같은** `Cookie: sid=T7M_L6…(가림)` | **401** `{"error":"로그인이 필요합니다"}` |

비밀번호 변경도 같다: 세션 2로 #11 `GET /api/plans` → 200, 세션 1에서 비밀번호 변경(#12) 뒤 같은 세션 2로 #13 → **401**, 세션 1로 #14 → **401**, 옛 비밀번호 로그인 #15 → **401**. 만료: `Max-Age=604800`(7일), #5 응답의 `session_expires_at` = 로그인 시각 + 7일.

### 확인 4 · 다른 계정 자료의 읽기·수정·삭제가 양방향 모두 거절, 목록에도 없음

| 방향 | 읽기 | 수정 | 삭제 | 앞뒤 건수 |
|---|---|---|---|---|
| A → B | #25 `GET /api/plans/5` **404**, #26 `GET /api/tasks/12` **404**, #27 `GET /api/tasks?plan_id=5` **404** | #28 `PATCH /api/plans/5` **404**, #29 `PATCH /api/tasks/12` **404**, #30 `POST /api/tasks/12/complete` **404** | #31 `DELETE /api/tasks/12` **404** | #24 = #32 `{"plans":1,"plan_revisions":1,"tasks":1,…}`, #33 B가 읽은 할 일 #12는 제목·상태 그대로(200) |
| B → A | #35·#36·#37 **404** | #38·#39·#40 **404** | #41 **404** | #34 = #42, #43 그대로(200) |

- 성공 쪽: 주인은 같은 주소를 200으로 읽는다(#33 `GET /api/tasks/12` + B의 쿠키 → 200).
- 위조: #44 A가 `?user_id=4`와 `X-User-Id: 4`를 붙여 `GET /api/plans` → A의 계획만. #45 본문에 `"user_id":"4"`를 넣어 계획을 만들어도 주인은 A(`user_id` 3), #46 B의 목록에 없음.
- 목록: #47 A 목록 `[6, 4]`, #46 B 목록 `[5]` — 겹치는 id 없음.
- 거절은 모두 404(존재 자체를 감춤)이고, 위치는 ③의 「거절을 만드는 소스 위치」.

### 확인 5 · 제출물·공개 화면·소스에 비밀값 원문이 없음

- Git 전체 이력: 비밀번호가 든 접속 문자열 0건, 풀러 주소 0건, JWT 키 0건, `.env`는 값 없는 `.env.example`만.
- 배포된 `/`, `/app.js`, `/style.css`, `/index.html`: `postgres://`·`DATABASE_URL`·`password_hash`·`argon2`·`service_role` 0건.
- 증거 문서: 비밀번호를 넣으면 저장을 거부하고, 가리지 않은 세션 값이 있으면 저장을 거부한다(`scripts/evidence-auth.mjs` 끝부분).
- 자세한 명령과 결과: [저장값·비밀값 기록](evidence/t07-db-and-secrets.md).

## ⑤ AI와 나

> 아래는 이 과제를 진행한 대화 기록에서 사실만 옮긴 초안이다. **본인이 읽고 맞게 고쳐야 한다.**

- **AI에게 맡긴 일**: 선택지와 장단점 정리, 코드 작성(인증·세션·소유자 확인·5일 관찰·계정 삭제), 로컬 테스트, T06 기록 이관 SQL과 검증, Supabase SQL 실행과 권한 확인, GitHub 저장소·Vercel 프로젝트 생성, 증거 수집 스크립트와 이 문서 초안.
- **내가 직접 판단한 일**: T06 주소를 지키려고 저장소·배포·DB를 분리하기로 함, 인증 방식(라이브러리 + DB 세션)과 argon2id·7일 고정 만료·아이디(이메일 아님) 선택, Supabase 무료 한도에서 T06 프로젝트 안 별도 스키마로 가기로 함, 관찰 지표(하루 실행 시간)·변경 전 규칙(하루 120분)·이상값(240분 초과는 표시만)·중복값(겹치면 한 번만), 계정 삭제는 자료까지 완전 삭제 + 비밀번호·아이디 확인, 테스트 계정 정리. DB 역할 비밀번호와 계정 비밀번호는 내가 직접 입력했다.
- **AI 제안을 따르지 않은 일**: 관찰 1일차를 "인증 앱 배포 다음 날"로 하자는 제안 대신 당일(11/13)부터 시작했다. 

## ⑥ 아직 못 막은 것

| 못 막은 것 | 왜 위험한가 |
|---|---|
| **무차별 대입(brute force) 제한 없음** — 로그인 실패 횟수 제한·지연·잠금·CAPTCHA가 없다 | 아이디를 아는 사람이 비밀번호를 자동으로 계속 넣어 볼 수 있다. argon2id가 한 번 시도를 느리게 하지만 시도 횟수 자체는 막지 못한다. 서버 비용도 함께 늘어난다. |
| **가입 화면으로 아이디 존재 여부를 알 수 있음** — 로그인 실패 문구는 같지만, 가입 시 409 "이미 사용 중인 아이디" | 공격자가 어떤 아이디가 있는지 먼저 확인한 뒤 그 아이디에 대입을 집중할 수 있다. |
| **비밀번호 재설정 없음** | 비밀번호를 잊으면 계정과 기록을 되찾을 방법이 없다(이메일을 받지 않으므로). |
| **다중 요소 인증(MFA) 없음** | 비밀번호 하나만 새어 나가도 계정 전체가 열린다. |
| **세션이 7일 고정, 유휴 만료 없음** — 쓰지 않아도 7일 동안 유효 | 공용 PC에서 로그아웃을 잊으면 다음 사람이 7일 동안 내 기록에 접근할 수 있다. |
| **로그인 기록·감사 로그 없음** | 누가 언제 로그인했는지, 비정상 접근이 있었는지 나중에 확인할 수 없다. |
| **CSRF 토큰 없음** — SameSite=Lax 쿠키와 Origin 헤더 확인에만 기대고 있음 | 오래된 브라우저나 같은 사이트(하위 도메인) 공격처럼 두 장치를 모두 피하는 경우에는 쓰기 요청이 위조될 수 있다. |
| **T06과 같은 Supabase 프로젝트를 씀** — 스키마와 앱 역할로 나눴지만 프로젝트 소유자(`postgres`)는 두 쪽 모두에 접근 가능 | 대시보드 계정이나 소유자 비밀번호가 새면 T06·T07 자료가 함께 노출된다. 무료 플랜 프로젝트 2개 한도 때문에 분리하지 못했다. |
| **비밀번호 강도 규칙이 길이(8자)뿐** — 흔한 비밀번호 목록 검사가 없다 | `password1` 같은 약한 비밀번호도 가입된다. |
