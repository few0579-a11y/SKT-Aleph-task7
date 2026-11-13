-- T07 앱 전용 DB 역할 t07_app. Supabase SQL Editor에서 실행한다.
-- 1) schema.sql 실행 전에 역할을 비밀번호 없이(로그인 불가) 만든다 — 이것만으로는 아무도 접속할 수 없다.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 't07_app') then create role t07_app nologin; end if;
end $$;

-- 2) schema.sql 실행(권한·search_path·RLS 정책 부여)

-- 3) 로그인을 켜고 비밀번호를 정한다. 비밀번호는 사람이 직접 입력하고 이 파일·Git·채팅에 남기지 않는다.
--    Vercel 환경변수 DATABASE_URL(Sensitive)에만 넣는다.
-- alter role t07_app with login password '직접-정한-비밀번호';
