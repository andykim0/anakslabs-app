-- ============================================================================
-- 0005_scans.sql — [v3 Phase 6] SEO/AEO/GEO 진단 스캔 저장
--
-- 원칙 (0001 불변식 준수):
--  * 익명 스캔 허용(client_id null) — 생성/조회는 service role(route handler) 경유.
--  * RLS: 본인에게 claim된 행만 authenticated SELECT. INSERT/UPDATE 정책 없음.
--  * claim(가입 후 귀속)은 Phase 7의 로그인 콜백이 service role로 수행.
--
-- TS 계약: web/src/lib/data/types.ts ScansRepo / ScanResult / ScanIssue
-- ============================================================================

create table if not exists public.scans (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  scores     jsonb not null,             -- { seo, aeo, geo, total } 각 0~100
  grade      text not null check (grade in ('A', 'B', 'C', 'D', 'F')),
  issues     jsonb not null default '[]'::jsonb,
  client_id  uuid references public.clients (id) on delete set null,  -- 익명은 null
  created_at timestamptz not null default now()
);

comment on table public.scans is '[v3] SEO/AEO/GEO 무료 진단 결과 — 익명 생성 허용, 가입 후 claim';

create index if not exists scans_client_idx  on public.scans (client_id, created_at desc) where client_id is not null;
create index if not exists scans_created_idx on public.scans (created_at desc);

-- RLS: 본인 claim 행만 SELECT. 생성/갱신은 service role 경유(RLS bypass).
alter table public.scans enable row level security;

create policy scans_select_own on public.scans
  for select to authenticated
  using (client_id = auth.uid());

revoke all on table public.scans from anon, authenticated;
grant select on table public.scans to authenticated;
