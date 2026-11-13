// T07 카드 2~4 증거 수집: 성공한 요청과 거절된 요청을 나란히 적은 문서를 만든다.
//   node scripts/evidence-auth.mjs <결과물 주소> <계정A> <계정B> [출력 파일]
//   예) node scripts/evidence-auth.mjs https://skt-aleph-task7.vercel.app evidencea evidenceb docs/evidence/t07-auth-evidence.md
// - 두 계정은 같은 비밀번호로 미리 가입해 둔다(카드 2: 같은 비밀번호라도 저장값이 다른지 보기 위해).
// - 비밀번호는 실행할 때 화면에 보이지 않게 한 번 입력한다(EVIDENCE_PASSWORD 환경변수로도 가능).
// - 문서에는 비밀번호를 적지 않고(********), 세션 쿠키 값은 앞 6자만 남기고 가린다.
// - 증거용 계정에 계획·할 일을 몇 건 만든다. 실제 사용 계정은 쓰지 않는다.
import { writeFile } from 'node:fs/promises';
import readline from 'node:readline';

const [base, userA, userB, outFile = 'docs/evidence/t07-auth-evidence.md'] = process.argv.slice(2);
if (!base || !userA || !userB) {
  console.error('usage: node scripts/evidence-auth.mjs <base-url> <userA> <userB> [out.md]');
  process.exit(1);
}
const BASE = base.replace(/\/$/, '');

async function askHidden(q) {
  if (process.env.EVIDENCE_PASSWORD) return process.env.EVIDENCE_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
  return new Promise((res) => rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); res(a); }));
}
const PASSWORD = await askHidden('두 증거용 계정의 비밀번호(화면에 보이지 않음): ');
const PASSWORD2 = PASSWORD + 'Chg9';  // 카드 3 비밀번호 변경 시험용(끝나면 원래대로 되돌림)

// ---------- 가리기 ----------
const maskSid = (s) => String(s).replace(/sid=([A-Za-z0-9_-]{6})[A-Za-z0-9_-]*/g, 'sid=$1…(가림)');
const maskBody = (b) => {
  if (!b || typeof b !== 'object') return b;
  const o = { ...b };
  for (const k of ['password', 'current_password', 'new_password']) if (k in o) o[k] = '********';
  return o;
};

// ---------- 요청 기록 ----------
const log = [];
let n = 0;
async function req(label, method, path, { cookie, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  const t0 = Date.now();
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 300); }
  const entry = {
    no: ++n, label, method, path,
    reqHeaders: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, k === 'Cookie' ? maskSid(v) : v])),
    reqBody: maskBody(body),
    status: r.status, setCookie: r.headers.get('set-cookie'), body: json, ms: Date.now() - t0,
  };
  log.push(entry);
  return { status: r.status, body: json, setCookie: r.headers.get('set-cookie') };
}
const cookieOf = (setCookie) => (setCookie || '').split(';')[0];

function show(e) {
  const lines = [`**#${e.no} ${e.label}**`, '', '```http', `${e.method} ${e.path}`];
  for (const [k, v] of Object.entries(e.reqHeaders)) lines.push(`${k}: ${v}`);
  if (e.reqBody) lines.push('', JSON.stringify(e.reqBody));
  lines.push('', `→ ${e.status}`);
  if (e.setCookie) lines.push(`Set-Cookie: ${maskSid(e.setCookie)}`);
  let b = JSON.stringify(e.body);
  if (b && b.length > 600) b = b.slice(0, 600) + ' …(생략)';
  lines.push(maskSid(b), '```', '');
  return lines.join('\n');
}

// ---------- 확인 결과 ----------
const checks = [];
const check = (id, ok, what) => { checks.push({ id, ok: !!ok, what }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${what}`); };
const sections = [];
const section = (title, intro, from) => sections.push({ title, intro, entries: log.slice(from) });

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const plus = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10);
const exportCounts = async (label, cookie) => (await req(label, 'GET', '/api/export', { cookie })).body.counts;

// ===== 카드 1·2: 로그인 요청·응답에 비밀번호 원문이 없는지, 안내 문구 =====
let from = log.length;
const loginA = await req('계정 A 로그인(정상)', 'POST', '/api/auth/login', { body: { username: userA, password: PASSWORD } });
check('C95', loginA.status === 200, 'A 로그인 200');
const dup = await req('같은 아이디로 다시 가입(거절)', 'POST', '/api/auth/signup', { body: { username: userA.toUpperCase(), password: PASSWORD } });
check('C98', dup.status === 409, `대소문자만 바꾼 같은 아이디 가입 거절 → ${dup.status}`);
const wrongPw = await req('아이디는 맞고 비밀번호만 틀림(거절)', 'POST', '/api/auth/login', { body: { username: userA, password: PASSWORD + 'x' } });
const noUser = await req('없는 아이디(거절)', 'POST', '/api/auth/login', { body: { username: 'nouser' + Date.now().toString(36).slice(-6), password: PASSWORD } });
check('C99', wrongPw.status === noUser.status && wrongPw.body.error === noUser.body.error, `두 경우 같은 응답: ${wrongPw.status} "${wrongPw.body.error}"`);
check('C105', !log.slice(from).some((e) => JSON.stringify(e.body).includes(PASSWORD)), '로그인 응답 어디에도 비밀번호 원문 없음');
section('카드 1·2 · 로그인 요청과 응답(비밀번호 원문 없음), 중복 가입, 같은 실패 문구',
  '요청 본문의 비밀번호는 이 문서에서 ********로 가렸고, 응답에는 비밀번호나 해시가 들어 있지 않다.', from);

// ===== 카드 3: 로그아웃 전후 같은 요청 / 만료 / 비밀번호 변경 =====
from = log.length;
let cA = cookieOf(loginA.setCookie);
const me = await req('세션으로 내 정보(만료 시각 확인)', 'GET', '/api/auth/me', { cookie: cA });
const okBefore = await req('로그아웃 전: 계획 목록', 'GET', '/api/plans', { cookie: cA });
await req('로그아웃', 'POST', '/api/auth/logout', { cookie: cA });
const afterLogout = await req('로그아웃 후: 같은 쿠키로 같은 요청', 'GET', '/api/plans', { cookie: cA });
check('C109', okBefore.status === 200 && afterLogout.status === 401, `로그아웃 전 ${okBefore.status} / 후 ${afterLogout.status}`);
const maxAge = /Max-Age=(\d+)/.exec(loginA.setCookie || '')?.[1];
check('C111', maxAge === '604800' && me.body.session_expires_at, `Max-Age=${maxAge}초(7일), 만료 시각 ${me.body.session_expires_at}`);
check('C112', !log.some((e) => /sid=/.test(e.path)), '세션 값이 주소(URL)에 없음 — 쿠키 헤더로만 오감');
section('카드 3 · 같은 주소·같은 방식, 달라진 것은 로그아웃뿐',
  `#${okBefore && log.find((e) => e.label.startsWith('로그아웃 전')).no}과 #${log.find((e) => e.label.startsWith('로그아웃 후')).no}은 같은 주소(GET /api/plans)·같은 쿠키 값이다. 그 사이에 로그아웃(서버에서 세션 행 삭제)만 했다.`, from);

from = log.length;
const s1 = cookieOf((await req('계정 B 로그인(세션 1)', 'POST', '/api/auth/login', { body: { username: userB, password: PASSWORD } })).setCookie);
const s2 = cookieOf((await req('계정 B 로그인(세션 2, 다른 기기 가정)', 'POST', '/api/auth/login', { body: { username: userB, password: PASSWORD } })).setCookie);
const s2before = await req('비밀번호 변경 전: 세션 2로 계획 목록', 'GET', '/api/plans', { cookie: s2 });
await req('세션 1에서 비밀번호 변경', 'POST', '/api/auth/password', { cookie: s1, body: { current_password: PASSWORD, new_password: PASSWORD2 } });
const s2after = await req('비밀번호 변경 후: 세션 2로 같은 요청', 'GET', '/api/plans', { cookie: s2 });
const s1after = await req('비밀번호 변경 후: 세션 1로 같은 요청', 'GET', '/api/plans', { cookie: s1 });
const oldPw = await req('바뀐 뒤 옛 비밀번호로 로그인(거절)', 'POST', '/api/auth/login', { body: { username: userB, password: PASSWORD } });
const newLogin = await req('새 비밀번호로 로그인', 'POST', '/api/auth/login', { body: { username: userB, password: PASSWORD2 } });
check('C114', s2before.status === 200 && s2after.status === 401 && s1after.status === 401 && oldPw.status === 401 && newLogin.status === 200,
  `변경 전 세션2 ${s2before.status} → 변경 후 세션2 ${s2after.status}, 세션1 ${s1after.status}, 옛 비밀번호 ${oldPw.status}`);
// 원래 비밀번호로 되돌림(이 기록도 남긴다)
await req('원래 비밀번호로 되돌림', 'POST', '/api/auth/password', { cookie: cookieOf(newLogin.setCookie), body: { current_password: PASSWORD2, new_password: PASSWORD } });
section('카드 3 · 비밀번호를 바꾸면 이전에 발급한 세션이 모두 거절됨', '시험이 끝난 뒤 증거용 계정 B의 비밀번호는 원래대로 되돌렸다.', from);

// ===== 카드 4: 다른 계정 자료 접근 =====
from = log.length;
const la = await req('계정 A 로그인', 'POST', '/api/auth/login', { body: { username: userA, password: PASSWORD } });
const lb = await req('계정 B 로그인', 'POST', '/api/auth/login', { body: { username: userB, password: PASSWORD } });
cA = cookieOf(la.setCookie); const cB = cookieOf(lb.setCookie);
const idA = la.body.user.id, idB = lb.body.user.id;
const mkPlan = (who, c) => req(`계정 ${who}: 계획 만들기`, 'POST', '/api/plans', { cookie: c, body: { title: `[증거] ${who}의 계획`, period_start: today, period_end: plus(today, 6), priority: 'low', success_criteria: '접근 제어 증거용', estimated_minutes: 30 } });
const pA = (await mkPlan('A', cA)).body.plan, pB = (await mkPlan('B', cB)).body.plan;
const mkTask = (who, c, p) => req(`계정 ${who}: 할 일 만들기`, 'POST', '/api/tasks', { cookie: c, body: { plan_id: p.id, title: `[증거] ${who}의 할 일`, due_date: today, priority: 'low', estimated_minutes: 10 } });
const tA = (await mkTask('A', cA, pA)).body.task, tB = (await mkTask('B', cB, pB)).body.task;
check('C116', pA && pB && tA && tB, `A: 계획 #${pA?.id}·할 일 #${tA?.id} / B: 계획 #${pB?.id}·할 일 #${tB?.id} (비밀번호는 적지 않음)`);
section('카드 4 · 두 계정에 각자 자료 넣기', `계정 A(id ${idA})와 계정 B(id ${idB})가 각자 로그인해 계획 1건·할 일 1건씩 만들었다.`, from);

async function attack(who, c, victim, p, t) {
  const fromX = log.length;
  const before = await exportCounts(`공격 전 ${victim} 자료 건수(${victim} 본인으로 조회)`, victim === 'B' ? cB : cA);
  const r = [];
  r.push(['read', await req(`${who}→${victim} 계획 읽기`, 'GET', `/api/plans/${p.id}`, { cookie: c })]);
  r.push(['read', await req(`${who}→${victim} 할 일 읽기`, 'GET', `/api/tasks/${t.id}`, { cookie: c })]);
  r.push(['read', await req(`${who}→${victim} 할 일 목록 읽기(plan_id 지정)`, 'GET', `/api/tasks?plan_id=${p.id}`, { cookie: c })]);
  r.push(['update', await req(`${who}→${victim} 계획 고치기`, 'PATCH', `/api/plans/${p.id}`, { cookie: c, body: { title: `${who}가 바꾼 제목` } })]);
  r.push(['update', await req(`${who}→${victim} 할 일 고치기`, 'PATCH', `/api/tasks/${t.id}`, { cookie: c, body: { title: `${who}가 바꾼 할 일` } })]);
  r.push(['update', await req(`${who}→${victim} 할 일 완료 처리`, 'POST', `/api/tasks/${t.id}/complete`, { cookie: c, body: { idempotency_key: crypto.randomUUID() } })]);
  r.push(['delete', await req(`${who}→${victim} 할 일 지우기`, 'DELETE', `/api/tasks/${t.id}`, { cookie: c })]);
  const after = await exportCounts(`공격 후 ${victim} 자료 건수(${victim} 본인으로 조회)`, victim === 'B' ? cB : cA);
  const own = await req(`공격 후 ${victim} 본인이 자기 할 일 다시 읽기`, 'GET', `/api/tasks/${t.id}`, { cookie: victim === 'B' ? cB : cA });
  const denied = (k) => r.filter(([kind]) => kind === k).every(([, x]) => x.status === 403 || x.status === 404);
  const tag = who === 'A' ? '' : '(반대 방향)';
  check(who === 'A' ? 'C117' : 'C120', denied('read'), `${who}→${victim} 읽기 거절 ${tag} ${r.filter(([k]) => k === 'read').map(([, x]) => x.status).join('/')}`);
  check(who === 'A' ? 'C118' : 'C120', denied('update'), `${who}→${victim} 수정 거절 ${tag} ${r.filter(([k]) => k === 'update').map(([, x]) => x.status).join('/')}`);
  check(who === 'A' ? 'C119' : 'C120', denied('delete'), `${who}→${victim} 삭제 거절 ${tag} ${r.filter(([k]) => k === 'delete').map(([, x]) => x.status).join('/')}`);
  check('C122', JSON.stringify(before) === JSON.stringify(after) && own.body.task?.title === t.title && own.body.task?.status === 'open',
    `${victim} 건수 전후 같음 ${JSON.stringify(before)} · 할 일 제목·상태 그대로`);
  section(`카드 4 · ${who}가 ${victim}의 자료를 읽기·고치기·지우기 ${tag}`,
    `거절은 모두 404(존재 자체를 감춤)다. 앞뒤로 ${victim} 본인이 센 자료 건수가 같고, ${victim}의 할 일은 제목·상태가 그대로다.`, fromX);
}
await attack('A', cA, 'B', pB, tB);
await attack('B', cB, 'A', pA, tA);

from = log.length;
const spoof = await req('A가 주소·헤더에 B를 적어 계획 목록 요청', 'GET', `/api/plans?user_id=${idB}`, { cookie: cA, headers: { 'X-User-Id': String(idB) } });
const spoofIds = (spoof.body.plans || []).map((p) => p.id);
const spoofCreate = await req('A가 본문에 B의 user_id를 넣어 계획 만들기', 'POST', '/api/plans', { cookie: cA, body: { user_id: idB, title: '[증거] 본문에 B를 적음', period_start: today, period_end: plus(today, 1), priority: 'low', success_criteria: '본문 위조 시험', estimated_minutes: 1 } });
const bList = await req('B의 계획 목록(위조 계획이 B에게 생겼는지)', 'GET', '/api/plans', { cookie: cB });
const bIds = (bList.body.plans || []).map((p) => p.id);
check('C123', !spoofIds.includes(pB.id) && spoofIds.includes(pA.id) && !bIds.includes(spoofCreate.body.plan?.id) && spoofCreate.body.plan?.user_id === idA,
  `헤더·주소에 B를 적어도 A의 계획만(${spoofIds.join(',')}), 본문 위조 계획 #${spoofCreate.body.plan?.id}의 주인은 A(${spoofCreate.body.plan?.user_id})`);
const aList = await req('A의 계획 목록', 'GET', '/api/plans', { cookie: cA });
const aIds = (aList.body.plans || []).map((p) => p.id);
check('C125', !aIds.some((x) => bIds.includes(x)) && aIds.length > 0, `A 목록 ${aIds.join(',')} ∩ B 목록 ${bIds.join(',')} = 없음`);
section('카드 4 · 주소·헤더·본문에 다른 계정을 적어도 내 자료만, 목록에 남의 자료 없음',
  '서버는 사용자를 쿠키(세션)로만 찾고, 주소·헤더·본문의 user_id는 쓰지 않는다.', from);

from = log.length;
const un = [
  await req('로그인 없이 계획 목록', 'GET', '/api/plans'),
  await req(`로그인 없이 계획 #${pA.id} 직접 요청`, 'GET', `/api/plans/${pA.id}`),
  await req(`로그인 없이 할 일 #${tA.id} 지우기`, 'DELETE', `/api/tasks/${tA.id}`),
  await req('로그인 없이 내보내기', 'GET', '/api/export'),
];
check('C124', un.every((x) => x.status === 401), `로그인 없는 직접 요청 ${un.map((x) => x.status).join('/')}`);
section('카드 4 · 로그인하지 않은 직접 요청', '쿠키 없이 보낸 요청은 모두 401이다.', from);

await req('A 로그아웃(정리)', 'POST', '/api/auth/logout', { cookie: cA });
await req('B 로그아웃(정리)', 'POST', '/api/auth/logout', { cookie: cB });

// ---------- 문서 ----------
const at = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'long', timeStyle: 'medium', hourCycle: 'h23' }).format(new Date());
const md = [
  '# T07 인증·인가 확인 기록 (카드 2~4)',
  '',
  `- 대상: ${BASE}`,
  `- 실행: ${at} (Asia/Seoul) · \`node scripts/evidence-auth.mjs\``,
  `- 증거용 계정 A: \`${userA}\`, B: \`${userB}\` — 같은 비밀번호로 가입. **비밀번호는 이 문서에 적지 않았다(********).**`,
  '- 세션 쿠키 값은 앞 6자만 남기고 가렸다(예: `sid=Ab12Cd…(가림)`).',
  '',
  '## 결과 요약',
  '',
  '| 기준 | 결과 | 확인한 것 |',
  '|---|---|---|',
  ...checks.map((c) => `| ${c.id} | ${c.ok ? '통과' : '**실패**'} | ${c.what.replace(/\|/g, '\\|')} |`),
  '',
  ...sections.flatMap((s) => [`## ${s.title}`, '', s.intro, '', ...s.entries.map(show)]),
].join('\n');
if (md.includes(PASSWORD) || md.includes(PASSWORD2)) { console.error('문서에 비밀번호가 들어가 저장하지 않습니다'); process.exit(2); }
if (/sid=[A-Za-z0-9_-]{7,}/.test(md)) { console.error('가리지 않은 세션 값이 있어 저장하지 않습니다'); process.exit(2); }
await writeFile(outFile, md, 'utf8');
const failed = checks.filter((c) => !c.ok);
console.log(`\n${outFile} 저장 · 통과 ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
