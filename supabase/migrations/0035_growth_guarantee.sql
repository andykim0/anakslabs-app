-- GT$ G1: 성과 보장 판정에 사용하는 서버 권위 색인/예외 증빙.
-- 방문 수는 기존 PII 없는 site_events 일별 집계를 재사용한다.

create table if not exists public.site_growth_signals (
  site_id uuid primary key references public.sites(id) on delete cascade,
  naver_indexed boolean,
  naver_index_checked_at timestamptz,
  exception_code text check (exception_code is null or exception_code in (
    'site-private', 'domain-expired', 'content-removed', 'force-majeure'
  )),
  updated_at timestamptz not null default now(),
  check ((naver_indexed is null) = (naver_index_checked_at is null))
);

comment on table public.site_growth_signals is
  'GT$ 서버 전용 성과 보장 증빙. 색인 신호는 서치어드바이저/URL 확인 후 기록하며 순위 스크래핑하지 않는다.';

alter table public.site_growth_signals enable row level security;
revoke all on table public.site_growth_signals from anon, authenticated;
