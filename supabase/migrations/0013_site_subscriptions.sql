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
    'refund', 'expired', 'admin_clawback', 'admin_adjust'
  ));
alter table public.credit_ledger
  drop constraint if exists credit_ledger_admin_clawback_shape_check;
alter table public.credit_ledger
  add constraint credit_ledger_admin_clawback_shape_check check (
    reason <> 'admin_clawback'
    or (
      amount < 0
      and reference_id is not null
      and expires_at is null
      and idempotency_key like 'admin_clawback:%'
    )
  );

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
  reversed_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint site_subscription_renewal_period_check check (period_end > period_start),
  constraint site_subscription_renewal_source_check check (
    (source = 'payment_webhook' and payment_id is not null)
    or (source = 'admin_manual' and payment_id is null)
  )
);

create index site_subscription_renewals_client_idx
  on public.site_subscription_renewals (client_id, created_at desc);
create unique index site_subscription_renewals_payment_idx
  on public.site_subscription_renewals (payment_id)
  where payment_id is not null;
create index site_subscriptions_active_period_idx
  on public.site_subscriptions (current_period_end)
  where status = 'active';

comment on table public.site_subscriptions is
  'Authoritative operating-subscription state. Client/status and payment history are not eligibility signals.';
comment on table public.site_subscription_renewals is
  'Service-side renewal audit for payment webhooks and manual Kmong collections. Full payment refunds may set the one-way reversed_at marker; evidence is never deleted.';

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
  and p.refunded_at is null
group by p.client_id
having max(p.created_at) + interval '1 month' > now()
on conflict (client_id) do nothing;

-- Preserve the evidence needed to reverse one compatibility-projected period
-- without consulting raw payment history again during normal eligibility.
insert into public.site_subscription_renewals (
  client_id, source, idempotency_key, payment_id,
  period_start, period_end, created_at
)
select
  p.client_id,
  'payment_webhook',
  'bootstrap-payment:' || p.id::text,
  p.id,
  p.created_at,
  p.created_at + interval '1 month',
  now()
from public.payments p
where p.type = 'maintenance_subscription'
  and p.refunded_at is null
on conflict (idempotency_key) do nothing;

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
      and p.refunded_at is null
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

-- Ledger replay v2: expired and admin_clawback are both targeted negative
-- entries whose reference_id is a positive credit_ledger lot. Ordinary
-- consumption/admin_adjust rows retain FIFO semantics. Calling a clawback an
-- expiry would corrupt audit meaning, so the reasons remain distinct.
create or replace function public.credit_lot_remaining(
  p_client_id uuid,
  p_lot_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_lot record;
  v_need numeric;
  v_alloc numeric;
  v_remaining numeric := 0;
begin
  create temp table if not exists _anaks_lot_remaining (
    seq bigint generated always as identity,
    lot_id uuid,
    expires_at timestamptz,
    remaining numeric
  ) on commit drop;
  truncate _anaks_lot_remaining;

  for v_row in
    select id, amount, reason, reference_id, expires_at
    from public.credit_ledger
    where client_id = p_client_id
    order by created_at asc, id asc
  loop
    if v_row.amount > 0 then
      insert into _anaks_lot_remaining (lot_id, expires_at, remaining)
      values (v_row.id, v_row.expires_at, v_row.amount);
    elsif v_row.reason in ('expired', 'admin_clawback') then
      update _anaks_lot_remaining
      set remaining = greatest(0, remaining + v_row.amount)
      where lot_id = v_row.reference_id;
    else
      v_need := -v_row.amount;
      for v_lot in
        select seq, remaining
        from _anaks_lot_remaining
        where remaining > 0
        order by expires_at asc nulls last, seq asc
      loop
        exit when v_need <= 0;
        v_alloc := least(v_lot.remaining, v_need);
        update _anaks_lot_remaining
        set remaining = remaining - v_alloc
        where seq = v_lot.seq;
        v_need := v_need - v_alloc;
      end loop;
    end if;
  end loop;

  select coalesce(sum(remaining), 0) into v_remaining
  from _anaks_lot_remaining
  where lot_id = p_lot_id;

  return v_remaining;
end;
$$;

create or replace function public.expire_client_credits(
  p_client_id uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_row record;
  v_lot record;
  v_need numeric;
  v_alloc numeric;
begin
  perform public.lock_credit_balance(p_client_id);

  create temp table if not exists _anaks_lot_replay (
    seq bigint generated always as identity,
    lot_id uuid,
    expires_at timestamptz,
    remaining numeric
  ) on commit drop;
  truncate _anaks_lot_replay;

  for v_row in
    select id, amount, reason, reference_id, expires_at
    from public.credit_ledger
    where client_id = p_client_id
    order by created_at asc, id asc
  loop
    if v_row.amount > 0 then
      insert into _anaks_lot_replay (lot_id, expires_at, remaining)
      values (v_row.id, v_row.expires_at, v_row.amount);
    elsif v_row.reason in ('expired', 'admin_clawback') then
      update _anaks_lot_replay
      set remaining = greatest(0, remaining + v_row.amount)
      where lot_id = v_row.reference_id;
    else
      v_need := -v_row.amount;
      for v_lot in
        select seq, remaining
        from _anaks_lot_replay
        where remaining > 0
        order by expires_at asc nulls last, seq asc
      loop
        exit when v_need <= 0;
        v_alloc := least(v_lot.remaining, v_need);
        update _anaks_lot_replay
        set remaining = remaining - v_alloc
        where seq = v_lot.seq;
        v_need := v_need - v_alloc;
      end loop;
    end if;
  end loop;

  for v_lot in
    select lot_id, remaining
    from _anaks_lot_replay
    where remaining > 0
      and expires_at is not null
      and expires_at <= p_now
    order by seq asc
  loop
    insert into public.credit_ledger (client_id, amount, reason, reference_id)
    values (p_client_id, -v_lot.remaining, 'expired', v_lot.lot_id);

    update public.credit_balances
    set balance = balance - v_lot.remaining, updated_at = now()
    where client_id = p_client_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Replace the legacy refund reconciler so a full operating-subscription
-- refund reverses exactly its paid period and its unused, payment-linked
-- monthly grant. Later/manual renewals remain authoritative. A partial refund
-- records the payment refund only and deliberately leaves subscription state
-- and benefits unchanged.
create or replace function public.admin_refund_payment(
  p_payment_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_type text;
  v_payment_amount numeric;
  v_refunded timestamptz;
  v_now timestamptz := now();
  v_lot_id uuid;
  v_original_expires_at timestamptz;
  v_remaining numeric := 0;
  v_clawed numeric := 0;
  v_benefit_transferred numeric := 0;
  v_remaining_period_end timestamptz;
  v_replacement_payment_id uuid;
  v_current_status text;
  v_next_status text;
  v_inserted integer := 0;
  v_reconciled boolean := false;
begin
  select p.client_id, p.type, p.amount, p.refunded_at
  into v_client_id, v_type, v_payment_amount, v_refunded
  from public.payments p
  where p.id = p_payment_id
  for update;

  if v_client_id is null then
    raise exception 'admin_refund_payment: 결제를 찾을 수 없습니다 (%)', p_payment_id;
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'admin_refund_payment: p_amount는 0 이상이어야 합니다 (입력: %)', p_amount;
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception 'admin_refund_payment: p_amount는 원 단위 정수여야 합니다 (입력: %)', p_amount;
  end if;
  if p_amount > v_payment_amount then
    raise exception 'admin_refund_payment: p_amount는 결제 금액 이하여야 합니다 (결제: %, 입력: %)',
      v_payment_amount, p_amount;
  end if;
  if v_refunded is not null then
    return jsonb_build_object(
      'ok', true,
      'already_refunded', true,
      'clawed_back', 0,
      'subscription_reconciled', false
    );
  end if;

  -- Serialize state recalculation against a concurrent renewal for this owner.
  if v_type = 'maintenance_subscription' and p_amount = v_payment_amount then
    perform pg_advisory_xact_lock(hashtextextended(v_client_id::text, 0));
  end if;

  update public.payments
  set refunded_at = v_now, refund_amount = p_amount
  where id = p_payment_id;

  -- Full build/maintenance refunds claw back only the unused remainder of the
  -- grant tied to this payment reference. Partial maintenance refunds do not.
  if v_type = 'build_fee'
     or (v_type = 'maintenance_subscription' and p_amount = v_payment_amount) then
    perform public.lock_credit_balance(v_client_id);

    select l.id, l.expires_at into v_lot_id, v_original_expires_at
    from public.credit_ledger l
    where l.client_id = v_client_id
      and l.reference_id = p_payment_id
      and l.reason = case
        when v_type = 'build_fee' then 'initial_grant'
        else 'subscription_grant'
      end
      and l.amount > 0
    order by l.created_at asc, l.id asc
    limit 1;

    if v_lot_id is not null then
      v_remaining := public.credit_lot_remaining(v_client_id, v_lot_id);
      if v_remaining > 0 then
        insert into public.credit_ledger (
          client_id, amount, reason, reference_id, idempotency_key
        ) values (
          v_client_id,
          -v_remaining,
          'admin_clawback',
          v_lot_id,
          'admin_clawback:' || v_lot_id::text
        );

        update public.credit_balances
        set balance = balance - v_remaining, updated_at = v_now
        where client_id = v_client_id;

        v_clawed := v_remaining;
      end if;
    end if;
  end if;

  if v_type = 'maintenance_subscription' and p_amount = v_payment_amount then
    update public.site_subscription_renewals r
    set reversed_at = v_now
    where r.client_id = v_client_id
      and r.payment_id = p_payment_id
      and r.reversed_at is null;
    if not found then
      -- Do not accept a URL/payment-only authority mutation when the renewal
      -- evidence required to reconstruct state is missing.
      raise exception 'admin_refund_payment: subscription renewal evidence is missing (%)',
        p_payment_id;
    end if;

    select s.status into v_current_status
    from public.site_subscriptions s
    where s.client_id = v_client_id
    for update;

    select r.period_end, r.payment_id
    into v_remaining_period_end, v_replacement_payment_id
    from public.site_subscription_renewals r
    where r.client_id = v_client_id
      and r.reversed_at is null
    order by r.period_end desc, r.created_at desc, r.id desc
    limit 1;

    v_remaining_period_end := coalesce(v_remaining_period_end, v_now);
    v_next_status := case
      when v_remaining_period_end <= v_now then 'cancelled'
      when v_current_status is null or v_current_status = 'active' then 'active'
      else v_current_status
    end;
    insert into public.site_subscriptions (client_id, status, current_period_end, updated_at)
    values (v_client_id, v_next_status, v_remaining_period_end, v_now)
    on conflict (client_id) do update
      set status = excluded.status,
          current_period_end = excluded.current_period_end,
          updated_at = excluded.updated_at;

    -- The Korean-month idempotency key remains consumed by the now-reversed
    -- payment. Transfer only the clawed, unused remainder to the surviving
    -- future renewal with the original expiry. This preserves the earned
    -- two-credit monthly entitlement without double-granting or extending it.
    if v_clawed > 0 and v_remaining_period_end > v_now then
      insert into public.credit_ledger (
        client_id, amount, reason, reference_id, expires_at, idempotency_key
      ) values (
        v_client_id,
        v_clawed,
        'subscription_grant',
        v_replacement_payment_id,
        v_original_expires_at,
        'subscription_refund_regrant:' || p_payment_id::text
      )
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
      get diagnostics v_inserted = row_count;
      if v_inserted > 0 then
        update public.credit_balances
        set balance = balance + v_clawed, updated_at = v_now
        where client_id = v_client_id;
        v_benefit_transferred := v_clawed;
      end if;
    end if;
    v_reconciled := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_refunded', false,
    'clawed_back', v_clawed,
    'benefit_transferred', v_benefit_transferred,
    'subscription_reconciled', v_reconciled
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

-- Reassert service-only access after replacing the 0002 implementation.
revoke execute on function public.admin_refund_payment(uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.admin_refund_payment(uuid, numeric) to service_role;
