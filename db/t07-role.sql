-- T07 앱 전용 DB 역할. Supabase SQL Editor에서 한 번만 실행한다.
-- '여기에-직접-정한-비밀번호'를 직접 정한 긴 비밀번호로 바꿔서 실행하고, 이 파일에는 저장하지 않는다.
-- 비밀번호는 Vercel 환경변수 DATABASE_URL(Sensitive)에만 넣는다.
create role t07_app login password '여기에-직접-정한-비밀번호';
