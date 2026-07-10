-- ============================================================================
-- 0006_service_role_grants.sql — 앱 테이블에 service_role DML 명시 부여
--
-- 배경: 앱 데이터 계층은 service_role 단일 서버 클라이언트로만 DB에 접근한다
--   (web/src/lib/data/supabase/client.ts — 브라우저→PostgREST 직결 경로 없음, RLS는 2차 방어).
-- 버그: 0001/0003/0005는 anon/authenticated 회수만 하고 service_role의
--   SELECT/INSERT/UPDATE/DELETE 를 Supabase 플랫폼 기본 권한에 의존했다. 로컬 CLI(및
--   기본 권한이 다른 환경)에서는 service_role에 REFERENCES/TRIGGER/TRUNCATE만 남아
--   앱 런타임 전부가 "permission denied for table ..."로 실패한다(실 DB 모드 통짜 차단).
-- 조치: 서버가 실제로 쓰는 앱 테이블에 DML을 명시 부여한다. Supabase의 service_role
--   본래 의미(RLS 우회·서버 전용 풀 액세스)와 일치.
--
-- 범위 제외(의도적): credit_ledger·credit_balances·payments 는 0001에서 service_role
--   테이블 권한을 회수해 security definer 함수 경유만 강제한다 — 그 불변식은 유지.
-- ============================================================================

grant select, insert, update, delete on table public.clients             to service_role;
grant select, insert, update, delete on table public.sites               to service_role;
grant select, insert, update, delete on table public.edit_requests       to service_role;
grant select, insert, update, delete on table public.form_submissions    to service_role;
grant select, insert, update, delete on table public.scans               to service_role;
grant select, insert, update, delete on table public.qa_automation_rules to service_role;
