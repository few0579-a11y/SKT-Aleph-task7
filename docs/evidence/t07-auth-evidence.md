# T07 인증·인가 확인 기록 (카드 2~4)

- 대상: https://skt-aleph-task7.vercel.app
- 실행: 2026년 11월 13일 14:26:07 (Asia/Seoul) · `node scripts/evidence-auth.mjs`
- 증거용 계정 A: `evidencea`, B: `evidenceb` — 같은 비밀번호로 가입. **비밀번호는 이 문서에 적지 않았다(********).**
- 세션 쿠키 값은 앞 6자만 남기고 가렸다(예: `sid=Ab12Cd…(가림)`).

## 결과 요약

| 기준 | 결과 | 확인한 것 |
|---|---|---|
| C95 | 통과 | A 로그인 200 |
| C98 | 통과 | 대소문자만 바꾼 같은 아이디 가입 거절 → 409 |
| C99 | 통과 | 두 경우 같은 응답: 401 "아이디 또는 비밀번호가 올바르지 않습니다" |
| C105 | 통과 | 로그인 응답 어디에도 비밀번호 원문 없음 |
| C109 | 통과 | 로그아웃 전 200 / 후 401 |
| C111 | 통과 | Max-Age=604800초(7일), 만료 시각 2026-11-20T05:26:02.978Z |
| C112 | 통과 | 세션 값이 주소(URL)에 없음 — 쿠키 헤더로만 오감 |
| C114 | 통과 | 변경 전 세션2 200 → 변경 후 세션2 401, 세션1 401, 옛 비밀번호 401 |
| C116 | 통과 | A: 계획 #4·할 일 #11 / B: 계획 #5·할 일 #12 (비밀번호는 적지 않음) |
| C117 | 통과 | A→B 읽기 거절  404/404/404 |
| C118 | 통과 | A→B 수정 거절  404/404/404 |
| C119 | 통과 | A→B 삭제 거절  404 |
| C122 | 통과 | B 건수 전후 같음 {"plans":1,"plan_revisions":1,"tasks":1,"task_completions":0,"runs":0,"reviews":0,"tag_colors":0} · 할 일 제목·상태 그대로 |
| C120 | 통과 | B→A 읽기 거절 (반대 방향) 404/404/404 |
| C120 | 통과 | B→A 수정 거절 (반대 방향) 404/404/404 |
| C120 | 통과 | B→A 삭제 거절 (반대 방향) 404 |
| C122 | 통과 | A 건수 전후 같음 {"plans":1,"plan_revisions":1,"tasks":1,"task_completions":0,"runs":0,"reviews":0,"tag_colors":0} · 할 일 제목·상태 그대로 |
| C123 | 통과 | 헤더·주소에 B를 적어도 A의 계획만(4), 본문 위조 계획 #6의 주인은 A(3) |
| C125 | 통과 | A 목록 6,4 ∩ B 목록 5 = 없음 |
| C124 | 통과 | 로그인 없는 직접 요청 401/401/401/401 |

## 카드 1·2 · 로그인 요청과 응답(비밀번호 원문 없음), 중복 가입, 같은 실패 문구

요청 본문의 비밀번호는 이 문서에서 ********로 가렸고, 응답에는 비밀번호나 해시가 들어 있지 않다.

**#1 계정 A 로그인(정상)**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"evidencea","password":"********"}

→ 200
Set-Cookie: sid=T7M_L6…(가림); Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
{"user":{"id":"3","username":"evidencea"},"session_expires_at":"2026-11-20T05:26:02.978Z","session_days":7}
```

**#2 같은 아이디로 다시 가입(거절)**

```http
POST /api/auth/signup
Content-Type: application/json

{"username":"EVIDENCEA","password":"********"}

→ 409
{"error":"이미 사용 중인 아이디입니다"}
```

**#3 아이디는 맞고 비밀번호만 틀림(거절)**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"evidencea","password":"********"}

→ 401
{"error":"아이디 또는 비밀번호가 올바르지 않습니다"}
```

**#4 없는 아이디(거절)**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"nousereja9cl","password":"********"}

→ 401
{"error":"아이디 또는 비밀번호가 올바르지 않습니다"}
```

## 카드 3 · 같은 주소·같은 방식, 달라진 것은 로그아웃뿐

#6과 #8은 같은 주소(GET /api/plans)·같은 쿠키 값이다. 그 사이에 로그아웃(서버에서 세션 행 삭제)만 했다.

**#5 세션으로 내 정보(만료 시각 확인)**

```http
GET /api/auth/me
Cookie: sid=T7M_L6…(가림)

→ 200
{"user":{"id":"3","username":"evidencea"},"session_expires_at":"2026-11-20T05:26:02.978Z"}
```

**#6 로그아웃 전: 계획 목록**

```http
GET /api/plans
Cookie: sid=T7M_L6…(가림)

→ 200
{"plans":[]}
```

**#7 로그아웃**

```http
POST /api/auth/logout
Cookie: sid=T7M_L6…(가림)

→ 200
Set-Cookie: sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0
{"logged_out":true,"sessions_ended":1}
```

**#8 로그아웃 후: 같은 쿠키로 같은 요청**

```http
GET /api/plans
Cookie: sid=T7M_L6…(가림)

→ 401
{"error":"로그인이 필요합니다"}
```

## 카드 3 · 비밀번호를 바꾸면 이전에 발급한 세션이 모두 거절됨

시험이 끝난 뒤 증거용 계정 B의 비밀번호는 원래대로 되돌렸다.

**#9 계정 B 로그인(세션 1)**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"evidenceb","password":"********"}

→ 200
Set-Cookie: sid=8ZSO-7…(가림); Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
{"user":{"id":"4","username":"evidenceb"},"session_expires_at":"2026-11-20T05:26:03.698Z","session_days":7}
```

**#10 계정 B 로그인(세션 2, 다른 기기 가정)**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"evidenceb","password":"********"}

→ 200
Set-Cookie: sid=NbDcGq…(가림); Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
{"user":{"id":"4","username":"evidenceb"},"session_expires_at":"2026-11-20T05:26:03.809Z","session_days":7}
```

**#11 비밀번호 변경 전: 세션 2로 계획 목록**

```http
GET /api/plans
Cookie: sid=NbDcGq…(가림)

→ 200
{"plans":[]}
```

**#12 세션 1에서 비밀번호 변경**

```http
POST /api/auth/password
Content-Type: application/json
Cookie: sid=8ZSO-7…(가림)

{"current_password":"********","new_password":"********"}

→ 200
Set-Cookie: sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0
{"changed":true,"relogin":true}
```

**#13 비밀번호 변경 후: 세션 2로 같은 요청**

```http
GET /api/plans
Cookie: sid=NbDcGq…(가림)

→ 401
{"error":"로그인이 필요합니다"}
```

**#14 비밀번호 변경 후: 세션 1로 같은 요청**

```http
GET /api/plans
Cookie: sid=8ZSO-7…(가림)

→ 401
{"error":"로그인이 필요합니다"}
```

**#15 바뀐 뒤 옛 비밀번호로 로그인(거절)**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"evidenceb","password":"********"}

→ 401
{"error":"아이디 또는 비밀번호가 올바르지 않습니다"}
```

**#16 새 비밀번호로 로그인**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"evidenceb","password":"********"}

→ 200
Set-Cookie: sid=nDA5-M…(가림); Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
{"user":{"id":"4","username":"evidenceb"},"session_expires_at":"2026-11-20T05:26:04.390Z","session_days":7}
```

**#17 원래 비밀번호로 되돌림**

```http
POST /api/auth/password
Content-Type: application/json
Cookie: sid=nDA5-M…(가림)

{"current_password":"********","new_password":"********"}

→ 200
Set-Cookie: sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0
{"changed":true,"relogin":true}
```

## 카드 4 · 두 계정에 각자 자료 넣기

계정 A(id 3)와 계정 B(id 4)가 각자 로그인해 계획 1건·할 일 1건씩 만들었다.

**#18 계정 A 로그인**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"evidencea","password":"********"}

→ 200
Set-Cookie: sid=bn38Yn…(가림); Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
{"user":{"id":"3","username":"evidencea"},"session_expires_at":"2026-11-20T05:26:04.635Z","session_days":7}
```

**#19 계정 B 로그인**

```http
POST /api/auth/login
Content-Type: application/json

{"username":"evidenceb","password":"********"}

→ 200
Set-Cookie: sid=h72OgE…(가림); Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
{"user":{"id":"4","username":"evidenceb"},"session_expires_at":"2026-11-20T05:26:04.788Z","session_days":7}
```

**#20 계정 A: 계획 만들기**

```http
POST /api/plans
Content-Type: application/json
Cookie: sid=bn38Yn…(가림)

{"title":"[증거] A의 계획","period_start":"2026-11-13","period_end":"2026-11-19","priority":"low","success_criteria":"접근 제어 증거용","estimated_minutes":30}

→ 201
{"plan":{"id":"4","title":"[증거] A의 계획","period_start":"2026-11-13","period_end":"2026-11-19","priority":"low","success_criteria":"접근 제어 증거용","estimated_minutes":30,"revision":1,"created_at":"2026-11-13T05:26:04.869Z","updated_at":"2026-11-13T05:26:04.869Z","from_review_id":null,"carried_improvement":null,"user_id":"3"}}
```

**#21 계정 B: 계획 만들기**

```http
POST /api/plans
Content-Type: application/json
Cookie: sid=h72OgE…(가림)

{"title":"[증거] B의 계획","period_start":"2026-11-13","period_end":"2026-11-19","priority":"low","success_criteria":"접근 제어 증거용","estimated_minutes":30}

→ 201
{"plan":{"id":"5","title":"[증거] B의 계획","period_start":"2026-11-13","period_end":"2026-11-19","priority":"low","success_criteria":"접근 제어 증거용","estimated_minutes":30,"revision":1,"created_at":"2026-11-13T05:26:04.961Z","updated_at":"2026-11-13T05:26:04.961Z","from_review_id":null,"carried_improvement":null,"user_id":"4"}}
```

**#22 계정 A: 할 일 만들기**

```http
POST /api/tasks
Content-Type: application/json
Cookie: sid=bn38Yn…(가림)

{"plan_id":"4","title":"[증거] A의 할 일","due_date":"2026-11-13","priority":"low","estimated_minutes":10}

→ 201
{"task":{"id":"11","plan_id":"4","title":"[증거] A의 할 일","due_date":"2026-11-13","priority":"low","tags":[],"estimated_minutes":10,"status":"open","completed_at":null,"deleted_at":null,"created_at":"2026-11-13T05:26:05.031Z","updated_at":"2026-11-13T05:26:05.031Z"}}
```

**#23 계정 B: 할 일 만들기**

```http
POST /api/tasks
Content-Type: application/json
Cookie: sid=h72OgE…(가림)

{"plan_id":"5","title":"[증거] B의 할 일","due_date":"2026-11-13","priority":"low","estimated_minutes":10}

→ 201
{"task":{"id":"12","plan_id":"5","title":"[증거] B의 할 일","due_date":"2026-11-13","priority":"low","tags":[],"estimated_minutes":10,"status":"open","completed_at":null,"deleted_at":null,"created_at":"2026-11-13T05:26:05.123Z","updated_at":"2026-11-13T05:26:05.123Z"}}
```

## 카드 4 · A가 B의 자료를 읽기·고치기·지우기 

거절은 모두 404(존재 자체를 감춤)다. 앞뒤로 B 본인이 센 자료 건수가 같고, B의 할 일은 제목·상태가 그대로다.

**#24 공격 전 B 자료 건수(B 본인으로 조회)**

```http
GET /api/export
Cookie: sid=h72OgE…(가림)

→ 200
{"exported_at":"2026-11-13T05:26:05.264Z","app":"Plan-Do-See 다이어리 (ALEPH T07)","user":{"id":"4","username":"evidenceb"},"schema":"contracts/pds-schema-v2.json","rules":{"ids":"bigint를 문자열로 표기","dates":"date 컬럼은 서울 달력 날짜 YYYY-MM-DD","timestamps":"timestamptz는 UTC ISO-8601(화면은 Asia/Seoul로 표시)","minutes":"시간 수치는 모두 분(minute) 정수","deleted":"tasks.deleted_at이 있으면 삭제된 할 일(목록·집계 제외, 내보내기에는 포함)","undone":"task_completions.undone_at이 있으면 취소된 완료 기록"},"counts":{"plans":1,"plan_revisions":1,"tasks":1,"task_completions":0,"runs":0,"reviews":0,"tag_colors":0},"plans":[{"id":"5","title":"[증거] B의 계획","period_ …(생략)
```

**#25 A→B 계획 읽기**

```http
GET /api/plans/5
Cookie: sid=bn38Yn…(가림)

→ 404
{"error":"계획을 찾을 수 없습니다"}
```

**#26 A→B 할 일 읽기**

```http
GET /api/tasks/12
Cookie: sid=bn38Yn…(가림)

→ 404
{"error":"할 일을 찾을 수 없습니다"}
```

**#27 A→B 할 일 목록 읽기(plan_id 지정)**

```http
GET /api/tasks?plan_id=5
Cookie: sid=bn38Yn…(가림)

→ 404
{"error":"계획을 찾을 수 없습니다"}
```

**#28 A→B 계획 고치기**

```http
PATCH /api/plans/5
Content-Type: application/json
Cookie: sid=bn38Yn…(가림)

{"title":"A가 바꾼 제목"}

→ 404
{"error":"계획을 찾을 수 없습니다"}
```

**#29 A→B 할 일 고치기**

```http
PATCH /api/tasks/12
Content-Type: application/json
Cookie: sid=bn38Yn…(가림)

{"title":"A가 바꾼 할 일"}

→ 404
{"error":"할 일을 찾을 수 없습니다"}
```

**#30 A→B 할 일 완료 처리**

```http
POST /api/tasks/12/complete
Content-Type: application/json
Cookie: sid=bn38Yn…(가림)

{"idempotency_key":"720b230e-66dc-441f-ad44-283600392054"}

→ 404
{"error":"할 일을 찾을 수 없습니다"}
```

**#31 A→B 할 일 지우기**

```http
DELETE /api/tasks/12
Cookie: sid=bn38Yn…(가림)

→ 404
{"error":"할 일을 찾을 수 없습니다"}
```

**#32 공격 후 B 자료 건수(B 본인으로 조회)**

```http
GET /api/export
Cookie: sid=h72OgE…(가림)

→ 200
{"exported_at":"2026-11-13T05:26:05.959Z","app":"Plan-Do-See 다이어리 (ALEPH T07)","user":{"id":"4","username":"evidenceb"},"schema":"contracts/pds-schema-v2.json","rules":{"ids":"bigint를 문자열로 표기","dates":"date 컬럼은 서울 달력 날짜 YYYY-MM-DD","timestamps":"timestamptz는 UTC ISO-8601(화면은 Asia/Seoul로 표시)","minutes":"시간 수치는 모두 분(minute) 정수","deleted":"tasks.deleted_at이 있으면 삭제된 할 일(목록·집계 제외, 내보내기에는 포함)","undone":"task_completions.undone_at이 있으면 취소된 완료 기록"},"counts":{"plans":1,"plan_revisions":1,"tasks":1,"task_completions":0,"runs":0,"reviews":0,"tag_colors":0},"plans":[{"id":"5","title":"[증거] B의 계획","period_ …(생략)
```

**#33 공격 후 B 본인이 자기 할 일 다시 읽기**

```http
GET /api/tasks/12
Cookie: sid=h72OgE…(가림)

→ 200
{"task":{"id":"12","plan_id":"5","title":"[증거] B의 할 일","due_date":"2026-11-13","priority":"low","tags":[],"estimated_minutes":10,"status":"open","completed_at":null,"deleted_at":null,"created_at":"2026-11-13T05:26:05.123Z","updated_at":"2026-11-13T05:26:05.123Z"}}
```

## 카드 4 · B가 A의 자료를 읽기·고치기·지우기 (반대 방향)

거절은 모두 404(존재 자체를 감춤)다. 앞뒤로 A 본인이 센 자료 건수가 같고, A의 할 일은 제목·상태가 그대로다.

**#34 공격 전 A 자료 건수(A 본인으로 조회)**

```http
GET /api/export
Cookie: sid=bn38Yn…(가림)

→ 200
{"exported_at":"2026-11-13T05:26:06.147Z","app":"Plan-Do-See 다이어리 (ALEPH T07)","user":{"id":"3","username":"evidencea"},"schema":"contracts/pds-schema-v2.json","rules":{"ids":"bigint를 문자열로 표기","dates":"date 컬럼은 서울 달력 날짜 YYYY-MM-DD","timestamps":"timestamptz는 UTC ISO-8601(화면은 Asia/Seoul로 표시)","minutes":"시간 수치는 모두 분(minute) 정수","deleted":"tasks.deleted_at이 있으면 삭제된 할 일(목록·집계 제외, 내보내기에는 포함)","undone":"task_completions.undone_at이 있으면 취소된 완료 기록"},"counts":{"plans":1,"plan_revisions":1,"tasks":1,"task_completions":0,"runs":0,"reviews":0,"tag_colors":0},"plans":[{"id":"4","title":"[증거] A의 계획","period_ …(생략)
```

**#35 B→A 계획 읽기**

```http
GET /api/plans/4
Cookie: sid=h72OgE…(가림)

→ 404
{"error":"계획을 찾을 수 없습니다"}
```

**#36 B→A 할 일 읽기**

```http
GET /api/tasks/11
Cookie: sid=h72OgE…(가림)

→ 404
{"error":"할 일을 찾을 수 없습니다"}
```

**#37 B→A 할 일 목록 읽기(plan_id 지정)**

```http
GET /api/tasks?plan_id=4
Cookie: sid=h72OgE…(가림)

→ 404
{"error":"계획을 찾을 수 없습니다"}
```

**#38 B→A 계획 고치기**

```http
PATCH /api/plans/4
Content-Type: application/json
Cookie: sid=h72OgE…(가림)

{"title":"B가 바꾼 제목"}

→ 404
{"error":"계획을 찾을 수 없습니다"}
```

**#39 B→A 할 일 고치기**

```http
PATCH /api/tasks/11
Content-Type: application/json
Cookie: sid=h72OgE…(가림)

{"title":"B가 바꾼 할 일"}

→ 404
{"error":"할 일을 찾을 수 없습니다"}
```

**#40 B→A 할 일 완료 처리**

```http
POST /api/tasks/11/complete
Content-Type: application/json
Cookie: sid=h72OgE…(가림)

{"idempotency_key":"ea99097a-1bc2-4ebc-9c8e-78fc0e2a9c35"}

→ 404
{"error":"할 일을 찾을 수 없습니다"}
```

**#41 B→A 할 일 지우기**

```http
DELETE /api/tasks/11
Cookie: sid=h72OgE…(가림)

→ 404
{"error":"할 일을 찾을 수 없습니다"}
```

**#42 공격 후 A 자료 건수(A 본인으로 조회)**

```http
GET /api/export
Cookie: sid=bn38Yn…(가림)

→ 200
{"exported_at":"2026-11-13T05:26:06.882Z","app":"Plan-Do-See 다이어리 (ALEPH T07)","user":{"id":"3","username":"evidencea"},"schema":"contracts/pds-schema-v2.json","rules":{"ids":"bigint를 문자열로 표기","dates":"date 컬럼은 서울 달력 날짜 YYYY-MM-DD","timestamps":"timestamptz는 UTC ISO-8601(화면은 Asia/Seoul로 표시)","minutes":"시간 수치는 모두 분(minute) 정수","deleted":"tasks.deleted_at이 있으면 삭제된 할 일(목록·집계 제외, 내보내기에는 포함)","undone":"task_completions.undone_at이 있으면 취소된 완료 기록"},"counts":{"plans":1,"plan_revisions":1,"tasks":1,"task_completions":0,"runs":0,"reviews":0,"tag_colors":0},"plans":[{"id":"4","title":"[증거] A의 계획","period_ …(생략)
```

**#43 공격 후 A 본인이 자기 할 일 다시 읽기**

```http
GET /api/tasks/11
Cookie: sid=bn38Yn…(가림)

→ 200
{"task":{"id":"11","plan_id":"4","title":"[증거] A의 할 일","due_date":"2026-11-13","priority":"low","tags":[],"estimated_minutes":10,"status":"open","completed_at":null,"deleted_at":null,"created_at":"2026-11-13T05:26:05.031Z","updated_at":"2026-11-13T05:26:05.031Z"}}
```

## 카드 4 · 주소·헤더·본문에 다른 계정을 적어도 내 자료만, 목록에 남의 자료 없음

서버는 사용자를 쿠키(세션)로만 찾고, 주소·헤더·본문의 user_id는 쓰지 않는다.

**#44 A가 주소·헤더에 B를 적어 계획 목록 요청**

```http
GET /api/plans?user_id=4
X-User-Id: 4
Cookie: sid=bn38Yn…(가림)

→ 200
{"plans":[{"id":"4","title":"[증거] A의 계획","period_start":"2026-11-13","period_end":"2026-11-19","priority":"low","success_criteria":"접근 제어 증거용","estimated_minutes":30,"revision":1,"created_at":"2026-11-13T05:26:04.869Z","updated_at":"2026-11-13T05:26:04.869Z","from_review_id":null,"carried_improvement":null,"user_id":"3"}]}
```

**#45 A가 본문에 B의 user_id를 넣어 계획 만들기**

```http
POST /api/plans
Content-Type: application/json
Cookie: sid=bn38Yn…(가림)

{"user_id":"4","title":"[증거] 본문에 B를 적음","period_start":"2026-11-13","period_end":"2026-11-14","priority":"low","success_criteria":"본문 위조 시험","estimated_minutes":1}

→ 201
{"plan":{"id":"6","title":"[증거] 본문에 B를 적음","period_start":"2026-11-13","period_end":"2026-11-14","priority":"low","success_criteria":"본문 위조 시험","estimated_minutes":1,"revision":1,"created_at":"2026-11-13T05:26:07.118Z","updated_at":"2026-11-13T05:26:07.118Z","from_review_id":null,"carried_improvement":null,"user_id":"3"}}
```

**#46 B의 계획 목록(위조 계획이 B에게 생겼는지)**

```http
GET /api/plans
Cookie: sid=h72OgE…(가림)

→ 200
{"plans":[{"id":"5","title":"[증거] B의 계획","period_start":"2026-11-13","period_end":"2026-11-19","priority":"low","success_criteria":"접근 제어 증거용","estimated_minutes":30,"revision":1,"created_at":"2026-11-13T05:26:04.961Z","updated_at":"2026-11-13T05:26:04.961Z","from_review_id":null,"carried_improvement":null,"user_id":"4"}]}
```

**#47 A의 계획 목록**

```http
GET /api/plans
Cookie: sid=bn38Yn…(가림)

→ 200
{"plans":[{"id":"6","title":"[증거] 본문에 B를 적음","period_start":"2026-11-13","period_end":"2026-11-14","priority":"low","success_criteria":"본문 위조 시험","estimated_minutes":1,"revision":1,"created_at":"2026-11-13T05:26:07.118Z","updated_at":"2026-11-13T05:26:07.118Z","from_review_id":null,"carried_improvement":null,"user_id":"3"},{"id":"4","title":"[증거] A의 계획","period_start":"2026-11-13","period_end":"2026-11-19","priority":"low","success_criteria":"접근 제어 증거용","estimated_minutes":30,"revision":1,"created_at":"2026-11-13T05:26:04.869Z","updated_at":"2026-11-13T05:26:04.869Z","from_review_id":null,"car …(생략)
```

## 카드 4 · 로그인하지 않은 직접 요청

쿠키 없이 보낸 요청은 모두 401이다.

**#48 로그인 없이 계획 목록**

```http
GET /api/plans

→ 401
{"error":"로그인이 필요합니다"}
```

**#49 로그인 없이 계획 #4 직접 요청**

```http
GET /api/plans/4

→ 401
{"error":"로그인이 필요합니다"}
```

**#50 로그인 없이 할 일 #11 지우기**

```http
DELETE /api/tasks/11

→ 401
{"error":"로그인이 필요합니다"}
```

**#51 로그인 없이 내보내기**

```http
GET /api/export

→ 401
{"error":"로그인이 필요합니다"}
```
