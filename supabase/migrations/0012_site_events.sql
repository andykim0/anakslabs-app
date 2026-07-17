-- ============================================================================
-- 0012_site_events.sql — [RPT$] PII 없는 퍼스트파티 성과 일별 집계
--
-- 방문자/IP/UA/raw referrer/session을 저장하지 않는다. 권위 행은 오직
-- site/date/event/source의 누적 카운트이며 쓰기는 service-role RPC만 허용한다.
-- ============================================================================

create table if not exists public.site_events (
  site_id          uuid not null references public.sites (id) on delete cascade,
  client_id        uuid not null references public.clients (id) on delete cascade,
  event_date       date not null,
  event_type       text not null check (event_type in ('pageview', 'tel', 'reserve', 'directions', 'form')),
  referrer_source  text not null check (referrer_source in ('naver', 'google', 'instagram', 'direct', 'other')),
  event_count      bigint not null default 1 check (event_count > 0),
  updated_at       timestamptz not null default now(),
  primary key (site_id, event_date, event_type, referrer_source)
);

comment on table public.site_events is
  '[RPT$] site/date/event/source별 익명 집계. IP·UA·raw referrer·세션·폼 내용 저장 금지';

create index if not exists site_events_client_date_idx
  on public.site_events (client_id, event_date desc);
create index if not exists site_events_site_date_idx
  on public.site_events (site_id, event_date desc);

alter table public.site_events enable row level security;

create policy site_events_select_own on public.site_events
  for select to authenticated
  using (client_id = auth.uid());

revoke all on table public.site_events from anon, authenticated;
grant select on table public.site_events to authenticated;

create or replace function public.increment_site_event(
  p_site_id uuid,
  p_event_type text,
  p_referrer_source text,
  p_event_date date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
begin
  if p_event_type not in ('pageview', 'tel', 'reserve', 'directions', 'form') then
    raise exception 'increment_site_event: 지원하지 않는 event_type';
  end if;
  if p_referrer_source not in ('naver', 'google', 'instagram', 'direct', 'other') then
    raise exception 'increment_site_event: 지원하지 않는 referrer_source';
  end if;
  if p_event_date is null or p_event_date < (current_date - 1) or p_event_date > (current_date + 1) then
    raise exception 'increment_site_event: event_date 범위가 올바르지 않습니다';
  end if;

  select client_id into v_client_id
  from public.sites
  where id = p_site_id
    and site_config is not null
    and published_at is not null
    and status in ('live', 'pending_dns');

  if v_client_id is null then
    raise exception 'increment_site_event: 발행 중인 사이트가 아닙니다';
  end if;

  insert into public.site_events (
    site_id, client_id, event_date, event_type, referrer_source, event_count
  ) values (
    p_site_id, v_client_id, p_event_date, p_event_type, p_referrer_source, 1
  )
  on conflict (site_id, event_date, event_type, referrer_source)
  do update set
    event_count = public.site_events.event_count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.increment_site_event(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.increment_site_event(uuid, text, text, date) to service_role;
