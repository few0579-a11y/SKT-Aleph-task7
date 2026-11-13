-- ===== T07 카드 5: 5일 관찰(질문·지표·규칙)과 계획 규칙 변경 =====
-- schema.sql 끝에 이어 실행한다(다시 실행해도 안전). 둘 다 추가만 할 수 있다.
set search_path to t07;

-- 관찰 설정: 사용자마다 하나. 1일차 전에 한 번 정하고 바꾸지 않는다.
create table if not exists observations (
  id             bigint generated always as identity primary key,
  user_id        bigint not null unique references users(id),
  start_date     date not null,                 -- 서울 날짜. 이날부터의 실행 기록을 본다
  question       text not null check (length(question) between 1 and 300),
  metric         text not null check (length(metric) between 1 and 100),
  unit           text not null check (length(unit) between 1 and 20),
  calc_rule      text not null check (length(calc_rule) between 1 and 1000),
  missing_rule   text not null check (length(missing_rule) between 1 and 300),
  duplicate_rule text not null check (length(duplicate_rule) between 1 and 300),
  outlier_rule   text not null check (length(outlier_rule) between 1 and 300),
  rounding_rule  text not null check (length(rounding_rule) between 1 and 300),
  week_start     text not null check (length(week_start) between 1 and 20),
  rule_before    text not null check (length(rule_before) between 1 and 300),
  created_at     timestamptz not null default now()
);

-- 계획 규칙 변경: 관찰마다 한 번. 바꾼 시각은 서버 시각(now())만 쓴다.
create table if not exists observation_rule_changes (
  id             bigint generated always as identity primary key,
  observation_id bigint not null unique references observations(id),
  rule_after     text not null check (length(rule_after) between 1 and 300),
  reason         text not null check (length(reason) between 1 and 500),
  changed_at     timestamptz not null default now()
);

create or replace function observation_block() returns trigger language plpgsql as $$
begin
  raise exception '관찰 설정과 규칙 변경 기록은 추가만 할 수 있습니다';
end $$;
drop trigger if exists observations_block on observations;
create trigger observations_block before update or delete on observations
  for each row execute function observation_block();
drop trigger if exists observation_rule_changes_block on observation_rule_changes;
create trigger observation_rule_changes_block before update or delete on observation_rule_changes
  for each row execute function observation_block();

alter table observations enable row level security;
alter table observation_rule_changes enable row level security;

do $$
declare t text;
begin
  if not exists (select 1 from pg_roles where rolname = 't07_app') then return; end if;
  execute 'grant select, insert on t07.observations, t07.observation_rule_changes to t07_app';
  execute 'grant usage, select on all sequences in schema t07 to t07_app';
  execute 'grant execute on all functions in schema t07 to t07_app';
  foreach t in array array['observations', 'observation_rule_changes'] loop
    execute format('drop policy if exists t07_app_all on t07.%I', t);
    execute format('create policy t07_app_all on t07.%I for all to t07_app using (true) with check (true)', t);
  end loop;
end $$;
