-- GT$ G3: 검색 소유확인·등록 운영 큐. 서비스 역할 전용이며 고객/브라우저에서 직접 쓰지 않는다.

create table if not exists public.search_registration_queue (
  site_id uuid primary key references public.sites (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  account_label text check (account_label is null or account_label ~ '^[A-Z0-9_-]{2,40}$'),
  naver_verification text check (naver_verification is null or naver_verification ~ '^[A-Za-z0-9_-]{6,200}$'),
  google_verification text check (google_verification is null or google_verification ~ '^[A-Za-z0-9_-]{6,200}$'),
  index_status text not null default 'unchecked' check (index_status in ('unchecked', 'present', 'absent')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists search_registration_queue_account_idx
  on public.search_registration_queue (account_label, status)
  where account_label is not null;

alter table public.search_registration_queue enable row level security;
revoke all on table public.search_registration_queue from anon, authenticated;

comment on table public.search_registration_queue is
  '관리자 전용 검색 등록 대행 큐. 계정 비밀번호가 아닌 운영 계정 라벨만 저장';
