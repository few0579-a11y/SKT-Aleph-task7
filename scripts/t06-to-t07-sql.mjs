// T06 내보내기(JSON)를 T07 DB에 넣는 SQL로 바꾼다. 모든 계획을 지정한 계정의 것으로 옮긴다(T07-C100).
//   node scripts/t06-to-t07-sql.mjs <t06-export.json> <T07 아이디> > migrate.sql
// 만든 SQL은 Supabase SQL Editor에서 한 번 실행한다(트랜잭션 하나라 중간에 실패하면 아무것도 들어가지 않는다).
// - ID·시각·이력·완료 기록·실행 기록을 T06 값 그대로 옮긴다(트리거를 잠시 꺼서 이력이 새로 생기거나 막히지 않게).
// - 비밀값은 다루지 않는다. 결과 SQL에는 T06에 공개돼 있던 기록만 들어 있다.
import { readFile } from 'node:fs/promises';

// --oneline: 주석 없이 한 줄로(값 속 줄바꿈은 E'\n'으로) — 웹 SQL 편집기에 입력할 때 자동 완성이 끼어들지 않게
const ONELINE = process.argv.includes('--oneline');
const [file, rawUser] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!file || !rawUser) { console.error('usage: node scripts/t06-to-t07-sql.mjs <t06-export.json> <username>'); process.exit(1); }
const username = rawUser.trim().toLowerCase();
if (!/^[a-z0-9]{3,20}$/.test(username)) { console.error('아이디 형식이 올바르지 않습니다'); process.exit(1); }
const d = JSON.parse(await readFile(file, 'utf8'));

const lit = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length ? `array[${v.map(lit).join(', ')}]::text[]` : `'{}'::text[]`;
  if (typeof v === 'object') return `${lit(JSON.stringify(v))}::jsonb`;
  const str = String(v);
  if (ONELINE && /[\n\r\\]/.test(str)) {
    return `E'${str.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
  }
  return `'${str.replace(/'/g, "''")}'`;
};
const COLS = {
  plans: ['id', 'title', 'period_start', 'period_end', 'priority', 'success_criteria', 'estimated_minutes', 'revision', 'created_at', 'updated_at', 'carried_improvement'],
  plan_revisions: ['id', 'plan_id', 'revision', 'snapshot', 'saved_at'],
  reviews: ['id', 'plan_id', 'scope_from', 'scope_to', 'improvement', 'snapshot', 'created_at'],
  tasks: ['id', 'plan_id', 'title', 'due_date', 'priority', 'tags', 'estimated_minutes', 'status', 'completed_at', 'deleted_at', 'created_at', 'updated_at'],
  task_completions: ['id', 'task_id', 'idempotency_key', 'completed_at', 'undone_at'],
  runs: ['id', 'task_id', 'started_at', 'ended_at', 'actual_minutes', 'blocker', 'created_at'],
};
const TRIGGERED = ['plans', 'plan_revisions', 'reviews', 'task_completions', 'runs'];
const owner = `(select id from users where username = ${lit(username)})`;

const out = [];
out.push(`-- T06 → T07 이관: T06 내보내기 ${d.exported_at} 기준, 계정 '${username}'`);
out.push(`-- 건수: ${JSON.stringify(d.counts)}`);
out.push('begin;');
out.push('set local search_path to t07;  -- T07 표는 t07 스키마에 있다');
out.push(`do $$ begin
  if not exists (select 1 from users where username = ${lit(username)}) then raise exception '먼저 T07 앱에서 ${username} 계정으로 가입하세요'; end if;
  if exists (select 1 from plans) then raise exception '이미 계획이 있어 이관을 멈춥니다(빈 DB에서만 실행)'; end if;
end $$;`);
for (const t of TRIGGERED) out.push(`alter table ${t} disable trigger user;`);

const insert = (table, rows, extra = {}) => {
  if (!rows.length) return;
  const cols = [...COLS[table], ...Object.keys(extra)];
  out.push(`insert into ${table} (${cols.join(', ')}) overriding system value values`);
  out.push(rows.map((r) => `  (${[...COLS[table].map((c) => lit(r[c])), ...Object.values(extra)].join(', ')})`).join(',\n') + ';');
};
insert('plans', d.plans, { user_id: owner });                 // from_review_id는 회고를 넣은 뒤 채운다(서로 참조)
insert('plan_revisions', d.plan_revisions);
insert('reviews', d.reviews);
for (const p of d.plans.filter((x) => x.from_review_id)) out.push(`update plans set from_review_id = ${lit(Number(p.from_review_id))} where id = ${lit(Number(p.id))};`);
insert('tasks', d.tasks);
insert('task_completions', d.task_completions);
insert('runs', d.runs);
for (const t of d.tag_colors || []) out.push(`insert into tag_colors (user_id, tag, color, updated_at) values (${owner}, ${lit(t.tag)}, ${lit(t.color)}, ${lit(t.updated_at)});`);

for (const t of TRIGGERED) out.push(`alter table ${t} enable trigger user;`);
// 다음에 새로 만드는 행의 ID가 옮긴 ID와 겹치지 않게
for (const t of Object.keys(COLS)) out.push(`select setval(pg_get_serial_sequence('${t}', 'id'), greatest((select coalesce(max(id), 0) from ${t}), 1));`);
out.push('commit;');
// 확인용: 실행 결과로 계정별 건수가 보인다(commit 뒤라 set local이 풀리므로 t07.을 붙인다)
out.push(`select u.username,
  (select count(*) from t07.plans p where p.user_id = u.id) as plans,
  (select count(*) from t07.tasks t join t07.plans p on p.id = t.plan_id where p.user_id = u.id) as tasks,
  (select count(*) from t07.runs r join t07.tasks t on t.id = r.task_id join t07.plans p on p.id = t.plan_id where p.user_id = u.id) as runs,
  (select count(*) from t07.reviews r join t07.plans p on p.id = r.plan_id where p.user_id = u.id) as reviews
from t07.users u where u.username = ${lit(username)};`);
if (ONELINE) {
  console.log(out.join('\n').split('\n').filter((l) => !l.trim().startsWith('--')).map((l) => l.replace(/;\s+--.*$/, ';').trim()).join(' '));
} else console.log(out.join('\n'));
