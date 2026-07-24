-- PRICE R1: versioned monthly-retainer payment contracts.
--
-- Existing payment and subscription rows are historical evidence and remain untouched.
-- New subscription receipts pin the server-selected price version and service period.

alter table public.payments
  add column pricing_model_version text,
  add column service_period_months integer;

alter table public.payments
  add constraint payments_service_period_check check (
    service_period_months is null
    or service_period_months between 1 and 12
  );

comment on column public.payments.pricing_model_version is
  'Server-selected price-table version pinned when a new subscription payment is accepted.';
comment on column public.payments.service_period_months is
  'Paid service period pinned at acceptance. Null preserves legacy payment evidence.';

alter table public.manual_payment_entries
  add column pricing_model_version text,
  add column service_period_months integer;

alter table public.manual_payment_entries
  add constraint manual_payment_entries_service_period_check check (
    service_period_months is null
    or service_period_months between 1 and 12
  );

comment on column public.manual_payment_entries.pricing_model_version is
  'Price-table version supplied by the server for a new subscription receipt.';
comment on column public.manual_payment_entries.service_period_months is
  'Service period supplied by the server for a new subscription receipt.';

create or replace function public.handle_maintenance_payment(
  p_client_id uuid,
  p_provider_payment_key text,
  p_amount numeric,
  p_pricing_model_version text,
  p_period_months integer
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

  select id into v_existing_payment_id
  from public.payments
  where provider_payment_key = p_provider_payment_key;
  if found then
    return jsonb_build_object(
      'processed', false, 'duplicated', true, 'payment_id', v_existing_payment_id
    );
  end if;

  if p_amount is null or p_amount <= 0 or trunc(p_amount) <> p_amount then
    raise exception 'handle_maintenance_payment: amount must be a positive whole KRW value';
  end if;
  if p_pricing_model_version is null or btrim(p_pricing_model_version) = '' then
    raise exception 'handle_maintenance_payment: pricing model version is required';
  end if;
  if p_period_months is null or p_period_months < 1 or p_period_months > 12 then
    raise exception 'handle_maintenance_payment: period must be between 1 and 12 months';
  end if;

  insert into public.payments (
    client_id, type, amount, credits_granted, provider_payment_key,
    pricing_model_version, service_period_months
  ) values (
    p_client_id, 'maintenance_subscription', p_amount, 0, p_provider_payment_key,
    btrim(p_pricing_model_version), p_period_months
  )
  on conflict (provider_payment_key) do nothing
  returning id into v_payment_id;
  if v_payment_id is null then
    return jsonb_build_object('processed', false, 'duplicated', true);
  end if;

  v_renewal := public.renew_site_subscription(
    p_client_id,
    'payment:' || p_provider_payment_key,
    'payment_webhook',
    p_period_months,
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
    'pricing_model_version', btrim(p_pricing_model_version),
    'period_months', p_period_months,
    'credits_granted', case when v_granted then 2 else 0 end,
    'current_period_end', v_renewal -> 'current_period_end'
  );
end;
$$;

drop function public.handle_maintenance_payment(uuid, text, numeric);

revoke execute on function public.handle_maintenance_payment(uuid, text, numeric, text, integer)
  from public, anon, authenticated;
grant execute on function public.handle_maintenance_payment(uuid, text, numeric, text, integer)
  to service_role;

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
  v_period_months integer;
  v_pricing_model_version text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_entry_id::text, 0));
  select * into v_entry from public.manual_payment_entries e
  where e.id = p_entry_id and e.direction = 'receipt' for update;
  if not found then
    raise exception 'materialize_manual_collection_client_v2: receipt not found';
  end if;
  if exists (
    select 1 from public.manual_payment_entries r where r.reverses_entry_id = p_entry_id
  ) then
    raise exception 'materialize_manual_collection_client_v2: receipt is cancelled';
  end if;
  if p_client_id is null or not exists (
    select 1 from public.clients c where c.id = p_client_id
  ) then
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

  if v_entry.payment_id is not null then
    insert into public.manual_payment_entry_links (
      entry_id, link_kind, client_id, payment_id, memo, created_at
    ) values (
      p_entry_id, 'client', p_client_id, v_entry.payment_id,
      nullif(btrim(p_memo), ''), p_as_of
    );
    return v_entry.payment_id;
  end if;

  if v_entry.product_kind = 'subscription' then
    v_payment_type := 'maintenance_subscription';
    v_expected_amount := v_entry.amount;
    v_credits := 2;
    v_period_months := coalesce(v_entry.service_period_months, 1);
    v_pricing_model_version := coalesce(
      nullif(btrim(v_entry.pricing_model_version), ''),
      'legacy-unversioned'
    );
  else
    select payment_type, expected_amount, credits
    into v_payment_type, v_expected_amount, v_credits
    from public.manual_collection_contract_v2(
      v_entry.product_kind,
      v_entry.credit_pack_credits
    );
    v_period_months := null;
    v_pricing_model_version := null;
  end if;
  if v_entry.amount <> v_expected_amount then
    raise exception 'materialize_manual_collection_client_v2: amount mismatch';
  end if;

  insert into public.payments (
    client_id, type, amount, credits_granted, provider_payment_key, created_at,
    pricing_model_version, service_period_months
  ) values (
    p_client_id, v_payment_type, v_entry.amount,
    case when v_entry.product_kind = 'subscription' then 0 else v_credits end,
    null, v_entry.created_at, v_pricing_model_version, v_period_months
  ) returning id into v_payment_id;

  v_key := 'manual:' || v_entry.collection_channel || ':' || v_entry.collection_reference;
  if v_entry.product_kind = 'subscription' then
    perform public.renew_site_subscription(
      p_client_id, v_key, 'admin_manual', v_period_months, null, p_as_of
    );
    v_granted := public.grant_subscription_month_credits(p_client_id, p_as_of, v_payment_id);
    if v_granted then
      update public.payments set credits_granted = v_credits where id = v_payment_id;
    end if;
  elsif v_entry.product_kind = 'credit_pack' then
    perform public.grant_credits(
      p_client_id, v_credits, 'purchase', v_payment_id, 'purchase:' || v_key, 365
    );
  elsif v_entry.product_kind = 'video_addon' then
    update public.clients set tier = 'premium' where id = p_client_id;
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

create or replace function public.record_manual_collection_v3(
  p_client_id uuid,
  p_customer_name text,
  p_customer_contact text,
  p_site_id uuid,
  p_product_kind text,
  p_amount numeric,
  p_collection_channel text,
  p_collection_reference text,
  p_memo text,
  p_credit_pack_credits integer,
  p_pricing_model_version text,
  p_subscription_period_months integer,
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
begin
  if p_product_kind <> 'subscription' then
    return public.record_manual_collection_v2(
      p_client_id,
      p_customer_name,
      p_customer_contact,
      p_site_id,
      p_product_kind,
      p_amount,
      p_collection_channel,
      p_collection_reference,
      p_memo,
      p_credit_pack_credits,
      p_as_of
    );
  end if;

  if p_collection_channel not in ('kmong', 'bank_transfer', 'other') then
    raise exception 'record_manual_collection_v3: invalid collection channel';
  end if;
  if p_collection_reference is null or btrim(p_collection_reference) = '' then
    raise exception 'record_manual_collection_v3: collection reference is required';
  end if;
  if p_amount is null or p_amount <= 0 or trunc(p_amount) <> p_amount then
    raise exception 'record_manual_collection_v3: amount must be a positive whole KRW value';
  end if;
  if p_pricing_model_version is null or btrim(p_pricing_model_version) = '' then
    raise exception 'record_manual_collection_v3: pricing model version is required';
  end if;
  if p_subscription_period_months is null
     or p_subscription_period_months < 1
     or p_subscription_period_months > 12 then
    raise exception 'record_manual_collection_v3: subscription period is invalid';
  end if;
  if p_credit_pack_credits is not null then
    raise exception 'record_manual_collection_v3: credit-pack metadata is not allowed';
  end if;
  if p_client_id is null then
    if p_customer_name is null or btrim(p_customer_name) = ''
       or p_customer_contact is null or btrim(p_customer_contact) = '' then
      raise exception 'record_manual_collection_v3: manual customer identity is required';
    end if;
    if p_site_id is not null then
      raise exception 'record_manual_collection_v3: link a client before a site';
    end if;
  else
    if not exists (select 1 from public.clients c where c.id = p_client_id) then
      raise exception 'record_manual_collection_v3: client not found';
    end if;
    if nullif(btrim(p_customer_name), '') is not null
       or nullif(btrim(p_customer_contact), '') is not null then
      raise exception 'record_manual_collection_v3: customer identity is ambiguous';
    end if;
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites s where s.id = p_site_id and s.client_id = p_client_id
  ) then
    raise exception 'record_manual_collection_v3: site ownership mismatch';
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
      or v_existing.amount <> p_amount
      or v_existing.pricing_model_version is distinct from btrim(p_pricing_model_version)
      or v_existing.service_period_months is distinct from p_subscription_period_months then
      raise exception 'record_manual_collection_v3: collection reference conflicts with existing evidence';
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
    collection_channel, collection_reference, memo, created_at,
    pricing_model_version, service_period_months
  ) values (
    null, p_client_id, p_site_id, nullif(btrim(p_customer_name), ''),
    nullif(btrim(p_customer_contact), ''), p_credit_pack_credits,
    p_product_kind, 'receipt', p_amount, p_collection_channel,
    btrim(p_collection_reference), nullif(btrim(p_memo), ''), p_as_of,
    btrim(p_pricing_model_version), p_subscription_period_months
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

revoke execute on function public.record_manual_collection_v2(
  uuid, text, text, uuid, text, numeric, text, text, text, integer, timestamptz
) from service_role;
revoke execute on function public.record_manual_collection_v3(
  uuid, text, text, uuid, text, numeric, text, text, text, integer, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_manual_collection_v3(
  uuid, text, text, uuid, text, numeric, text, text, text, integer, text, integer, timestamptz
) to service_role;
