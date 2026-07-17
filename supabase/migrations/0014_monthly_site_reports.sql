-- ============================================================================
-- 0014_monthly_site_reports.sql — [RPT$] PII-free monthly report persistence
--
-- Report payloads contain only already aggregated counters and deterministic
-- prose. Recipient/contact data is resolved at send time and is never persisted.
-- Delivery is fail-soft: report creation is independent from send state.
-- ============================================================================

create table public.monthly_site_reports (
  id                   uuid primary key default gen_random_uuid(),
  site_id              uuid not null references public.sites (id) on delete cascade,
  client_id            uuid not null references public.clients (id) on delete cascade,
  period_month         date not null,
  report_payload       jsonb not null,
  delivery_status      text not null default 'pending' check (
    delivery_status in ('pending', 'sending', 'sent', 'failed', 'delivery_unknown')
  ),
  delivery_attempts    integer not null default 0 check (delivery_attempts >= 0),
  last_error_code      text check (
    last_error_code is null or (
      length(last_error_code) between 1 and 80
      and last_error_code ~ '^[A-Z0-9_:-]+$'
    )
  ),
  provider_message_id  text check (
    provider_message_id is null or length(provider_message_id) between 1 and 255
  ),
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint monthly_site_reports_period_start check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint monthly_site_reports_payload_shape check (
    jsonb_typeof(report_payload) = 'object'
    and (report_payload ->> 'schemaVersion')::integer = 1
    and report_payload ?& array[
      'schemaVersion', 'siteId', 'period', 'comparisonPeriod', 'metrics',
      'sources', 'hasCurrentData', 'hasComparisonData', 'insight'
    ]
    and report_payload ->> 'siteId' = site_id::text
    and report_payload #>> '{period,month}' = to_char(period_month, 'YYYY-MM')
  ),
  constraint monthly_site_reports_delivery_shape check (
    (delivery_status = 'sent'
      and provider_message_id is not null
      and last_error_code is null
      and sent_at is not null)
    or (delivery_status = 'failed'
      and provider_message_id is null
      and last_error_code is not null
      and sent_at is null)
    or (delivery_status = 'delivery_unknown'
      and last_error_code is not null
      and sent_at is null)
    or (delivery_status in ('pending', 'sending')
      and provider_message_id is null
      and last_error_code is null
      and sent_at is null)
  ),
  unique (site_id, period_month)
);

create index monthly_site_reports_client_period_idx
  on public.monthly_site_reports (client_id, period_month desc);
create index monthly_site_reports_delivery_idx
  on public.monthly_site_reports (delivery_status, period_month)
  where delivery_status in ('pending', 'failed');
create index monthly_site_reports_sending_updated_idx
  on public.monthly_site_reports (updated_at)
  where delivery_status = 'sending';

comment on table public.monthly_site_reports is
  '[RPT$] Anonymous aggregate monthly reports. Retained for 24 months by the report cron.';

alter table public.monthly_site_reports enable row level security;

create policy monthly_site_reports_select_own
  on public.monthly_site_reports for select to authenticated
  using (client_id = auth.uid());

revoke all on table public.monthly_site_reports from anon, authenticated, service_role;
grant select on table public.monthly_site_reports to authenticated, service_role;

create or replace function public.insert_monthly_site_report(
  p_site_id uuid,
  p_period_month date,
  p_report_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_record public.monthly_site_reports%rowtype;
  v_created boolean := false;
begin
  if p_period_month is null
    or p_period_month <> date_trunc('month', p_period_month)::date then
    raise exception 'insert_monthly_site_report: period must be the first day of a month';
  end if;

  select s.client_id into v_client_id
  from public.sites s
  where s.id = p_site_id;
  if v_client_id is null then
    raise exception 'insert_monthly_site_report: site not found';
  end if;

  insert into public.monthly_site_reports (
    site_id, client_id, period_month, report_payload
  ) values (
    p_site_id, v_client_id, p_period_month, p_report_payload
  )
  on conflict (site_id, period_month) do nothing
  returning * into v_record;

  if found then
    v_created := true;
  else
    select * into strict v_record
    from public.monthly_site_reports r
    where r.site_id = p_site_id and r.period_month = p_period_month;
  end if;

  return jsonb_build_object('created', v_created, 'record', to_jsonb(v_record));
end;
$$;

create or replace function public.claim_monthly_report_delivery(
  p_report_id uuid,
  p_claimed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.monthly_site_reports%rowtype;
begin
  update public.monthly_site_reports
  set delivery_status = 'sending',
      delivery_attempts = delivery_attempts + 1,
      last_error_code = null,
      provider_message_id = null,
      sent_at = null,
      updated_at = p_claimed_at
  where id = p_report_id
    and delivery_status in ('pending', 'failed')
  returning * into v_record;

  if not found then return null; end if;
  return to_jsonb(v_record);
end;
$$;

create or replace function public.mark_monthly_report_delivery(
  p_report_id uuid,
  p_status text,
  p_error_code text default null,
  p_provider_message_id text default null,
  p_completed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.monthly_site_reports%rowtype;
begin
  if p_status not in ('sent', 'failed', 'delivery_unknown') then
    raise exception 'mark_monthly_report_delivery: invalid result status';
  end if;
  if p_status = 'sent' then
    if p_provider_message_id is null or btrim(p_provider_message_id) = ''
      or p_error_code is not null then
      raise exception 'mark_monthly_report_delivery: sent requires provider id only';
    end if;
  elsif p_status = 'failed' and (
    p_provider_message_id is not null
    or p_error_code is null
    or p_error_code !~ '^[A-Z0-9_:-]{1,80}$'
  ) then
    raise exception 'mark_monthly_report_delivery: failed requires safe error code only';
  elsif p_status = 'delivery_unknown' and (
    p_error_code is null
    or p_error_code !~ '^[A-Z0-9_:-]{1,80}$'
  ) then
    raise exception 'mark_monthly_report_delivery: unknown requires safe error code';
  end if;

  update public.monthly_site_reports
  set delivery_status = p_status,
      last_error_code = p_error_code,
      provider_message_id = p_provider_message_id,
      sent_at = case when p_status = 'sent' then p_completed_at else null end,
      updated_at = p_completed_at
  where id = p_report_id and delivery_status = 'sending'
  returning * into v_record;

  if not found then
    raise exception 'mark_monthly_report_delivery: report is not claimed';
  end if;
  return to_jsonb(v_record);
end;
$$;

-- A function crash can abandon a claimed row. Never resend it automatically:
-- after a conservative lease, move it to review-only delivery_unknown.
create or replace function public.reconcile_stale_monthly_report_deliveries(
  p_before timestamptz,
  p_reconciled_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reconciled integer;
begin
  if p_before is null or p_reconciled_at is null or p_before >= p_reconciled_at then
    raise exception 'reconcile_stale_monthly_report_deliveries: invalid boundary';
  end if;
  update public.monthly_site_reports
  set delivery_status = 'delivery_unknown',
      last_error_code = 'DELIVERY_STALE_REQUIRES_REVIEW',
      provider_message_id = null,
      sent_at = null,
      updated_at = p_reconciled_at
  where delivery_status = 'sending' and updated_at < p_before;
  get diagnostics v_reconciled = row_count;
  return v_reconciled;
end;
$$;

create or replace function public.purge_monthly_site_reports(p_cutoff_month date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_cutoff_month is null then
    raise exception 'purge_monthly_site_reports: cutoff is required';
  end if;
  delete from public.monthly_site_reports
  where period_month < date_trunc('month', p_cutoff_month)::date;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.insert_monthly_site_report(uuid, date, jsonb)
  from public, anon, authenticated;
revoke execute on function public.claim_monthly_report_delivery(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.mark_monthly_report_delivery(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.reconcile_stale_monthly_report_deliveries(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.purge_monthly_site_reports(date)
  from public, anon, authenticated;

grant execute on function public.insert_monthly_site_report(uuid, date, jsonb) to service_role;
grant execute on function public.claim_monthly_report_delivery(uuid, timestamptz) to service_role;
grant execute on function public.mark_monthly_report_delivery(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.reconcile_stale_monthly_report_deliveries(timestamptz, timestamptz) to service_role;
grant execute on function public.purge_monthly_site_reports(date) to service_role;
