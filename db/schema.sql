-- T07 Plan-Do-See 다이어리 스키마 (PostgreSQL / Supabase) — T06 스키마에 회원·세션을 더한 것
-- 규칙: date 컬럼은 서울 달력 날짜(YYYY-MM-DD) 그대로, timestamptz는 UTC 저장·서울 표시, 시간 수치는 모두 "분" 정수.
-- Supabase SQL Editor에 전체를 붙여 넣고 실행합니다. 다시 실행해도 안전합니다.
--
-- T07은 T06과 같은 Supabase 프로젝트를 쓰되 별도 스키마 t07에 둔다(무료 프로젝트 2개 한도).
-- T06 앱은 public 스키마만 읽으므로 T07 기록이 T06 공개 주소로 보이지 않는다.
-- T07 앱은 전용 역할 t07_app으로만 접속하고, 이 역할은 t07 스키마에만 권한이 있다(맨 아래).
-- 실행 전 준비: db/t07-role.sql로 t07_app 역할을 먼저 만든다(비밀번호는 직접 정함).
create schema if not exists t07;
set search_path to t07;

-- ===== 카드 1: 계획과 수정 이력 =====

-- 현재 계획 값. 수정해도 id는 그대로이고 revision만 1씩 늘어난다.
create table if not exists plans (
  id                bigint generated always as identity primary key,
  title             text not null check (length(title) between 1 and 200),
  period_start      date not null,
  period_end        date not null,
  priority          text not null check (priority in ('high', 'medium', 'low')),
  success_criteria  text not null check (length(success_criteria) between 1 and 1000),
  estimated_minutes integer not null check (estimated_minutes >= 0),
  revision          integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (period_end >= period_start)
);

-- 계획의 모든 버전(revision 1 = 최초 계획)을 쌓는다. 수정·삭제 불가.
create table if not exists plan_revisions (
  id        bigint generated always as identity primary key,
  plan_id   bigint not null references plans(id),
  revision  integer not null,
  snapshot  jsonb not null,
  saved_at  timestamptz not null default now(),
  unique (plan_id, revision)
);

-- 수정 전: revision +1, id·created_at은 바꿀 수 없게 고정
create or replace function plans_before_update() returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists plans_before_update on plans;
create trigger plans_before_update before update on plans
  for each row execute function plans_before_update();

-- 생성·수정 후: 그 버전 전체를 이력에 추가
create or replace function plans_save_revision() returns trigger language plpgsql as $$
begin
  insert into plan_revisions (plan_id, revision, snapshot) values (new.id, new.revision, to_jsonb(new));
  return null;
end $$;
drop trigger if exists plans_save_revision on plans;
create trigger plans_save_revision after insert or update on plans
  for each row execute function plans_save_revision();

-- 이력은 고치거나 지울 수 없다
create or replace function plan_revisions_block() returns trigger language plpgsql as $$
begin
  raise exception 'plan_revisions는 추가만 할 수 있습니다';
end $$;
drop trigger if exists plan_revisions_block on plan_revisions;
create trigger plan_revisions_block before update or delete on plan_revisions
  for each row execute function plan_revisions_block();

-- ===== 카드 2: 할 일 =====

-- 계획에 속한 할 일. 반복 활동은 결과 단위 할 일 하나 + 실행 기록 여러 개로 담는다.
-- 삭제는 소프트 삭제(deleted_at). 목록·집계에서 빼고 행은 남긴다.
create table if not exists tasks (
  id                bigint generated always as identity primary key,
  plan_id           bigint not null references plans(id),
  title             text not null check (length(title) between 1 and 200),
  due_date          date not null,          -- 계획 기간 안인지는 API에서 검사
  priority          text not null check (priority in ('high', 'medium', 'low')),
  tags              text[] not null default '{}',
  estimated_minutes integer not null check (estimated_minutes >= 0),
  status            text not null default 'open' check (status in ('open', 'done')),
  completed_at      timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null))
);
create index if not exists tasks_plan_idx on tasks (plan_id) where deleted_at is null;

-- ===== 카드 3: 완료 기록과 실행 기록 =====

-- 완료 기록. 같은 요청(idempotency_key)은 한 번만, 한 할 일에 유효한(취소되지 않은) 완료는 하나만.
-- 완료 취소는 기록을 지우지 않고 undone_at을 채운다. 다시 완료하면 새 기록이 생긴다.
create table if not exists task_completions (
  id              bigint generated always as identity primary key,
  task_id         bigint not null references tasks(id),
  idempotency_key uuid not null unique,
  completed_at    timestamptz not null default now(),
  undone_at       timestamptz,
  check (undone_at is null or undone_at >= completed_at)
);
create unique index if not exists task_completions_one_active on task_completions (task_id) where undone_at is null;

-- 완료 기록은 지울 수 없고, 바꿀 수 있는 것은 undone_at을 한 번 채우는 것뿐
create or replace function task_completions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception '완료 기록은 지울 수 없습니다'; end if;
  if new.id <> old.id or new.task_id <> old.task_id or new.idempotency_key <> old.idempotency_key
     or new.completed_at <> old.completed_at or old.undone_at is not null then
    raise exception '완료 기록은 취소 시각만 한 번 기록할 수 있습니다';
  end if;
  return new;
end $$;
drop trigger if exists task_completions_guard on task_completions;
create trigger task_completions_guard before update or delete on task_completions
  for each row execute function task_completions_guard();

-- 완료 처리(멱등). 할 일 행을 잠가 동시 요청을 줄 세운다.
--  같은 키 재요청 → 새 기록 없음 / 이미 유효한 완료가 있음 → 새 기록 없음 / 그 밖 → 기록 1건 + 할 일 상태 done
create or replace function complete_task(p_task bigint, p_key uuid) returns jsonb language plpgsql as $$
declare t tasks; c task_completions;
begin
  select * into t from tasks where id = p_task and deleted_at is null for update;
  if not found then raise exception '할 일을 찾을 수 없습니다' using errcode = 'P0002'; end if;
  select * into c from task_completions where idempotency_key = p_key;
  if found then
    if c.task_id <> p_task then raise exception '다른 할 일에 쓰인 완료 키입니다' using errcode = '22023'; end if;
    return jsonb_build_object('created', false, 'reason', 'same_key', 'completion_id', c.id);
  end if;
  select * into c from task_completions where task_id = p_task and undone_at is null;
  if found then
    return jsonb_build_object('created', false, 'reason', 'already_done', 'completion_id', c.id);
  end if;
  insert into task_completions (task_id, idempotency_key) values (p_task, p_key) returning * into c;
  update tasks set status = 'done', completed_at = c.completed_at, updated_at = now() where id = p_task;
  return jsonb_build_object('created', true, 'completion_id', c.id);
end $$;

create or replace function uncomplete_task(p_task bigint) returns jsonb language plpgsql as $$
declare n int;
begin
  perform 1 from tasks where id = p_task and deleted_at is null for update;
  if not found then raise exception '할 일을 찾을 수 없습니다' using errcode = 'P0002'; end if;
  update task_completions set undone_at = now() where task_id = p_task and undone_at is null;
  get diagnostics n = row_count;
  update tasks set status = 'open', completed_at = null, updated_at = now() where id = p_task;
  return jsonb_build_object('undone', n);
end $$;

-- 실행 기록. 계획·할 일 값은 건드리지 않는 별도 테이블이며 추가만 할 수 있다.
create table if not exists runs (
  id             bigint generated always as identity primary key,
  task_id        bigint not null references tasks(id),
  started_at     timestamptz not null,
  ended_at       timestamptz not null,
  actual_minutes integer not null check (actual_minutes >= 0),
  blocker        text check (blocker is null or length(blocker) between 1 and 500),
  created_at     timestamptz not null default now(),
  check (ended_at > started_at),
  check (actual_minutes <= ceil(extract(epoch from (ended_at - started_at)) / 60))
);
create index if not exists runs_task_idx on runs (task_id);

create or replace function runs_block() returns trigger language plpgsql as $$
begin
  raise exception '실행 기록은 추가만 할 수 있습니다';
end $$;
drop trigger if exists runs_block on runs;
create trigger runs_block before update or delete on runs
  for each row execute function runs_block();

-- ===== 카드 4: 회고와 다음 계획 반영 =====

-- 회고. 저장 시점 집계(snapshot)와 다음 계획에 넘길 개선점 한 줄. 추가만 할 수 있다.
create table if not exists reviews (
  id          bigint generated always as identity primary key,
  plan_id     bigint not null references plans(id),
  scope_from  date,                  -- 주차를 골랐을 때 범위(마감일 기준), 계획 전체면 null
  scope_to    date,
  improvement text not null check (length(improvement) between 1 and 300),
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  check ((scope_from is null) = (scope_to is null))
);

create or replace function reviews_block() returns trigger language plpgsql as $$
begin
  raise exception '회고는 추가만 할 수 있습니다';
end $$;
drop trigger if exists reviews_block on reviews;
create trigger reviews_block before update or delete on reviews
  for each row execute function reviews_block();

-- 다음 계획: 어느 회고에서 왔는지와 그때의 개선점 문장(복사본)
alter table plans add column if not exists from_review_id bigint references reviews(id);
alter table plans add column if not exists carried_improvement text;

-- ===== 화면: 태그 색 =====

-- 타임테이블·캘린더에서 태그별로 쓸 색. 정하지 않은 태그는 화면이 기본 색을 고른다.
create table if not exists tag_colors (
  tag        text primary key check (length(tag) between 1 and 30),
  color      text not null check (color ~ '^#[0-9a-f]{6}$'),
  updated_at timestamptz not null default now()
);

-- Supabase 공개 REST(anon 키)로는 접근할 수 없게 RLS만 켜고 정책은 두지 않는다.
-- 앱은 Vercel 서버 함수에서 DATABASE_URL로만 접근한다.
alter table plans enable row level security;
alter table plan_revisions enable row level security;
alter table tasks enable row level security;
alter table task_completions enable row level security;
alter table runs enable row level security;
alter table reviews enable row level security;
alter table tag_colors enable row level security;

-- ===== T07 카드 1~3: 회원·세션과 사용자별 자료 =====
-- 비밀번호는 argon2id 해시만 저장한다(평문 컬럼 없음). 해시는 서버 함수에서 @node-rs/argon2로 만든다.
create table if not exists users (
  id                  bigint generated always as identity primary key,
  username            text not null check (username ~ '^[a-z0-9]{3,20}$'),  -- 소문자로 바꿔 저장 → 대소문자만 다른 중복 가입 불가
  password_hash       text not null check (password_hash like '$argon2id$%'),
  password_changed_at timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create unique index if not exists users_username_key on users (username);

-- 로그인 세션. 브라우저 쿠키에는 무작위 값(토큰)만, DB에는 그 SHA-256 해시만 둔다.
-- 로그아웃·비밀번호 변경 때 행을 지우면 같은 쿠키 값은 바로 거절된다. 만료는 로그인 후 7일 고정.
create table if not exists sessions (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions (user_id);

-- 자료의 주인: 계획에 user_id를 두고, 할 일·완료·실행 기록·회고·이력은 계획을 거쳐 주인을 찾는다.
alter table plans add column if not exists user_id bigint references users(id);
alter table plans alter column user_id set not null;  -- 새 DB(T07)는 빈 상태에서 시작하므로 바로 필수로 둔다
create index if not exists plans_user_idx on plans (user_id);

-- 태그 색도 사용자별로 바꾼다(같은 태그 이름이라도 사용자마다 다른 색)
alter table tag_colors add column if not exists user_id bigint references users(id);
alter table tag_colors alter column user_id set not null;
alter table tag_colors drop constraint if exists tag_colors_pkey;
create unique index if not exists tag_colors_user_tag on tag_colors (user_id, tag);

alter table users enable row level security;
alter table sessions enable row level security;

-- ===== T07: 전용 역할 t07_app 권한 =====
-- t07_app은 t07 스키마의 표만 읽고 쓸 수 있다(public 스키마의 T06 표에는 권한 없음).
-- 표마다 RLS가 켜져 있으므로 t07_app에만 전체 허용 정책을 둔다. 사용자별 구분은 API(user_id 조건)가 한다.
-- anon·authenticated(공개 REST)에는 아무 권한도 주지 않는다.
do $$
declare t text;
begin
  if not exists (select 1 from pg_roles where rolname = 't07_app') then
    raise notice 't07_app 역할이 없어 권한 설정을 건너뜁니다(db/t07-role.sql 먼저 실행)';
    return;
  end if;
  execute 'alter role t07_app set search_path = t07';
  execute 'grant usage on schema t07 to t07_app';
  execute 'grant select, insert, update, delete on all tables in schema t07 to t07_app';
  execute 'grant usage, select on all sequences in schema t07 to t07_app';
  execute 'grant execute on all functions in schema t07 to t07_app';
  for t in select tablename from pg_tables where schemaname = 't07' loop
    execute format('drop policy if exists t07_app_all on t07.%I', t);
    execute format('create policy t07_app_all on t07.%I for all to t07_app using (true) with check (true)', t);
  end loop;
end $$;
