-- [motion 4단계] 영상 생성 로그 + 비용 가드 카운터
-- Veo 호출은 회당 실돈($0.8~$3.2). 이 로그가 (a)사이트당 상한 (b)일일 전역 상한의 진실 소스이자
-- 프롬프트 튜닝 데이터. 서버(service role) 전용 — 고객 직접 접근 불필요.

create table if not exists public.video_gen_log (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  tier text not null,
  model text not null,
  -- draft=온보딩 시안 / final=고화질 재생성 / select=시안 선택(원가 없음, 카운트 제외)
  stage text not null check (stage in ('draft', 'final', 'select')),
  prompt text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists video_gen_log_site_idx on public.video_gen_log (site_id);
create index if not exists video_gen_log_created_idx on public.video_gen_log (created_at);

-- RLS 활성(정책 없음) = service role만 접근, authenticated/anon 거부. 비용 가드는 서버 전용.
alter table public.video_gen_log enable row level security;
