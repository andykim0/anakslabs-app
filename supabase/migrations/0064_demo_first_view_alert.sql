-- 데모 링크를 처음 열어 본 순간에 신호를 붙인다.
--
-- 48시간 내 재방문은 즉시 알림이 갔지만 첫 열람은 아무 것도 남기지 않았다. 아웃리치가 기다리는
-- 것은 정확히 그 첫 열람이다. 알림은 전부 이 RPC 안에서 계산되고 demo_view_alerts 에 기록되므로,
-- 배달 기록과 정확히 한 번 보장을 가지려면 신호 종류를 여는 이 마이그레이션이 필요하다.
--
-- 적용 전까지는 /api/demo-track 이 원장 없이 웹훅으로 직접 쏜다(배달 기록 없음, 프로세스 단위
-- 중복 제거). 이 마이그레이션이 적용되면 RPC가 first_view 알림을 반환하고 라우트의 임시 경로는
-- 스스로 멈춘다 — 두 경로가 동시에 발화하는 구간은 없다.

alter table public.demo_view_alerts
  drop constraint demo_view_alerts_signal_kind_check;

alter table public.demo_view_alerts
  add constraint demo_view_alerts_signal_kind_check check (
    signal_kind in ('strong_reinterest_48h', 'procedure_entry', 'first_view')
  );

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
  v_first_view_alert_id uuid;
  v_procedure_alert_id uuid;
  v_reinterest_alert_id uuid;
  v_alerts jsonb := '[]'::jsonb;
begin
  if p_slug is null
     or char_length(p_slug) > 40
     or not (
       p_slug = ''
       or p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     ) then
    raise exception 'record_demo_view: invalid page slug';
  end if;

  if not exists (
    select 1
      from public.shared_site_previews preview
     where preview.id = p_preview_id
       and preview.revoked_at is null
       and preview.expires_at > now()
       and preview.site_config #>> '{meta,locale}' = 'en-US'
       and preview.site_config #>> '{meta,jurisdiction}' = 'US'
  ) then
    raise exception 'record_demo_view: preview unavailable';
  end if;

  if exists (select 1 from public.demo_views where event_id = p_event_id) then
    return jsonb_build_object(
      'recorded', false,
      'visitCount', 0,
      'hoursSinceLast', null,
      'alertId', null,
      'alerts', '[]'::jsonb
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
      'alertId', null,
      'alerts', '[]'::jsonb
    );
  end if;

  -- 처음 열람. 아웃리치가 실제로 기다리는 신호이고, 지금까지 유일하게 아무 것도 남기지 않던 순간이다.
  -- 방문자·프리뷰당 한 세션만 visit_count = 1을 받는다(새 세션이면 기존 세션 수 + 1). 세션 유니크
  -- 제약과 합쳐 정확히 한 번만 발행되므로, 라우트의 임시 경로와 달리 중복도 유실도 없다.
  if not v_existing_session and v_visit_count = 1 then
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
      'first_view',
      '보낸 데모 링크를 처음 열어 봤습니다. 열람만 확인할 뿐 관심이나 구매 의사를 확정하지 않습니다.',
      v_visit_count,
      v_hours_since_last
    )
    on conflict (preview_id, visitor_id, session_id, signal_kind) do nothing
    returning id into v_first_view_alert_id;

    if v_first_view_alert_id is not null then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
        'alertId', v_first_view_alert_id,
        'signalKind', 'first_view'
      ));
    end if;
  end if;

  if not v_existing_session and p_slug <> '' then
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
      'procedure_entry',
      '시술 페이지에서 세션이 시작된 진입 신호입니다. 관심이나 예약 의도를 확정하지 않습니다.',
      v_visit_count,
      v_hours_since_last
    )
    on conflict (preview_id, visitor_id, session_id, signal_kind) do nothing
    returning id into v_procedure_alert_id;

    if v_procedure_alert_id is not null then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
        'alertId', v_procedure_alert_id,
        'signalKind', 'procedure_entry'
      ));
    end if;
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
    returning id into v_reinterest_alert_id;

    if v_reinterest_alert_id is not null then
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
        'alertId', v_reinterest_alert_id,
        'signalKind', 'strong_reinterest_48h'
      ));
    end if;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'visitCount', v_visit_count,
    'hoursSinceLast', v_hours_since_last,
    'alertId', v_reinterest_alert_id,
    'alerts', v_alerts
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
