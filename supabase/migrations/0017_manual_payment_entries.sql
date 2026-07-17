-- OPS$ O1 — append-only manual collection evidence for the existing payments ledger.
--
-- Product amounts below are an immutable migration snapshot of web/src/lib/pricing.ts
-- and web/src/lib/credits/constants.ts at 2026-07-17. Application requests are also
-- checked against those TypeScript sources before this service-only RPC is called.

create table public.manual_payment_entries (
  id                    uuid primary key default gen_random_uuid(),
  payment_id            uuid unique references public.payments (id) on delete restrict,
  client_id             uuid not null references public.clients (id) on delete restrict,
  site_id               uuid references public.sites (id) on delete restrict,
  product_kind          text not null check (product_kind in (
                          'launch_build', 'list_build', 'video_addon',
                          'subscription', 'credit_pack'
                        )),
  direction             text not null check (direction in ('receipt', 'reversal')),
  amount                numeric not null check (amount > 0 and amount = trunc(amount)),
  collection_channel    text not null check (collection_channel in ('kmong', 'bank_transfer', 'other')),
  collection_reference  text not null,
  memo                   text,
  reverses_entry_id     uuid unique references public.manual_payment_entries (id) on delete restrict,
  created_at             timestamptz not null default now(),
  constraint manual_payment_reference_not_blank
    check (btrim(collection_reference) <> ''),
  constraint manual_payment_direction_reference
    check (
      (direction = 'receipt' and payment_id is not null and reverses_entry_id is null)
      or (direction = 'reversal' and payment_id is null and reverses_entry_id is not null)
    ),
  constraint manual_payment_site_required
    check (
      product_kind not in ('launch_build', 'list_build', 'video_addon')
      or site_id is not null
    ),
  unique (collection_channel, collection_reference)
);

create index manual_payment_entries_client_created_idx
  on public.manual_payment_entries (client_id, created_at desc);
create index manual_payment_entries_site_idx
  on public.manual_payment_entries (site_id)
  where site_id is not null;

comment on table public.manual_payment_entries is
  'Immutable service-role evidence attached to payments for manual/Kmong receipts. Corrections append a reversal entry; rows are never updated or deleted.';

alter table public.manual_payment_entries enable row level security;
revoke all on table public.manual_payment_entries from public, anon, authenticated, service_role;
grant select on table public.manual_payment_entries to service_role;

create or replace function public.reject_manual_payment_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'manual payment evidence is append-only; record a reversal';
end;
$$;

create trigger manual_payment_entries_append_only
before update or delete on public.manual_payment_entries
for each row execute function public.reject_manual_payment_mutation();

create or replace function public.reject_manual_ledger_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.manual_payment_entries e where e.payment_id = old.id
  ) then
    raise exception 'manual payment ledger rows are append-only; record a reversal';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger manual_payments_append_only
before update or delete on public.payments
for each row execute function public.reject_manual_ledger_mutation();

create or replace function public.record_manual_collection(
  p_client_id uuid,
  p_site_id uuid,
  p_product_kind text,
  p_amount numeric,
  p_collection_channel text,
  p_collection_reference text,
  p_memo text default null,
  p_credit_pack_credits integer default null,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.manual_payment_entries%rowtype;
  v_payment_id uuid;
  v_payment_type text;
  v_expected_amount numeric;
  v_credits integer := 0;
  v_key text;
  v_subscription_granted boolean := false;
begin
  if p_client_id is null or not exists (
    select 1 from public.clients c where c.id = p_client_id
  ) then
    raise exception 'record_manual_collection: client not found';
  end if;
  if p_collection_channel not in ('kmong', 'bank_transfer', 'other') then
    raise exception 'record_manual_collection: invalid collection channel';
  end if;
  if p_collection_reference is null or btrim(p_collection_reference) = '' then
    raise exception 'record_manual_collection: collection reference is required';
  end if;
  if p_amount is null or p_amount <= 0 or trunc(p_amount) <> p_amount then
    raise exception 'record_manual_collection: amount must be a positive whole KRW value';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites s
    where s.id = p_site_id and s.client_id = p_client_id
  ) then
    raise exception 'record_manual_collection: site ownership mismatch';
  end if;

  case p_product_kind
    when 'launch_build' then
      v_payment_type := 'build_fee';
      v_expected_amount := 390000;
    when 'list_build' then
      v_payment_type := 'build_fee';
      v_expected_amount := 590000;
    when 'video_addon' then
      v_payment_type := 'build_fee';
      v_expected_amount := 200000;
    when 'subscription' then
      v_payment_type := 'maintenance_subscription';
      v_expected_amount := 29900;
      v_credits := 2;
    when 'credit_pack' then
      v_payment_type := 'credit_pack';
      case p_credit_pack_credits
        when 1 then v_expected_amount := 15000;
        when 5 then v_expected_amount := 65000;
        when 10 then v_expected_amount := 120000;
        else raise exception 'record_manual_collection: unknown credit pack';
      end case;
      v_credits := p_credit_pack_credits;
    else
      raise exception 'record_manual_collection: invalid product kind';
  end case;

  if p_product_kind in ('launch_build', 'list_build', 'video_addon') and p_site_id is null then
    raise exception 'record_manual_collection: site is required for build and video collections';
  end if;
  if p_amount <> v_expected_amount then
    raise exception 'record_manual_collection: amount does not match current product contract';
  end if;
  if p_product_kind <> 'credit_pack' and p_credit_pack_credits is not null then
    raise exception 'record_manual_collection: credit-pack metadata is not allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_collection_channel || ':' || btrim(p_collection_reference), 0
  ));

  select * into v_existing
  from public.manual_payment_entries e
  where e.collection_channel = p_collection_channel
    and e.collection_reference = btrim(p_collection_reference);
  if found then
    if v_existing.direction <> 'receipt'
      or v_existing.client_id <> p_client_id
      or v_existing.site_id is distinct from p_site_id
      or v_existing.product_kind <> p_product_kind
      or v_existing.amount <> p_amount then
      raise exception 'record_manual_collection: collection reference conflicts with existing evidence';
    end if;
    return jsonb_build_object(
      'duplicated', true,
      'entry_id', v_existing.id,
      'payment_id', v_existing.payment_id
    );
  end if;

  insert into public.payments (
    client_id, type, amount, credits_granted, provider_payment_key, created_at
  ) values (
    p_client_id,
    v_payment_type,
    p_amount,
    case when p_product_kind = 'subscription' then 0 else v_credits end,
    null,
    p_as_of
  ) returning id into v_payment_id;

  v_key := 'manual:' || p_collection_channel || ':' || btrim(p_collection_reference);
  if p_product_kind = 'subscription' then
    -- Reuse the authoritative admin-manual renewal core. Payment, evidence,
    -- renewal and grant stay in this one transaction.
    perform public.renew_site_subscription(
      p_client_id, v_key, 'admin_manual', 1, null, p_as_of
    );
    v_subscription_granted := public.grant_subscription_month_credits(
      p_client_id, p_as_of, v_payment_id
    );
    if v_subscription_granted then
      update public.payments
      set credits_granted = v_credits
      where id = v_payment_id;
    end if;
  elsif p_product_kind = 'credit_pack' then
    perform public.grant_credits(
      p_client_id, v_credits, 'purchase', v_payment_id,
      'purchase:' || v_key, 365
    );
  end if;

  -- Attach immutable manual evidence only after every operational side effect
  -- succeeds. The payment trigger then prevents future UPDATE/DELETE.
  insert into public.manual_payment_entries (
    payment_id, client_id, site_id, product_kind, direction, amount,
    collection_channel, collection_reference, memo, created_at
  ) values (
    v_payment_id, p_client_id, p_site_id, p_product_kind, 'receipt', p_amount,
    p_collection_channel, btrim(p_collection_reference), nullif(btrim(p_memo), ''), p_as_of
  ) returning * into v_existing;

  return jsonb_build_object(
    'duplicated', false,
    'entry_id', v_existing.id,
    'payment_id', v_payment_id
  );
end;
$$;

create or replace function public.reverse_manual_collection(
  p_entry_id uuid,
  p_collection_reference text,
  p_memo text,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.manual_payment_entries%rowtype;
  v_existing public.manual_payment_entries%rowtype;
  v_payment public.payments%rowtype;
  v_reversal public.manual_payment_entries%rowtype;
  v_subscription_renewal_id uuid;
  v_latest_renewal_id uuid;
  v_lot record;
  v_remaining numeric := 0;
  v_remaining_period_end timestamptz;
  v_replacement_payment_id uuid;
  v_replacement_source text;
  v_replacement_key text;
  v_current_status text;
  v_next_status text;
  v_key text;
begin
  if p_collection_reference is null or btrim(p_collection_reference) = '' then
    raise exception 'reverse_manual_collection: correction reference is required';
  end if;
  if p_memo is null or btrim(p_memo) = '' then
    raise exception 'reverse_manual_collection: correction reason is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_entry_id::text, 0));
  select * into v_original
  from public.manual_payment_entries e
  where e.id = p_entry_id and e.direction = 'receipt';
  if not found then
    raise exception 'reverse_manual_collection: original receipt not found';
  end if;
  select * into v_payment from public.payments p where p.id = v_original.payment_id;

  select * into v_existing
  from public.manual_payment_entries e
  where e.reverses_entry_id = p_entry_id;
  if found then
    if v_existing.collection_reference <> btrim(p_collection_reference) then
      raise exception 'reverse_manual_collection: receipt already has another reversal';
    end if;
    return jsonb_build_object(
      'duplicated', true,
      'entry_id', v_existing.id,
      'payment_id', null
    );
  end if;
  if exists (
    select 1 from public.manual_payment_entries e
    where e.collection_channel = v_original.collection_channel
      and e.collection_reference = btrim(p_collection_reference)
  ) then
    raise exception 'reverse_manual_collection: correction reference already exists';
  end if;

  if v_original.product_kind = 'subscription' then
    -- A later renewal's period_start was calculated from this period_end. Removing
    -- an older link without replaying the whole chain would leave an unearned gap
    -- inside current_period_end, so corrections are deliberately LIFO.
    perform pg_advisory_xact_lock(hashtextextended(v_original.client_id::text, 0));
    v_key := 'manual:' || v_original.collection_channel || ':' || v_original.collection_reference;
    select r.id into v_subscription_renewal_id
    from public.site_subscription_renewals r
    where r.client_id = v_original.client_id
      and r.idempotency_key = v_key
      and r.source = 'admin_manual'
      and r.reversed_at is null
    for update;
    if not found then
      raise exception 'reverse_manual_collection: subscription renewal evidence is missing';
    end if;

    select r.id into v_latest_renewal_id
    from public.site_subscription_renewals r
    where r.client_id = v_original.client_id and r.reversed_at is null
    order by r.period_end desc, r.created_at desc, r.id desc
    limit 1
    for update;
    if v_latest_renewal_id is distinct from v_subscription_renewal_id then
      raise exception 'reverse_manual_collection: only the latest subscription renewal can be reversed';
    end if;

    -- Resolve the surviving authority before any ledger mutation. Provider
    -- renewals carry their payment id directly; admin renewals deliberately do
    -- not, so their immutable manual receipt is the stable benefit reference.
    select r.period_end, r.payment_id, r.source, r.idempotency_key
    into v_remaining_period_end, v_replacement_payment_id,
         v_replacement_source, v_replacement_key
    from public.site_subscription_renewals r
    where r.client_id = v_original.client_id
      and r.reversed_at is null
      and r.id <> v_subscription_renewal_id
    order by r.period_end desc, r.created_at desc, r.id desc
    limit 1;

    if v_replacement_source = 'admin_manual' then
      select e.payment_id into v_replacement_payment_id
      from public.manual_payment_entries e
      where e.client_id = v_original.client_id
        and e.product_kind = 'subscription'
        and e.direction = 'receipt'
        and e.payment_id is not null
        and 'manual:' || e.collection_channel || ':' || e.collection_reference = v_replacement_key
        and not exists (
          select 1 from public.manual_payment_entries correction
          where correction.reverses_entry_id = e.id
        )
      limit 1;
      if not found then
        raise exception 'reverse_manual_collection: replacement manual payment evidence is missing';
      end if;
    end if;

    v_remaining_period_end := coalesce(v_remaining_period_end, p_as_of);
    if v_remaining_period_end > p_as_of and v_replacement_payment_id is null then
      raise exception 'reverse_manual_collection: replacement payment evidence is missing';
    end if;
  end if;

  -- Credits are append-only too: reclaim only the unused remainder of the
  -- lots tied to this receipt. A prior LIFO correction may have transferred
  -- more than one calendar-month lot to the surviving receipt, so every linked
  -- lot must be handled independently and keep its original expiry.
  if v_original.product_kind in ('subscription', 'credit_pack') then
    perform public.lock_credit_balance(v_original.client_id);
    for v_lot in
      select l.id, l.expires_at
      from public.credit_ledger l
      where l.client_id = v_original.client_id
        and l.reference_id = v_original.payment_id
        and l.reason = case
          when v_original.product_kind = 'subscription' then 'subscription_grant'
          else 'purchase'
        end
        and l.amount > 0
      order by l.created_at asc, l.id asc
    loop
      v_remaining := public.credit_lot_remaining(v_original.client_id, v_lot.id);
      if v_remaining > 0 then
        insert into public.credit_ledger (
          client_id, amount, reason, reference_id, idempotency_key
        ) values (
          v_original.client_id, -v_remaining, 'admin_clawback', v_lot.id,
          'manual_reversal_clawback:' || p_entry_id::text || ':' || v_lot.id::text
        );
        update public.credit_balances
        set balance = balance - v_remaining, updated_at = p_as_of
        where client_id = v_original.client_id;

        if v_original.product_kind = 'subscription'
           and v_remaining_period_end > p_as_of then
          insert into public.credit_ledger (
            client_id, amount, reason, reference_id, expires_at, idempotency_key
          ) values (
            v_original.client_id, v_remaining, 'subscription_grant',
            v_replacement_payment_id, v_lot.expires_at,
            'manual_reversal_regrant:' || p_entry_id::text || ':' || v_lot.id::text
          );
          update public.credit_balances
          set balance = balance + v_remaining, updated_at = p_as_of
          where client_id = v_original.client_id;
        end if;
      end if;
    end loop;
  end if;

  if v_original.product_kind = 'subscription' then
    update public.site_subscription_renewals r
    set reversed_at = p_as_of
    where r.id = v_subscription_renewal_id and r.reversed_at is null;
    if not found then
      raise exception 'reverse_manual_collection: subscription renewal evidence is missing';
    end if;

    select s.status into v_current_status
    from public.site_subscriptions s
    where s.client_id = v_original.client_id
    for update;
    v_next_status := case
      when v_remaining_period_end <= p_as_of then 'cancelled'
      when v_current_status is null or v_current_status = 'active' then 'active'
      else v_current_status
    end;
    insert into public.site_subscriptions (client_id, status, current_period_end, updated_at)
    values (v_original.client_id, v_next_status, v_remaining_period_end, p_as_of)
    on conflict (client_id) do update
      set status = excluded.status,
          current_period_end = excluded.current_period_end,
          updated_at = excluded.updated_at;
  end if;

  insert into public.manual_payment_entries (
    payment_id, client_id, site_id, product_kind, direction, amount,
    collection_channel, collection_reference, memo, reverses_entry_id, created_at
  ) values (
    null, v_original.client_id, v_original.site_id, v_original.product_kind,
    'reversal', v_original.amount, v_original.collection_channel,
    btrim(p_collection_reference), btrim(p_memo), p_entry_id, p_as_of
  ) returning * into v_reversal;

  return jsonb_build_object(
    'duplicated', false,
    'entry_id', v_reversal.id,
    'payment_id', null
  );
end;
$$;

revoke execute on function public.record_manual_collection(
  uuid, uuid, text, numeric, text, text, text, integer, timestamptz
) from public, anon, authenticated;
revoke execute on function public.reverse_manual_collection(
  uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_manual_collection(
  uuid, uuid, text, numeric, text, text, text, integer, timestamptz
) to service_role;
grant execute on function public.reverse_manual_collection(
  uuid, text, text, timestamptz
) to service_role;
