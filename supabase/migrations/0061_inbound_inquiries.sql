-- ============================================================================
-- 0061_inbound_inquiries.sql — 회사 웹사이트(anakslabs.com) 유입 문의 수신
--
-- form_submissions 와 의도적으로 분리한다. 저쪽은 테넌트 사이트의 방문자 폼이라
-- site_id/client_id FK 가 필수인데, 여기 들어오는 것은 아직 고객이 아닌 사람의
-- 리드다. 재사용하려면 우리 마케팅 사이트를 가짜 테넌트로 등록해야 하고, 그러면
-- 회사 리드가 고객 데이터 격리 규칙 안에 섞여 들어간다.
--
-- 그래서 이 테이블은 테넌트 테이블을 일절 참조하지 않는다(FK 0개). 삭제·복구·
-- 보존기간을 고객 데이터와 독립적으로 다룰 수 있어야 하기 때문이다.
--
-- 접근: service role 전용. anon/authenticated 는 SELECT 조차 불가 —
-- 리드에는 제3자의 이메일이 들어오므로 로그인 사용자에게 열 이유가 없다.
-- ============================================================================

create table if not exists public.inbound_inquiries (
  id            uuid primary key default gen_random_uuid(),
  -- 사이트 주소 또는 상호 중 하나. 폼이 한 칸으로 받으므로 여기서도 한 칸이다.
  subject       text not null check (char_length(subject) between 1 and 300),
  email         text not null check (char_length(email) between 3 and 320),
  note          text check (char_length(note) <= 4000),
  -- 어느 페이지에서 눌렀는지. 유입 분석용이며 개인을 식별하지 않는다.
  source        text check (char_length(source) <= 120),
  -- 원문 IP·UA 는 저장하지 않는다. 레이트리밋은 라우트 메모리에서 끝나고,
  -- 여기 남는 것은 중복 제출 판별에 쓰는 단방향 해시뿐이다.
  client_hash   text check (char_length(client_hash) = 64),
  created_at    timestamptz not null default now()
);

comment on table public.inbound_inquiries is
  '[web] anakslabs.com 문의 폼 수신 — 테넌트 테이블 무참조, service role 전용';
comment on column public.inbound_inquiries.client_hash is
  'IP+UA 의 SHA-256. 원문은 저장하지 않으며 중복 제출 판별에만 쓴다.';

create index if not exists inbound_inquiries_created_idx
  on public.inbound_inquiries (created_at desc);

-- RLS: 정책을 하나도 만들지 않는다 = service role(RLS bypass) 외에는 아무도 못 읽는다.
alter table public.inbound_inquiries enable row level security;

revoke all on table public.inbound_inquiries from anon, authenticated;
