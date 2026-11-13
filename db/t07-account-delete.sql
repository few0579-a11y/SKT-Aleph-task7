-- ===== T07 카드 5: 계정 삭제(C134) =====
-- schema.sql·t07-observation.sql 뒤에 실행한다(다시 실행해도 안전).
-- 원칙: 실행 기록·완료 기록·회고·계획 이력·관찰은 평소에는 "추가만" 된다.
--       지우는 길은 delete_account() 하나뿐이고, 이 함수는 한 사용자의 자료 전부를 한 문장(한 트랜잭션)으로 지운다.
set search_path to t07;

-- 1) 추가만 허용하는 트리거: delete_account()가 실행 중일 때(그 트랜잭션 안에서만 켜지는 표시)만 삭제를 통과시킨다.
create or replace function t07_deleting_account() returns boolean language sql stable as $$
  select coalesce(current_setting('t07.deleting_account', true), '') <> ''
$$;

create or replace function plan_revisions_block() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and t07_deleting_account() then return old; end if;
  raise exception 'plan_revisions는 추가만 할 수 있습니다';
end $$;

create or replace function runs_block() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and t07_deleting_account() then return old; end if;
  raise exception '실행 기록은 추가만 할 수 있습니다';
end $$;

create or replace function reviews_block() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and t07_deleting_account() then return old; end if;
  raise exception '회고는 추가만 할 수 있습니다';
end $$;

create or replace function observation_block() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and t07_deleting_account() then return old; end if;
  raise exception '관찰 설정과 규칙 변경 기록은 추가만 할 수 있습니다';
end $$;

create or replace function task_completions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if t07_deleting_account() then return old; end if;
    raise exception '완료 기록은 지울 수 없습니다';
  end if;
  if new.id <> old.id or new.task_id <> old.task_id or new.idempotency_key <> old.idempotency_key
     or new.completed_at <> old.completed_at or old.undone_at is not null then
    raise exception '완료 기록은 취소 시각만 한 번 기록할 수 있습니다';
  end if;
  return new;
end $$;

-- 2) 계정 하나와 그 자료 전부를 지운다. 계획↔회고가 서로를 가리키므로 모든 삭제를 한 문장(CTE)에 넣는다
--    (외래 키는 문장이 끝날 때 확인되므로 순서 문제가 없다). 지운 건수를 돌려준다.
--    SECURITY DEFINER: 앱 역할(t07_app)에는 이 표들의 DELETE 권한이 없고, 이 함수만 지울 수 있다.
create or replace function delete_account(p_user bigint) returns jsonb
language plpgsql security definer set search_path = t07 as $$
declare result jsonb;
begin
  if not exists (select 1 from users where id = p_user) then
    raise exception '계정을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  perform set_config('t07.deleting_account', p_user::text, true);  -- 이 트랜잭션에서만
  with
    my_plans as (select id from plans where user_id = p_user),
    my_tasks as (select id from tasks where plan_id in (select id from my_plans)),
    my_obs as (select id from observations where user_id = p_user),
    d_rc as (delete from observation_rule_changes where observation_id in (select id from my_obs) returning 1),
    d_obs as (delete from observations where user_id = p_user returning 1),
    d_runs as (delete from runs where task_id in (select id from my_tasks) returning 1),
    d_comp as (delete from task_completions where task_id in (select id from my_tasks) returning 1),
    d_tasks as (delete from tasks where id in (select id from my_tasks) returning 1),
    d_rev as (delete from reviews where plan_id in (select id from my_plans) returning 1),
    d_hist as (delete from plan_revisions where plan_id in (select id from my_plans) returning 1),
    d_plans as (delete from plans where user_id = p_user returning 1),
    d_tags as (delete from tag_colors where user_id = p_user returning 1),
    d_sess as (delete from sessions where user_id = p_user returning 1),
    d_user as (delete from users where id = p_user returning 1)
  select jsonb_build_object(
    'users', (select count(*) from d_user), 'sessions', (select count(*) from d_sess),
    'plans', (select count(*) from d_plans), 'plan_revisions', (select count(*) from d_hist),
    'tasks', (select count(*) from d_tasks), 'task_completions', (select count(*) from d_comp),
    'runs', (select count(*) from d_runs), 'reviews', (select count(*) from d_rev),
    'tag_colors', (select count(*) from d_tags), 'observations', (select count(*) from d_obs),
    'observation_rule_changes', (select count(*) from d_rc))
  into result;
  perform set_config('t07.deleting_account', '', true);
  return result;
end $$;

revoke all on function delete_account(bigint) from public;

-- 3) 앱 역할 권한 좁히기: 지우기는 세션(로그아웃)만 직접. 나머지 삭제는 delete_account()로만.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 't07_app') then return; end if;
  execute 'revoke delete on t07.plans, t07.plan_revisions, t07.tasks, t07.task_completions, t07.runs, t07.reviews, t07.tag_colors, t07.users, t07.observations, t07.observation_rule_changes from t07_app';
  execute 'grant execute on function t07.delete_account(bigint) to t07_app';
end $$;
