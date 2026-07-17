-- ============================================================================
-- 0013_site_subscriptions.sql — authoritative operating-subscription state
--
-- Authority rules:
--  * report/credit eligibility trusts only site_subscriptions.
--  * renewal writes are service-role RPC only (verified payment or admin manual).
--  * monthly benefits append to credit_ledger through grant_credits; balances
--    remain a derived cache and are never changed outside the ledger function.
--  * one benefit per Korean calendar month:
--      subscription_grant:{clientId}:{YYYY-MM}
-- ============================================================================

-- Additive reason shared with web/src/lib/types/domain.ts and
-- web/src/lib/credits/constants.ts. Existing rows remain valid.
alter table public.credit_ledger
  drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger
  add constraint credit_ledger_reason_check check (reason in (
    'initial_grant', 'purchase', 'subscription_grant',
    'edit_text', 'edit_image', 'edit_video', 'edit_structure',
    'refund', 'expired', 'admin_adjust'
  ));

create table public.site_subscriptions (
  client_id          uuid primary key references public.clients (id) on delete cascade,
  status             text not null check (status in ('active', 'past_due', 'suspended', 'cancelled')),
  current_period_end timestamptz not null,
  updated_at         timestamptz not null default now()
);

create table public.site_subscription_renewals (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  source          text not null check (source in ('payment_webhook', 'admin_manual')),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  payment_id      uuid references public.payments (id) on delete restrict,
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  created_at      timestamptz not null default now(),
  constraint site_subscription_renewal_period_check check (period_end > period_start),
  constraint site_subscription_renewal_source_check check (
    (source = 'payment_webhook' and payment_id is not null)
    or (source = 'admin_manual' and payment_id is null)
  )
);

create index site_subscription_renewals_client_idx
  on public.site_subscription_renewals (client_id, created_at desc);
create index site_subscriptions_active_period_idx
  on public.site_subscriptions (current_period_end)
  where status = 'active';

comment on table public.site_subscriptions is
  'Authoritative operating-subscription state. Client/status and payment history are not eligibility signals.';
comment on table public.site_subscription_renewals is
  'Immutable service-side renewal audit for payment webhooks and manual Kmong collections.';

-- One-time compatibility bootstrap only. After migration, payment rows are
-- never consulted for eligibility; every resolver reads site_subscriptions.
insert into public.site_subscriptions (client_id, status, current_period_end, updated_at)
select
  p.client_id,
  'active',
  max(p.created_at) + interval '1 month',
  now()
from public.payments p
where p.type = 'maintenance_subscription'
group by p.client_id
having max(p.created_at) + interval '1 month' > now()
on conflict (client_id) do nothing;

alter table public.site_subscriptions enable row level security;
alter table public.site_subscription_renewals enable row level security;

create policy site_subscriptions_select_own
  on public.site_subscriptions for select to authenticated
  using (client_id = auth.uid());

-- Renewal audit is operational evidence; customers read the resolved state,
-- not provider/manual collection metadata.
revoke all on table public.site_subscriptions from anon, authenticated, service_role;
revoke all on table public.site_subscription_renewals from anon, authenticated, service_role;
grant select on table public.site_subscriptions to authenticated, service_role;
grant select on table public.site_subscription_renewals to service_role;

create or replace function public.is_site_subscription_active(
  p_client_id uuid,
  p_as_of timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.site_subscriptions s
    where s.client_id = p_client_id
      and s.status = 'active'
      and s.current_period_end > p_as_of
  );
$$;

create or replace function public.renew_site_subscription(
  p_client_id uuid,
  p_idempotency_key text,
  p_source text,
  p_period_months integer default 1,
  p_payment_id uuid default null,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.site_subscription_renewals%rowtype;
  v_current_end timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'renew_site_subscription: idempotency key is required';
  end if;
  if p_source not in ('payment_webhook', 'admin_manual') then
    raise exception 'renew_site_subscription: invalid source (%)', p_source;
  end if;
  if p_period_months is null or p_period_months < 1 or p_period_months > 12 then
    raise exception 'renew_site_subscription: period months must be 1..12';
  end if;
  if (p_source = 'payment_webhook') <> (p_payment_id is not null) then
    raise exception 'renew_site_subscription: payment source/reference mismatch';
  end if;
  if p_source = 'payment_webhook' and not exists (
    select 1 from public.payments p
    where p.id = p_payment_id
      and p.client_id = p_client_id
      and p.type = 'maintenance_subscription'
  ) then
    raise exception 'renew_site_subscription: verified maintenance payment is required';
  end if;

  -- Serialize first-renewal and extension races for one owner.
  perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));

  select * into v_existing
  from public.site_subscription_renewals r
  where r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.client_id <> p_client_id then
      raise exception 'renew_site_subscription: idempotency key belongs to another owner';
    end if;
    return jsonb_build_object(
      'duplicated', true,
      'status', (select status from public.site_subscriptions where client_id = p_client_id),
      'current_period_end', (select current_period_end from public.site_subscriptions where client_id = p_client_id)
    );
  end if;

  select s.current_period_end into v_current_end
  from public.site_subscriptions s
  where s.client_id = p_client_id
  for update;

  v_period_start := greatest(coalesce(v_current_end, p_as_of), p_as_of);
  v_period_end := v_period_start + make_interval(months => p_period_months);

  insert into public.site_subscriptions (client_id, status, current_period_end, updated_at)
  values (p_client_id, 'active', v_period_end, p_as_of)
  on conflict (client_id) do update
    set status = 'active',
        current_period_end = excluded.current_period_end,
        updated_at = excluded.updated_at;

  insert into public.site_subscription_renewals (
    client_id, source, idempotency_key, payment_id, period_start, period_end, created_at
  ) values (
    p_client_id, p_source, p_idempotency_key, p_payment_id, v_period_start, v_period_end, p_as_of
  );

  return jsonb_build_object(
    'duplicated', false,
    'status', 'active',
    'current_period_end', v_period_end
  );
end;
$$;

create or replace function public.set_site_subscription_status(
  p_client_id uuid,
  p_status text,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_end timestamptz;
begin
  -- Re-activation must prove a new collection through a renewal RPC.
  if p_status not in ('past_due', 'suspended', 'cancelled') then
    raise exception 'set_site_subscription_status: invalid non-active status (%)', p_status;
  end if;
  update public.site_subscriptions
  set status = p_status, updated_at = p_as_of
  where client_id = p_client_id
  returning current_period_end into v_end;
  if not found then
    raise exception 'set_site_subscription_status: subscription not found';
  end if;
  return jsonb_build_object('status', p_status, 'current_period_end', v_end);
end;
$$;

create or replace function public.grant_subscription_month_credits(
  p_client_id uuid,
  p_as_of timestamptz default now(),
  p_reference_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  if not public.is_site_subscription_active(p_client_id, p_as_of) then
    return false;
  end if;

  v_key := 'subscription_grant:' || p_client_id::text || ':'
    || to_char(p_as_of at time zone 'Asia/Seoul', 'YYYY-MM');
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  if exists (select 1 from public.credit_ledger where idempotency_key = v_key) then
    return false;
  end if;

  perform public.grant_credits(
    p_client_id,
    2,                    -- PRICING.subscription.creditsPerMonth
    'subscription_grant',
    p_reference_id,
    v_key,
    90                    -- CREDIT_EXPIRY_DAYS.subscription_grant
  );
  return true;
end;
$$;

create or replace function public.admin_renew_site_subscription(
  p_client_id uuid,
  p_idempotency_key text,
  p_period_months integer default 1,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_granted boolean;
begin
  v_result := public.renew_site_subscription(
    p_client_id,
    p_idempotency_key,
    'admin_manual',
    p_period_months,
    null,
    p_as_of
  );
  v_granted := public.grant_subscription_month_credits(p_client_id, p_as_of, null);
  return v_result || jsonb_build_object('credits_granted', case when v_granted then 2 else 0 end);
end;
$$;

create or replace function public.grant_monthly_subscription_credits(
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_eligible integer := 0;
  v_granted integer := 0;
begin
  for v_client_id in
    select s.client_id
    from public.site_subscriptions s
    where s.status = 'active'
      and s.current_period_end > p_as_of
    order by s.client_id
  loop
    v_eligible := v_eligible + 1;
    if public.grant_subscription_month_credits(v_client_id, p_as_of, null) then
      v_granted := v_granted + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'eligible', v_eligible,
    'granted', v_granted,
    'skipped', v_eligible - v_granted
  );
end;
$$;

-- Payment insert, authoritative renewal, and benefit grant share one RPC
-- transaction. A failure rolls back all three; a provider retry is idempotent.
create or replace function public.handle_maintenance_payment(
  p_client_id uuid,
  p_provider_payment_key text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_renewal jsonb;
  v_granted boolean;
begin
  if p_provider_payment_key is null or btrim(p_provider_payment_key) = '' then
    raise exception 'handle_maintenance_payment: provider_payment_key is required';
  end if;

  -- Preserve retry compatibility for payments accepted before this migration.
  select id into v_existing_payment_id
  from public.payments
  where provider_payment_key = p_provider_payment_key;
  if found then
    return jsonb_build_object('processed', false, 'duplicated', true, 'payment_id', v_existing_payment_id);
  end if;

  -- Server-side defense in depth; mirrored by PRICING.subscription.monthly.
  if p_amount is distinct from 29900::numeric then
    raise exception 'handle_maintenance_payment: amount must equal 29900 KRW';
  end if;

  insert into public.payments (client_id, type, amount, credits_granted, provider_payment_key)
  values (p_client_id, 'maintenance_subscription', p_amount, 0, p_provider_payment_key)
  on conflict (provider_payment_key) do nothing
  returning id into v_payment_id;
  if v_payment_id is null then
    return jsonb_build_object('processed', false, 'duplicated', true);
  end if;

  v_renewal := public.renew_site_subscription(
    p_client_id,
    'payment:' || p_provider_payment_key,
    'payment_webhook',
    1,
    v_payment_id,
    now()
  );
  v_granted := public.grant_subscription_month_credits(p_client_id, now(), v_payment_id);

  if v_granted then
    update public.payments set credits_granted = 2 where id = v_payment_id;
  end if;

  return jsonb_build_object(
    'processed', true,
    'duplicated', false,
    'payment_id', v_payment_id,
    'credits_granted', case when v_granted then 2 else 0 end,
    'current_period_end', v_renewal -> 'current_period_end'
  );
end;
$$;

revoke execute on function public.is_site_subscription_active(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.renew_site_subscription(uuid, text, text, integer, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function public.set_site_subscription_status(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.grant_subscription_month_credits(uuid, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.admin_renew_site_subscription(uuid, text, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.grant_monthly_subscription_credits(timestamptz)
  from public, anon, authenticated;

grant execute on function public.is_site_subscription_active(uuid, timestamptz) to service_role;
grant execute on function public.set_site_subscription_status(uuid, text, timestamptz) to service_role;
grant execute on function public.admin_renew_site_subscription(uuid, text, integer, timestamptz) to service_role;
grant execute on function public.grant_monthly_subscription_credits(timestamptz) to service_role;

-- Replacement keeps the original signature and service-only grant from 0001.
revoke execute on function public.handle_maintenance_payment(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.handle_maintenance_payment(uuid, text, numeric) to service_role;
