-- ============================================================================
-- 0003_form_submissions.sql — [v3 Phase 3] 테넌트 사이트 문의 폼 수신
--
-- 원칙 (0001과 동일 불변식):
--  * RLS: 사이트 소유 client만 SELECT. INSERT는 service role(route handler 경유)만 —
--    authenticated에 INSERT 정책을 만들지 않고 테이블 쓰기 권한도 부여하지 않는다.
--  * client_id는 사이트 소유자 비정규화 컬럼 (RLS 조회용).
--
-- TS 계약: web/src/lib/data/types.ts FormSubmissionsRepo / FormSubmission
-- ============================================================================

create table if not exists public.form_submissions (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites (id) on delete cascade,
  -- 사이트 소유 client (RLS 조회용 비정규화 — insert 시 서버가 sites.client_id로 채움)
  client_id  uuid not null references public.clients (id) on delete cascade,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.form_submissions is '[v3] 테넌트 사이트 문의 폼 제출 — INSERT는 service role 경유만';

create index if not exists form_submissions_site_idx   on public.form_submissions (site_id, created_at desc);
create index if not exists form_submissions_client_idx on public.form_submissions (client_id, created_at desc);

-- RLS: 소유 client만 SELECT. INSERT/UPDATE/DELETE 정책 없음(= authenticated 불가).
alter table public.form_submissions enable row level security;

create policy form_submissions_select_own on public.form_submissions
  for select to authenticated
  using (client_id = auth.uid());

-- 권한: anon 접근 차단, authenticated는 SELECT만 (INSERT는 service role의 RLS bypass 경유)
revoke all on table public.form_submissions from anon, authenticated;
grant select on table public.form_submissions to authenticated;
