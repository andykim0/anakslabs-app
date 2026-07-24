-- CONN: idempotent anonymous conversion collection, connector credentials/cache,
-- and additive monthly report schema compatibility.
--
-- Visitor events remain aggregate-only in site_events. The short-lived receipt
-- nonce is scoped to one delivery attempt and is never a visitor or session id.

alter table public.site_events
  drop constraint if exists site_events_event_type_check;

alter table public.site_events
  add constraint site_events_event_type_check check (
    event_type in (
      'pageview', 'tel', 'reserve', 'directions', 'form', 'chat', 'instagram'
    )
  );

create table public.site_event_receipts (
  event_id    uuid primary key,
  site_id     uuid not null references public.sites (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  constraint site_event_receipts_expiry_check check (expires_at > created_at)
);

create index site_event_receipts_expiry_idx
  on public.site_event_receipts (expires_at);

comment on table public.site_event_receipts is
  'Short-lived per-delivery nonce receipts for retry deduplication. No visitor, session, IP, user-agent, URL, or referrer is stored.';

alter table public.site_event_receipts enable row level security;
revoke all on table public.site_event_receipts from public, anon, authenticated, service_role;
grant select on table public.site_event_receipts to service_role;

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
  if p_event_type not in (
    'pageview', 'tel', 'reserve', 'directions', 'form', 'chat', 'instagram'
  ) then
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

create or replace function public.record_site_event(
  p_site_id uuid,
  p_event_type text,
  p_referrer_source text,
  p_event_date date,
  p_event_id uuid,
  p_received_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_recorded boolean := false;
begin
  if p_event_id is null then
    raise exception 'record_site_event: event id is required';
  end if;
  if p_event_type not in (
    'pageview', 'tel', 'reserve', 'directions', 'form', 'chat', 'instagram'
  ) then
    raise exception 'record_site_event: invalid event type';
  end if;
  if p_referrer_source not in ('naver', 'google', 'instagram', 'direct', 'other') then
    raise exception 'record_site_event: invalid referrer source';
  end if;
  if p_event_date is null or p_event_date < (current_date - 1) or p_event_date > (current_date + 1) then
    raise exception 'record_site_event: invalid event date';
  end if;
  if p_received_at is null then
    raise exception 'record_site_event: received time is required';
  end if;

  select client_id into v_client_id
  from public.sites
  where id = p_site_id
    and site_config is not null
    and published_at is not null
    and status in ('live', 'pending_dns');

  if v_client_id is null then
    raise exception 'record_site_event: published site not found';
  end if;

  insert into public.site_event_receipts (
    event_id, site_id, created_at, expires_at
  ) values (
    p_event_id, p_site_id, p_received_at, p_received_at + interval '48 hours'
  )
  on conflict (event_id) do nothing;
  v_recorded := found;

  if not v_recorded then
    return false;
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

  return true;
end;
$$;

revoke execute on function public.record_site_event(
  uuid, text, text, date, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_site_event(
  uuid, text, text, date, uuid, timestamptz
) to service_role;

create or replace function public.purge_site_event_receipts(
  p_before timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted bigint;
begin
  if p_before is null then
    raise exception 'purge_site_event_receipts: cutoff is required';
  end if;
  delete from public.site_event_receipts where expires_at <= p_before;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.purge_site_event_receipts(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_site_event_receipts(timestamptz)
  to service_role;

-- Instagram credentials are site-specific. Ciphertext is AES-256-GCM output;
-- the key itself lives only in server environment configuration. key_version
-- makes rotation additive without ever exposing plaintext to SQL or clients.
create table public.site_connector_credentials (
  site_id           uuid not null references public.sites (id) on delete cascade,
  connector_type    text not null check (connector_type = 'instagram'),
  key_version       integer not null check (key_version > 0),
  ciphertext        text not null check (length(ciphertext) > 0),
  initialization_iv text not null check (length(initialization_iv) > 0),
  auth_tag          text not null check (length(auth_tag) > 0),
  token_expires_at  timestamptz,
  status            text not null default 'active' check (
                      status in ('active', 'reauthorization_required', 'disabled')
                    ),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (site_id, connector_type)
);

comment on table public.site_connector_credentials is
  'Server-only encrypted connector credentials. Plaintext tokens are forbidden in database rows, logs, SiteConfig, and client responses.';

alter table public.site_connector_credentials enable row level security;
revoke all on table public.site_connector_credentials from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.site_connector_credentials to service_role;

create table public.site_connector_cache (
  site_id          uuid not null references public.sites (id) on delete cascade,
  connector_type   text not null check (connector_type = 'instagram'),
  cache_payload    jsonb not null default '{"items":[]}'::jsonb,
  fetched_at       timestamptz not null,
  expires_at       timestamptz not null,
  last_error_code  text check (
                     last_error_code is null
                     or (
                       length(last_error_code) between 1 and 80
                       and last_error_code ~ '^[A-Z0-9_:-]+$'
                     )
                   ),
  updated_at       timestamptz not null default now(),
  primary key (site_id, connector_type),
  constraint site_connector_cache_expiry_check check (expires_at > fetched_at),
  constraint site_connector_cache_payload_check check (
    jsonb_typeof(cache_payload) = 'object'
    and cache_payload ? 'items'
    and jsonb_typeof(cache_payload -> 'items') = 'array'
  )
);

comment on table public.site_connector_cache is
  'Sanitized server cache for connector presentation. Tokens and raw provider errors are forbidden.';

alter table public.site_connector_cache enable row level security;
revoke all on table public.site_connector_cache from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.site_connector_cache to service_role;

alter table public.monthly_site_reports
  drop constraint if exists monthly_site_reports_payload_shape;

alter table public.monthly_site_reports
  add constraint monthly_site_reports_payload_shape check (
    jsonb_typeof(report_payload) = 'object'
    and (report_payload ->> 'schemaVersion')::integer in (1, 2)
    and report_payload ?& array[
      'schemaVersion', 'siteId', 'period', 'comparisonPeriod', 'metrics',
      'sources', 'hasCurrentData', 'hasComparisonData', 'insight'
    ]
    and report_payload ->> 'siteId' = site_id::text
    and report_payload #>> '{period,month}' = to_char(period_month, 'YYYY-MM')
  );
