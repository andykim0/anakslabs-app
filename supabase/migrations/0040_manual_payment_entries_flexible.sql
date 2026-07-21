-- OPS2 — accountless/site-less manual receipts, append-only links and one-click cancellation.
-- Pricing snapshot matches web/src/lib/pricing.ts and credits/constants.ts at 2026-07-21.

alter table public.manual_payment_entries
  drop constraint manual_payment_direction_reference,
  drop constraint manual_payment_site_required,
  alter column client_id drop not null,
  add column customer_name text,
  add column customer_contact text,
  add column credit_pack_credits integer;

alter table public.manual_payment_entries
  add constraint manual_payment_customer_identity
    check (
      client_id is not null
      or (
        customer_name is not null and btrim(customer_name) <> ''
        and customer_contact is not null and btrim(customer_contact) <> ''
      )
    ),
  add constraint manual_payment_direction_reference_v2
    check (
      (direction = 'receipt' and reverses_entry_id is null)
      or (direction = 'reversal' and payment_id is null and reverses_entry_id is not null)
    ),
  add constraint manual_payment_credit_pack_metadata
    check (
      product_kind <> 'credit_pack'
      or payment_id is not null
      or credit_pack_credits in (1, 5, 10)
    );

create table public.manual_payment_entry_links (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.manual_payment_entries (id) on delete restrict,
  link_kind   text not null check (link_kind in ('client', 'site')),
  client_id   uuid not null references public.clients (id) on delete restrict,
  site_id     uuid references public.sites (id) on delete restrict,
  payment_id  uuid unique references public.payments (id) on delete restrict,
  memo        text,
  created_at  timestamptz not null default now(),
  constraint manual_payment_link_shape check (
    (link_kind = 'client' and site_id is null and payment_id is not null)
    or (link_kind = 'site' and site_id is not null and payment_id is null)
  )
);

create unique index manual_payment_entry_client_link_once
  on public.manual_payment_entry_links (entry_id) where link_kind = 'client';
create unique index manual_payment_entry_site_link_once
  on public.manual_payment_entry_links (entry_id) where link_kind = 'site';
create index manual_payment_entry_links_entry_created_idx
  on public.manual_payment_entry_links (entry_id, created_at asc);

comment on table public.manual_payment_entry_links is
  'Append-only history that connects immutable manual receipts to accounts, payments and sites after collection.';

alter table public.manual_payment_entry_links enable row level security;
revoke all on table public.manual_payment_entry_links from public, anon, authenticated, service_role;
grant select on table public.manual_payment_entry_links to service_role;

create trigger manual_payment_entry_links_append_only
before update or delete on public.manual_payment_entry_links
for each row execute function public.reject_manual_payment_mutation();

create or replace function public.reject_manual_ledger_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.manual_payment_entries e where e.payment_id = old.id
  ) or exists (
    select 1 from public.manual_payment_entry_links l where l.payment_id = old.id
  ) then
    raise exception 'manual payment ledger rows are append-only; record a reversal';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.manual_collection_contract_v2(
  p_product_kind text,
  p_credit_pack_credits integer
)
returns table (payment_type text, expected_amount numeric, credits integer)
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  case p_product_kind
    when 'launch_build' then
      return query select 'build_fee'::text, 390000::numeric, 0;
    when 'list_build' then
      return query select 'build_fee'::text, 590000::numeric, 0;
    when 'video_addon' then
      return query select 'build_fee'::text, 200000::numeric, 0;
    when 'subscription' then
      return query select 'maintenance_subscription'::text, 29900::numeric, 2;
    when 'credit_pack' then
      case p_credit_pack_credits
        when 1 then return query select 'credit_pack'::text, 15000::numeric, 1;
        when 5 then return query select 'credit_pack'::text, 65000::numeric, 5;
        when 10 then return query select 'credit_pack'::text, 120000::numeric, 10;
        else raise exception 'manual_collection_contract_v2: unknown credit pack';
      end case;
    else raise exception 'manual_collection_contract_v2: invalid product kind';
  end case;
end;
$$;

create or replace function public.materialize_manual_collection_client_v2(
  p_entry_id uuid,
  p_client_id uuid,
  p_memo text default null,
  p_as_of timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.manual_payment_entries%rowtype;
  v_existing public.manual_payment_entry_links%rowtype;
  v_payment_id uuid;
  v_payment_type text;
  v_expected_amount numeric;
  v_credits integer;
  v_granted boolean := false;
  v_key text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_entry_id::text, 0));
  select * into v_entry from public.manual_payment_entries e
  where e.id = p_entry_id and e.direction = 'receipt' for update;
  if not found then raise exception 'materialize_manual_collection_client_v2: receipt not found'; end if;
  if exists (select 1 from public.manual_payment_entries r where r.reverses_entry_id = p_entry_id) then
    raise exception 'materialize_manual_collection_client_v2: receipt is cancelled';
  end if;
  if p_client_id is null or not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'materialize_manual_collection_client_v2: client not found';
  end if;
  if v_entry.client_id is not null and v_entry.client_id <> p_client_id then
    raise exception 'materialize_manual_collection_client_v2: receipt belongs to another client';
  end if;
  if v_entry.site_id is not null and not exists (
    select 1 from public.sites s where s.id = v_entry.site_id and s.client_id = p_client_id
  ) then
    raise exception 'materialize_manual_collection_client_v2: site ownership mismatch';
  end if;

  select * into v_existing from public.manual_payment_entry_links l
  where l.entry_id = p_entry_id and l.link_kind = 'client';
  if found then
    if v_existing.client_id <> p_client_id then
      raise exception 'materialize_manual_collection_client_v2: already linked to another client';
    end if;
    return v_existing.payment_id;
  end if;

  -- Legacy OPS receipts already carry their immutable payment. Recording a
  -- link only adds history and never creates a second economic row.
  if v_entry.payment_id is not null then
    insert into public.manual_payment_entry_links (
      entry_id, link_kind, client_id, payment_id, memo, created_at
    ) values (
      p_entry_id, 'client', p_client_id, v_entry.payment_id,
      nullif(btrim(p_memo), ''), p_as_of
    );
    return v_entry.payment_id;
  end if;

  select payment_type, expected_amount, credits
  into v_payment_type, v_expected_amount, v_credits
  from public.manual_collection_contract_v2(v_entry.product_kind, v_entry.credit_pack_credits);
  if v_entry.amount <> v_expected_amount then
    raise exception 'materialize_manual_collection_client_v2: amount mismatch';
  end if;

  insert into public.payments (
    client_id, type, amount, credits_granted, provider_payment_key, created_at
  ) values (
    p_client_id, v_payment_type, v_entry.amount,
    case when v_entry.product_kind = 'subscription' then 0 else v_credits end,
    null, v_entry.created_at
  ) returning id into v_payment_id;

  v_key := 'manual:' || v_entry.collection_channel || ':' || v_entry.collection_reference;
  if v_entry.product_kind = 'subscription' then
    perform public.renew_site_subscription(p_client_id, v_key, 'admin_manual', 1, null, p_as_of);
    v_granted := public.grant_subscription_month_credits(p_client_id, p_as_of, v_payment_id);
    if v_granted then
      update public.payments set credits_granted = v_credits where id = v_payment_id;
    end if;
  elsif v_entry.product_kind = 'credit_pack' then
    perform public.grant_credits(
      p_client_id, v_credits, 'purchase', v_payment_id, 'purchase:' || v_key, 365
    );
  end if;

  insert into public.manual_payment_entry_links (
    entry_id, link_kind, client_id, payment_id, memo, created_at
  ) values (
    p_entry_id, 'client', p_client_id, v_payment_id,
    nullif(btrim(p_memo), ''), p_as_of
  );
  return v_payment_id;
end;
$$;

create or replace function public.record_manual_collection_v2(
  p_client_id uuid,
  p_customer_name text,
  p_customer_contact text,
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
  v_entry public.manual_payment_entries%rowtype;
  v_payment_id uuid;
  v_expected_amount numeric;
begin
  if p_collection_channel not in ('kmong', 'bank_transfer', 'other') then
    raise exception 'record_manual_collection_v2: invalid collection channel';
  end if;
  if p_collection_reference is null or btrim(p_collection_reference) = '' then
    raise exception 'record_manual_collection_v2: collection reference is required';
  end if;
  if p_amount is null or p_amount <= 0 or trunc(p_amount) <> p_amount then
    raise exception 'record_manual_collection_v2: amount must be a positive whole KRW value';
  end if;
  if p_client_id is null then
    if p_customer_name is null or btrim(p_customer_name) = ''
       or p_customer_contact is null or btrim(p_customer_contact) = '' then
      raise exception 'record_manual_collection_v2: manual customer identity is required';
    end if;
    if p_site_id is not null then
      raise exception 'record_manual_collection_v2: link a client before a site';
    end if;
  else
    if not exists (select 1 from public.clients c where c.id = p_client_id) then
      raise exception 'record_manual_collection_v2: client not found';
    end if;
    if nullif(btrim(p_customer_name), '') is not null
       or nullif(btrim(p_customer_contact), '') is not null then
      raise exception 'record_manual_collection_v2: customer identity is ambiguous';
    end if;
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites s where s.id = p_site_id and s.client_id = p_client_id
  ) then
    raise exception 'record_manual_collection_v2: site ownership mismatch';
  end if;

  select expected_amount into v_expected_amount
  from public.manual_collection_contract_v2(p_product_kind, p_credit_pack_credits);
  if p_amount <> v_expected_amount then
    raise exception 'record_manual_collection_v2: amount does not match current product contract';
  end if;
  if p_product_kind <> 'credit_pack' and p_credit_pack_credits is not null then
    raise exception 'record_manual_collection_v2: credit-pack metadata is not allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_collection_channel || ':' || btrim(p_collection_reference), 0
  ));
  select * into v_existing from public.manual_payment_entries e
  where e.collection_channel = p_collection_channel
    and e.collection_reference = btrim(p_collection_reference);
  if found then
    if v_existing.direction <> 'receipt'
      or v_existing.client_id is distinct from p_client_id
      or v_existing.customer_name is distinct from nullif(btrim(p_customer_name), '')
      or v_existing.customer_contact is distinct from nullif(btrim(p_customer_contact), '')
      or v_existing.site_id is distinct from p_site_id
      or v_existing.product_kind <> p_product_kind
      or v_existing.credit_pack_credits is distinct from p_credit_pack_credits
      or v_existing.amount <> p_amount then
      raise exception 'record_manual_collection_v2: collection reference conflicts with existing evidence';
    end if;
    select coalesce(v_existing.payment_id, l.payment_id) into v_payment_id
    from (select 1) seed
    left join public.manual_payment_entry_links l
      on l.entry_id = v_existing.id and l.link_kind = 'client';
    return jsonb_build_object(
      'duplicated', true, 'entry_id', v_existing.id, 'payment_id', v_payment_id
    );
  end if;

  insert into public.manual_payment_entries (
    payment_id, client_id, site_id, customer_name, customer_contact,
    credit_pack_credits, product_kind, direction, amount,
    collection_channel, collection_reference, memo, created_at
  ) values (
    null, p_client_id, p_site_id, nullif(btrim(p_customer_name), ''),
    nullif(btrim(p_customer_contact), ''), p_credit_pack_credits,
    p_product_kind, 'receipt', p_amount, p_collection_channel,
    btrim(p_collection_reference), nullif(btrim(p_memo), ''), p_as_of
  ) returning * into v_entry;

  if p_client_id is not null then
    v_payment_id := public.materialize_manual_collection_client_v2(
      v_entry.id, p_client_id, '수금 기록 시 기존 계정 연결', p_as_of
    );
  end if;
  return jsonb_build_object(
    'duplicated', false, 'entry_id', v_entry.id, 'payment_id', v_payment_id
  );
end;
$$;

create or replace function public.link_manual_collection_client(
  p_entry_id uuid,
  p_client_id uuid,
  p_memo text default null,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.manual_payment_entry_links%rowtype;
  v_payment_id uuid;
begin
  select * into v_existing from public.manual_payment_entry_links l
  where l.entry_id = p_entry_id and l.link_kind = 'client';
  if found then
    if v_existing.client_id <> p_client_id then
      raise exception 'link_manual_collection_client: already linked to another client';
    end if;
    return jsonb_build_object(
      'duplicated', true, 'entry_id', p_entry_id, 'payment_id', v_existing.payment_id
    );
  end if;
  v_payment_id := public.materialize_manual_collection_client_v2(
    p_entry_id, p_client_id, p_memo, p_as_of
  );
  return jsonb_build_object(
    'duplicated', false, 'entry_id', p_entry_id, 'payment_id', v_payment_id
  );
end;
$$;

create or replace function public.link_manual_collection_site(
  p_entry_id uuid,
  p_site_id uuid,
  p_memo text default null,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.manual_payment_entries%rowtype;
  v_client_link public.manual_payment_entry_links%rowtype;
  v_site_link public.manual_payment_entry_links%rowtype;
  v_client_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_entry_id::text, 0));
  select * into v_entry from public.manual_payment_entries e
  where e.id = p_entry_id and e.direction = 'receipt' for update;
  if not found then raise exception 'link_manual_collection_site: receipt not found'; end if;
  if exists (select 1 from public.manual_payment_entries r where r.reverses_entry_id = p_entry_id) then
    raise exception 'link_manual_collection_site: receipt is cancelled';
  end if;

  select * into v_site_link from public.manual_payment_entry_links l
  where l.entry_id = p_entry_id and l.link_kind = 'site';
  if v_entry.site_id is not null or found then
    if coalesce(v_entry.site_id, v_site_link.site_id) <> p_site_id then
      raise exception 'link_manual_collection_site: already linked to another site';
    end if;
    return jsonb_build_object('duplicated', true, 'entry_id', p_entry_id);
  end if;

  select * into v_client_link from public.manual_payment_entry_links l
  where l.entry_id = p_entry_id and l.link_kind = 'client';
  v_client_id := coalesce(v_entry.client_id, v_client_link.client_id);
  if v_client_id is null then raise exception 'link_manual_collection_site: client is required'; end if;
  if not exists (
    select 1 from public.sites s where s.id = p_site_id and s.client_id = v_client_id
  ) then
    raise exception 'link_manual_collection_site: site ownership mismatch';
  end if;

  insert into public.manual_payment_entry_links (
    entry_id, link_kind, client_id, site_id, memo, created_at
  ) values (
    p_entry_id, 'site', v_client_id, p_site_id, nullif(btrim(p_memo), ''), p_as_of
  );
  return jsonb_build_object('duplicated', false, 'entry_id', p_entry_id);
end;
$$;

create or replace function public.reverse_manual_collection_v2(
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
  v_client_link public.manual_payment_entry_links%rowtype;
  v_reversal public.manual_payment_entries%rowtype;
  v_client_id uuid;
  v_payment_id uuid;
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
    raise exception 'reverse_manual_collection_v2: correction reference is required';
  end if;
  if p_memo is null or btrim(p_memo) = '' then
    raise exception 'reverse_manual_collection_v2: correction reason is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_entry_id::text, 0));
  select * into v_original from public.manual_payment_entries e
  where e.id = p_entry_id and e.direction = 'receipt';
  if not found then raise exception 'reverse_manual_collection_v2: original receipt not found'; end if;

  -- Preserve the battle-tested OPS correction path for legacy rows.
  if v_original.payment_id is not null and v_original.client_id is not null then
    return public.reverse_manual_collection(
      p_entry_id, p_collection_reference, p_memo, p_as_of
    );
  end if;

  select * into v_existing from public.manual_payment_entries e
  where e.reverses_entry_id = p_entry_id;
  if found then
    if v_existing.collection_reference <> btrim(p_collection_reference) then
      raise exception 'reverse_manual_collection_v2: receipt already has another reversal';
    end if;
    return jsonb_build_object('duplicated', true, 'entry_id', v_existing.id, 'payment_id', null);
  end if;
  if exists (
    select 1 from public.manual_payment_entries e
    where e.collection_channel = v_original.collection_channel
      and e.collection_reference = btrim(p_collection_reference)
  ) then
    raise exception 'reverse_manual_collection_v2: correction reference already exists';
  end if;

  select * into v_client_link from public.manual_payment_entry_links l
  where l.entry_id = p_entry_id and l.link_kind = 'client';
  v_client_id := coalesce(v_original.client_id, v_client_link.client_id);
  v_payment_id := coalesce(v_original.payment_id, v_client_link.payment_id);
  if v_payment_id is not null then
    perform 1 from public.payments p where p.id = v_payment_id;
    if not found then raise exception 'reverse_manual_collection_v2: payment evidence is missing'; end if;
  end if;

  if v_original.product_kind = 'subscription' and v_payment_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_client_id::text, 0));
    v_key := 'manual:' || v_original.collection_channel || ':' || v_original.collection_reference;
    select r.id into v_subscription_renewal_id
    from public.site_subscription_renewals r
    where r.client_id = v_client_id and r.idempotency_key = v_key
      and r.source = 'admin_manual' and r.reversed_at is null
    for update;
    if not found then
      raise exception 'reverse_manual_collection_v2: subscription renewal evidence is missing';
    end if;

    select r.id into v_latest_renewal_id
    from public.site_subscription_renewals r
    where r.client_id = v_client_id and r.reversed_at is null
    order by r.period_end desc, r.created_at desc, r.id desc limit 1 for update;
    if v_latest_renewal_id is distinct from v_subscription_renewal_id then
      raise exception 'reverse_manual_collection_v2: only the latest subscription renewal can be reversed';
    end if;

    select r.period_end, r.payment_id, r.source, r.idempotency_key
    into v_remaining_period_end, v_replacement_payment_id, v_replacement_source, v_replacement_key
    from public.site_subscription_renewals r
    where r.client_id = v_client_id and r.reversed_at is null and r.id <> v_subscription_renewal_id
    order by r.period_end desc, r.created_at desc, r.id desc limit 1;

    if v_replacement_source = 'admin_manual' then
      select coalesce(e.payment_id, client_link.payment_id) into v_replacement_payment_id
      from public.manual_payment_entries e
      left join public.manual_payment_entry_links client_link
        on client_link.entry_id = e.id and client_link.link_kind = 'client'
      where coalesce(e.client_id, client_link.client_id) = v_client_id
        and e.product_kind = 'subscription' and e.direction = 'receipt'
        and 'manual:' || e.collection_channel || ':' || e.collection_reference = v_replacement_key
        and not exists (
          select 1 from public.manual_payment_entries correction where correction.reverses_entry_id = e.id
        )
      limit 1;
      if not found then
        raise exception 'reverse_manual_collection_v2: replacement manual payment evidence is missing';
      end if;
    end if;
    v_remaining_period_end := coalesce(v_remaining_period_end, p_as_of);
    if v_remaining_period_end > p_as_of and v_replacement_payment_id is null then
      raise exception 'reverse_manual_collection_v2: replacement payment evidence is missing';
    end if;
  end if;

  if v_payment_id is not null and v_original.product_kind in ('subscription', 'credit_pack') then
    perform public.lock_credit_balance(v_client_id);
    for v_lot in
      select l.id, l.expires_at from public.credit_ledger l
      where l.client_id = v_client_id and l.reference_id = v_payment_id
        and l.reason = case when v_original.product_kind = 'subscription'
          then 'subscription_grant' else 'purchase' end
        and l.amount > 0
      order by l.created_at asc, l.id asc
    loop
      v_remaining := public.credit_lot_remaining(v_client_id, v_lot.id);
      if v_remaining > 0 then
        insert into public.credit_ledger (
          client_id, amount, reason, reference_id, idempotency_key
        ) values (
          v_client_id, -v_remaining, 'admin_clawback', v_lot.id,
          'manual_reversal_clawback:' || p_entry_id::text || ':' || v_lot.id::text
        );
        update public.credit_balances set balance = balance - v_remaining, updated_at = p_as_of
        where client_id = v_client_id;
        if v_original.product_kind = 'subscription' and v_remaining_period_end > p_as_of then
          insert into public.credit_ledger (
            client_id, amount, reason, reference_id, expires_at, idempotency_key
          ) values (
            v_client_id, v_remaining, 'subscription_grant', v_replacement_payment_id,
            v_lot.expires_at,
            'manual_reversal_regrant:' || p_entry_id::text || ':' || v_lot.id::text
          );
          update public.credit_balances set balance = balance + v_remaining, updated_at = p_as_of
          where client_id = v_client_id;
        end if;
      end if;
    end loop;
  end if;

  if v_original.product_kind = 'subscription' and v_payment_id is not null then
    update public.site_subscription_renewals r set reversed_at = p_as_of
    where r.id = v_subscription_renewal_id and r.reversed_at is null;
    if not found then
      raise exception 'reverse_manual_collection_v2: subscription renewal evidence is missing';
    end if;
    select s.status into v_current_status from public.site_subscriptions s
    where s.client_id = v_client_id for update;
    v_next_status := case
      when v_remaining_period_end <= p_as_of then 'cancelled'
      when v_current_status is null or v_current_status = 'active' then 'active'
      else v_current_status
    end;
    insert into public.site_subscriptions (client_id, status, current_period_end, updated_at)
    values (v_client_id, v_next_status, v_remaining_period_end, p_as_of)
    on conflict (client_id) do update set
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = excluded.updated_at;
  end if;

  insert into public.manual_payment_entries (
    payment_id, client_id, site_id, customer_name, customer_contact,
    credit_pack_credits, product_kind, direction, amount,
    collection_channel, collection_reference, memo, reverses_entry_id, created_at
  ) values (
    null, v_original.client_id, v_original.site_id, v_original.customer_name,
    v_original.customer_contact, v_original.credit_pack_credits,
    v_original.product_kind, 'reversal', v_original.amount,
    v_original.collection_channel, btrim(p_collection_reference), btrim(p_memo),
    p_entry_id, p_as_of
  ) returning * into v_reversal;
  return jsonb_build_object('duplicated', false, 'entry_id', v_reversal.id, 'payment_id', null);
end;
$$;

revoke execute on function public.manual_collection_contract_v2(text, integer)
  from public, anon, authenticated;
revoke execute on function public.materialize_manual_collection_client_v2(uuid, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function public.record_manual_collection_v2(
  uuid, text, text, uuid, text, numeric, text, text, text, integer, timestamptz
) from public, anon, authenticated;
revoke execute on function public.link_manual_collection_client(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.link_manual_collection_site(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.reverse_manual_collection_v2(uuid, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.record_manual_collection_v2(
  uuid, text, text, uuid, text, numeric, text, text, text, integer, timestamptz
) to service_role;
grant execute on function public.link_manual_collection_client(uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.link_manual_collection_site(uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.reverse_manual_collection_v2(uuid, text, text, timestamptz)
  to service_role;
