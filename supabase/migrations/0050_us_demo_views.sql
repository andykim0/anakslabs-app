-- US demo preview heartbeat ledger and idempotent re-interest alerts.
-- Raw IP addresses, user-agent strings, full referrers, and bearer tokens are never stored.

create table public.demo_views (
  id                   uuid primary key default gen_random_uuid(),
  preview_id           uuid not null references public.shared_site_previews (id) on delete cascade,
  slug                 text not null,
  event_id             uuid not null unique,
  visitor_id           text not null,
  session_id           text not null,
  visit_count          integer not null check (visit_count between 1 and 10000),
  hours_since_last     numeric(10, 2) check (
    hours_since_last is null or hours_since_last between 0 and 87600
  ),
  opened_at            timestamptz not null,
  local_hour           smallint not null check (local_hour between 0 and 23),
  timezone             text not null check (char_length(timezone) between 1 and 64),
  active_seconds       integer not null check (active_seconds between 0 and 7200),
  max_scroll_pct       smallint not null check (max_scroll_pct between 0 and 100),
  sections             jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  clicks               jsonb not null default '{}'::jsonb check (jsonb_typeof(clicks) = 'object'),
  referrer             jsonb not null check (jsonb_typeof(referrer) = 'object'),
  is_mobile            boolean not null,
  final                boolean not null default false,
  ip_hash              text not null,
  hash_key_version     smallint not null check (hash_key_version > 0),
  received_at          timestamptz not null default now(),
  constraint demo_views_slug_check check (slug = preview_id::text),
  constraint demo_views_visitor_hash_check check (visitor_id ~ '^[0-9a-f]{64}$'),
  constraint demo_views_session_hash_check check (session_id ~ '^[0-9a-f]{64}$'),
  constraint demo_views_ip_hash_check check (ip_hash ~ '^[0-9a-f]{64}$')
);

create index demo_views_slug_opened_idx
  on public.demo_views (slug, opened_at desc);
create index demo_views_visitor_idx
  on public.demo_views (visitor_id);
create index demo_views_received_idx
  on public.demo_views (received_at);

comment on table public.demo_views is
  'Thirty-day service-only heartbeat ledger for expiring US medical outreach previews.';

create table public.demo_view_alerts (
  id                 uuid primary key default gen_random_uuid(),
  preview_id         uuid not null references public.shared_site_previews (id) on delete cascade,
  visitor_id         text not null,
  session_id         text not null,
  signal_kind        text not null check (signal_kind in ('strong_reinterest_48h')),
  signal_label       text not null,
  visit_count        integer not null check (visit_count >= 2),
  hours_since_last   numeric(10, 2) not null check (hours_since_last between 0 and 48),
  delivery_status    text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  delivered_at       timestamptz,
  last_error_code    text,
  created_at         timestamptz not null default now(),
  unique (preview_id, visitor_id, session_id, signal_kind),
  constraint demo_view_alerts_visitor_hash_check check (visitor_id ~ '^[0-9a-f]{64}$'),
  constraint demo_view_alerts_session_hash_check check (session_id ~ '^[0-9a-f]{64}$')
);

create index demo_view_alerts_preview_created_idx
  on public.demo_view_alerts (preview_id, created_at desc);

comment on table public.demo_view_alerts is
  'Idempotent operational alerts. Labels describe possible re-interest, never confirmed sharing or purchase.';

alter table public.demo_views enable row level security;
alter table public.demo_view_alerts enable row level security;

revoke all on table public.demo_views
  from public, anon, authenticated, service_role;
revoke all on table public.demo_view_alerts
  from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.demo_views
  to service_role;
grant select, insert, update, delete on table public.demo_view_alerts
  to service_role;

create or replace function public.record_demo_view(
  p_preview_id uuid,
  p_slug text,
  p_event_id uuid,
  p_visitor_id text,
  p_session_id text,
  p_ip_hash text,
  p_hash_key_version smallint,
  p_opened_at timestamptz,
  p_local_hour smallint,
  p_timezone text,
  p_active_seconds integer,
  p_max_scroll_pct smallint,
  p_sections jsonb,
  p_clicks jsonb,
  p_referrer jsonb,
  p_is_mobile boolean,
  p_final boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_existing_session boolean;
  v_session_count integer;
  v_previous_opened_at timestamptz;
  v_visit_count integer;
  v_hours_since_last numeric(10, 2);
  v_inserted boolean;
  v_alert_id uuid;
begin
  if p_slug <> p_preview_id::text then
    raise exception 'record_demo_view: slug mismatch';
  end if;

  if not exists (
    select 1
      from public.shared_site_previews preview
     where preview.id = p_preview_id
       and preview.revoked_at is null
       and preview.expires_at > now()
       and preview.site_config #>> '{meta,locale}' = 'en-US'
       and preview.site_config #>> '{meta,market}' = 'US-CA'
       and preview.site_config #>> '{meta,jurisdiction}' = 'US'
  ) then
    raise exception 'record_demo_view: preview unavailable';
  end if;

  if exists (select 1 from public.demo_views where event_id = p_event_id) then
    return jsonb_build_object(
      'recorded', false,
      'visitCount', 0,
      'hoursSinceLast', null,
      'alertId', null
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_preview_id::text || ':' || p_visitor_id, 0)
  );

  select
    coalesce(bool_or(view.session_id = p_session_id), false),
    count(distinct view.session_id)::integer,
    max(view.opened_at) filter (where view.session_id <> p_session_id)
    into v_existing_session, v_session_count, v_previous_opened_at
    from public.demo_views view
   where view.preview_id = p_preview_id
     and view.visitor_id = p_visitor_id;

  if v_existing_session then
    select view.visit_count, view.hours_since_last
      into v_visit_count, v_hours_since_last
      from public.demo_views view
     where view.preview_id = p_preview_id
       and view.visitor_id = p_visitor_id
       and view.session_id = p_session_id
     order by view.received_at asc
     limit 1;
  else
    v_visit_count := v_session_count + 1;
    if v_previous_opened_at is not null then
      v_hours_since_last := round(
        (extract(epoch from (p_opened_at - v_previous_opened_at)) / 3600)::numeric,
        2
      );
      v_hours_since_last := greatest(0, least(87600, v_hours_since_last));
    end if;
  end if;

  insert into public.demo_views (
    preview_id,
    slug,
    event_id,
    visitor_id,
    session_id,
    visit_count,
    hours_since_last,
    opened_at,
    local_hour,
    timezone,
    active_seconds,
    max_scroll_pct,
    sections,
    clicks,
    referrer,
    is_mobile,
    final,
    ip_hash,
    hash_key_version
  )
  values (
    p_preview_id,
    p_slug,
    p_event_id,
    p_visitor_id,
    p_session_id,
    v_visit_count,
    v_hours_since_last,
    p_opened_at,
    p_local_hour,
    p_timezone,
    p_active_seconds,
    p_max_scroll_pct,
    p_sections,
    p_clicks,
    p_referrer,
    p_is_mobile,
    p_final,
    p_ip_hash,
    p_hash_key_version
  )
  on conflict (event_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    return jsonb_build_object(
      'recorded', false,
      'visitCount', v_visit_count,
      'hoursSinceLast', v_hours_since_last,
      'alertId', null
    );
  end if;

  if not v_existing_session
     and v_visit_count >= 2
     and v_hours_since_last is not null
     and v_hours_since_last < 48 then
    insert into public.demo_view_alerts (
      preview_id,
      visitor_id,
      session_id,
      signal_kind,
      signal_label,
      visit_count,
      hours_since_last
    )
    values (
      p_preview_id,
      p_visitor_id,
      p_session_id,
      'strong_reinterest_48h',
      '48시간 안에 다시 열어 본 강한 재관심 신호입니다. 다른 사람에게 전달됐을 가능성은 있지만 공유나 구매를 확정하지 않습니다.',
      v_visit_count,
      v_hours_since_last
    )
    on conflict (preview_id, visitor_id, session_id, signal_kind) do nothing
    returning id into v_alert_id;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'visitCount', v_visit_count,
    'hoursSinceLast', v_hours_since_last,
    'alertId', v_alert_id
  );
end;
$function$;

revoke execute on function public.record_demo_view(
  uuid, text, uuid, text, text, text, smallint, timestamptz, smallint,
  text, integer, smallint, jsonb, jsonb, jsonb, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.record_demo_view(
  uuid, text, uuid, text, text, text, smallint, timestamptz, smallint,
  text, integer, smallint, jsonb, jsonb, jsonb, boolean, boolean
) to service_role;

create or replace function public.purge_expired_demo_views(
  p_before timestamptz default (now() - interval '30 days')
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_views bigint;
  v_alerts bigint;
begin
  if p_before is null then
    raise exception 'purge_expired_demo_views: cutoff is required';
  end if;

  delete from public.demo_views
   where received_at < p_before;
  get diagnostics v_views = row_count;

  delete from public.demo_view_alerts
   where created_at < p_before;
  get diagnostics v_alerts = row_count;

  return jsonb_build_object('views', v_views, 'alerts', v_alerts);
end;
$function$;

revoke execute on function public.purge_expired_demo_views(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_expired_demo_views(timestamptz)
  to service_role;
