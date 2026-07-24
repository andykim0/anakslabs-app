-- PRICE P1: annual publish payment, premium add-on evidence, draft expiry and economics events.
--
-- Existing build-fee and monthly-subscription rows remain immutable history.
-- New maintenance receipts use the annual contract. Retried provider keys are
-- resolved before current-price validation so accepted legacy evidence stays idempotent.

alter table public.payments
  drop constraint payments_type_check;
alter table public.payments
  add constraint payments_type_check check (type in (
    'build_fee', 'maintenance_subscription', 'premium_addon', 'credit_pack'
  ));

alter table public.sites
  add column draft_expires_at timestamptz;

alter table public.sites
  alter column draft_expires_at set default (now() + interval '30 days');

comment on column public.sites.draft_expires_at is
  'Soft expiry for new pricing-model drafts. Null preserves every pre-existing site.';

create index sites_draft_expiry_idx
  on public.sites (draft_expires_at)
  where draft_expires_at is not null and status in ('draft', 'building');

create or replace function public.guard_site_protected_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.asset_policy_version is not null
     and new.asset_policy_version is distinct from old.asset_policy_version then
    raise exception 'sites: asset_policy_version cannot be changed once set'
      using errcode = '42501';
  end if;

  if current_user in ('authenticated', 'anon') then
    if new.draft_expires_at is distinct from old.draft_expires_at then
      raise exception 'sites: draft expiry is server-owned'
        using errcode = '42501';
    end if;
  end if;

  if new.draft_config is distinct from old.draft_config
     and old.draft_expires_at is not null
     and new.status in ('draft', 'building') then
    new.draft_expires_at := now() + interval '30 days';
  end if;

  if current_user in ('authenticated', 'anon') then
    if new.id                     is distinct from old.id
    or new.client_id              is distinct from old.client_id
    or new.domain                 is distinct from old.domain
    or new.domain_type            is distinct from old.domain_type
    or new.dns_verified           is distinct from old.dns_verified
    or new.cloudflare_hostname_id is distinct from old.cloudflare_hostname_id
    or new.status                 is distinct from old.status
    or new.site_config            is distinct from old.site_config
    or new.published_at           is distinct from old.published_at
    or new.created_at             is distinct from old.created_at
    or new.free_regens_used       is distinct from old.free_regens_used
    or new.export_status          is distinct from old.export_status
    or new.export_requested_at    is distinct from old.export_requested_at
    or new.export_url             is distinct from old.export_url
    or new.asset_policy_version   is distinct from old.asset_policy_version
    then
      raise exception 'sites: 고객은 name/draft_config/survey만 수정할 수 있습니다'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create table public.build_economics_events (
  id                    uuid primary key default gen_random_uuid(),
  event_kind            text not null check (event_kind in (
                            'build_completed', 'external_call', 'publish_payment'
                          )),
  client_id             uuid references public.clients (id) on delete set null,
  site_id               uuid references public.sites (id) on delete set null,
  build_attempt_id      text,
  provider              text,
  model                 text,
  operation             text,
  input_units           bigint check (input_units is null or input_units >= 0),
  output_units          bigint check (output_units is null or output_units >= 0),
  cost_usd_micros       bigint not null default 0 check (cost_usd_micros >= 0),
  pricing_model_version text not null check (length(btrim(pricing_model_version)) > 0),
  idempotency_key       text not null unique check (length(btrim(idempotency_key)) > 0),
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  constraint build_economics_owner_check check (
    client_id is not null
    or site_id is not null
    or coalesce(length(btrim(build_attempt_id)), 0) > 0
  ),
  constraint build_economics_external_shape_check check (
    event_kind <> 'external_call'
    or (
      coalesce(length(btrim(provider)), 0) > 0
      and coalesce(length(btrim(model)), 0) > 0
      and coalesce(length(btrim(operation)), 0) > 0
    )
  )
);

create index build_economics_events_site_created_idx
  on public.build_economics_events (site_id, created_at desc)
  where site_id is not null;
create index build_economics_events_client_created_idx
  on public.build_economics_events (client_id, created_at desc)
  where client_id is not null;

comment on table public.build_economics_events is
  'Append-only variable-cost and build-to-publish conversion evidence. Video safety limits remain in video_gen_log.';

alter table public.build_economics_events enable row level security;
revoke all on table public.build_economics_events from public, anon, authenticated, service_role;
grant select on table public.build_economics_events to service_role;

create or replace function public.record_build_economics_event(
  p_event_kind text,
  p_client_id uuid,
  p_site_id uuid,
  p_build_attempt_id text,
  p_provider text,
  p_model text,
  p_operation text,
  p_input_units bigint,
  p_output_units bigint,
  p_cost_usd_micros bigint,
  p_pricing_model_version text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_event_kind not in ('build_completed', 'external_call', 'publish_payment') then
    raise exception 'record_build_economics_event: invalid event kind';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'record_build_economics_event: idempotency key is required';
  end if;
  if p_pricing_model_version is null or btrim(p_pricing_model_version) = '' then
    raise exception 'record_build_economics_event: pricing model version is required';
  end if;
  if p_cost_usd_micros is null or p_cost_usd_micros < 0 then
    raise exception 'record_build_economics_event: cost must be non-negative';
  end if;

  insert into public.build_economics_events (
    event_kind, client_id, site_id, build_attempt_id,
    provider, model, operation, input_units, output_units,
    cost_usd_micros, pricing_model_version, idempotency_key, metadata, created_at
  ) values (
    p_event_kind, p_client_id, p_site_id, nullif(btrim(p_build_attempt_id), ''),
    nullif(btrim(p_provider), ''), nullif(btrim(p_model), ''), nullif(btrim(p_operation), ''),
    p_input_units, p_output_units, p_cost_usd_micros,
    btrim(p_pricing_model_version), btrim(p_idempotency_key),
    coalesce(p_metadata, '{}'::jsonb), p_created_at
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.build_economics_events
    where idempotency_key = btrim(p_idempotency_key);
    return jsonb_build_object('recorded', false, 'duplicated', true, 'event_id', v_id);
  end if;
  return jsonb_build_object('recorded', true, 'duplicated', false, 'event_id', v_id);
end;
$$;

revoke execute on function public.record_build_economics_event(
  text, uuid, uuid, text, text, text, text, bigint, bigint, bigint, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_build_economics_event(
  text, uuid, uuid, text, text, text, text, bigint, bigint, bigint, text, text, jsonb, timestamptz
) to service_role;

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

  select id into v_existing_payment_id
  from public.payments
  where provider_payment_key = p_provider_payment_key;
  if found then
    return jsonb_build_object(
      'processed', false, 'duplicated', true, 'payment_id', v_existing_payment_id
    );
  end if;

  if p_amount is distinct from 390000::numeric then
    raise exception 'handle_maintenance_payment: amount must equal annual contract';
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
    12,
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

create or replace function public.handle_premium_addon_payment(
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
begin
  if p_provider_payment_key is null or btrim(p_provider_payment_key) = '' then
    raise exception 'handle_premium_addon_payment: provider_payment_key is required';
  end if;

  select id into v_existing_payment_id
  from public.payments
  where provider_payment_key = p_provider_payment_key;
  if found then
    return jsonb_build_object(
      'processed', false, 'duplicated', true, 'payment_id', v_existing_payment_id
    );
  end if;

  if p_amount is distinct from 200000::numeric then
    raise exception 'handle_premium_addon_payment: amount must equal current contract';
  end if;

  insert into public.payments (client_id, type, amount, credits_granted, provider_payment_key)
  values (p_client_id, 'premium_addon', p_amount, 0, p_provider_payment_key)
  on conflict (provider_payment_key) do nothing
  returning id into v_payment_id;
  if v_payment_id is null then
    return jsonb_build_object('processed', false, 'duplicated', true);
  end if;

  update public.clients set tier = 'premium' where id = p_client_id;
  if not found then
    raise exception 'handle_premium_addon_payment: client not found';
  end if;

  return jsonb_build_object(
    'processed', true, 'duplicated', false, 'payment_id', v_payment_id
  );
end;
$$;

revoke execute on function public.handle_premium_addon_payment(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.handle_premium_addon_payment(uuid, text, numeric)
  to service_role;

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
      return query select 'premium_addon'::text, 200000::numeric, 0;
    when 'subscription' then
      return query select 'maintenance_subscription'::text, 390000::numeric, 2;
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

create or replace function public.reject_retired_manual_receipt()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.direction = 'receipt' and new.product_kind in ('launch_build', 'list_build') then
    raise exception 'manual collection: retired build products cannot be recorded';
  end if;
  return new;
end;
$$;

create trigger manual_payment_entries_reject_retired_receipt
before insert on public.manual_payment_entries
for each row execute function public.reject_retired_manual_receipt();

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
    perform public.renew_site_subscription(p_client_id, v_key, 'admin_manual', 12, null, p_as_of);
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
