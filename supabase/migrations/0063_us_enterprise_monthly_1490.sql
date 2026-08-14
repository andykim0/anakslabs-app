-- Correct the US Enterprise monthly contract to match the published offer:
-- USD 990 setup plus USD 1,490 per month. Migration 0056 remains immutable
-- history; this additive migration replaces only the recurring receipt RPC.

create or replace function public.handle_usd_industry_maintenance_payment(
  p_site_id uuid,
  p_client_id uuid,
  p_provider_payment_key text,
  p_amount numeric,
  p_industry_profile_id text,
  p_pricing_model_version text,
  p_period_months integer,
  p_stripe_subscription_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.sites%rowtype;
  v_payment public.payments%rowtype;
  v_subscription public.site_subscriptions%rowtype;
  v_renewal jsonb;
  v_stripe_subscription_id text;
begin
  if p_provider_payment_key is null or btrim(p_provider_payment_key) = '' then
    raise exception 'handle_usd_industry_maintenance_payment: provider_payment_key is required'
      using errcode = '23514';
  end if;
  if p_amount is null
     or trunc(p_amount) <> p_amount
     or p_amount <> 1490::numeric then
    raise exception 'handle_usd_industry_maintenance_payment: amount must equal 1490 whole USD'
      using errcode = '23514';
  end if;
  if p_industry_profile_id is null or length(btrim(p_industry_profile_id)) = 0 then
    raise exception 'handle_usd_industry_maintenance_payment: industry profile is required'
      using errcode = '23514';
  end if;
  if p_pricing_model_version is null or length(btrim(p_pricing_model_version)) = 0 then
    raise exception 'handle_usd_industry_maintenance_payment: pricing model version is required'
      using errcode = '23514';
  end if;
  if p_period_months is null or p_period_months <> 1 then
    raise exception 'handle_usd_industry_maintenance_payment: period must equal one month'
      using errcode = '23514';
  end if;
  if p_stripe_subscription_id is null or length(btrim(p_stripe_subscription_id)) = 0 then
    raise exception 'handle_usd_industry_maintenance_payment: Stripe subscription ID is required'
      using errcode = '23514';
  end if;
  v_stripe_subscription_id := btrim(p_stripe_subscription_id);

  perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));

  select * into v_site
  from public.sites s
  where s.id = p_site_id
  for update;
  if not found
     or v_site.client_id <> p_client_id
     or v_site.industry_profile_id is distinct from btrim(p_industry_profile_id)
     or v_site.pricing_model_version is distinct from btrim(p_pricing_model_version) then
    raise exception 'handle_usd_industry_maintenance_payment: site industry contract mismatch'
      using errcode = '42501';
  end if;

  select * into v_subscription
  from public.site_subscriptions s
  where s.client_id = p_client_id
  for update;
  if found and (
    (v_subscription.site_id is not null and v_subscription.site_id <> p_site_id)
    or (
      v_subscription.industry_profile_id is not null
      and v_subscription.industry_profile_id <> btrim(p_industry_profile_id)
    )
    or (
      v_subscription.pricing_model_version is not null
      and v_subscription.pricing_model_version <> btrim(p_pricing_model_version)
    )
    or (
      v_subscription.stripe_subscription_id is not null
      and v_subscription.stripe_subscription_id <> v_stripe_subscription_id
    )
  ) then
    raise exception 'handle_usd_industry_maintenance_payment: subscription contract mismatch'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.site_subscriptions s
    where s.stripe_subscription_id = v_stripe_subscription_id
      and s.client_id <> p_client_id
  ) then
    raise exception 'handle_usd_industry_maintenance_payment: Stripe subscription belongs to another owner'
      using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments p
  where p.provider_payment_key = p_provider_payment_key;
  if found then
    if v_payment.client_id <> p_client_id
       or v_payment.type <> 'maintenance_subscription'
       or v_payment.amount <> p_amount
       or v_payment.currency <> 'USD'
       or v_payment.industry_profile_id is distinct from btrim(p_industry_profile_id)
       or v_payment.pricing_model_version is distinct from btrim(p_pricing_model_version)
       or v_payment.service_period_months is distinct from p_period_months then
      raise exception 'handle_usd_industry_maintenance_payment: provider key contract mismatch'
        using errcode = '42501';
    end if;
    if v_subscription.client_id is null
       or v_subscription.site_id is distinct from p_site_id
       or v_subscription.industry_profile_id is distinct from btrim(p_industry_profile_id)
       or v_subscription.pricing_model_version is distinct from btrim(p_pricing_model_version)
       or v_subscription.stripe_subscription_id is distinct from v_stripe_subscription_id then
      raise exception 'handle_usd_industry_maintenance_payment: duplicated payment lacks subscription binding'
        using errcode = '42501';
    end if;
    return jsonb_build_object(
      'processed', false,
      'duplicated', true,
      'payment_id', v_payment.id,
      'credits_granted', 0,
      'currency', 'USD',
      'current_period_end', v_subscription.current_period_end,
      'stripe_subscription_id', v_stripe_subscription_id
    );
  end if;

  insert into public.payments (
    client_id,
    type,
    amount,
    currency,
    credits_granted,
    provider_payment_key,
    pricing_model_version,
    service_period_months,
    industry_profile_id
  ) values (
    p_client_id,
    'maintenance_subscription',
    p_amount,
    'USD',
    0,
    p_provider_payment_key,
    btrim(p_pricing_model_version),
    p_period_months,
    btrim(p_industry_profile_id)
  )
  on conflict (provider_payment_key) do nothing
  returning * into v_payment;

  if not found then
    select * into v_payment
    from public.payments p
    where p.provider_payment_key = p_provider_payment_key;
    if not found
       or v_payment.client_id <> p_client_id
       or v_payment.type <> 'maintenance_subscription'
       or v_payment.amount <> p_amount
       or v_payment.currency <> 'USD'
       or v_payment.industry_profile_id is distinct from btrim(p_industry_profile_id)
       or v_payment.pricing_model_version is distinct from btrim(p_pricing_model_version)
       or v_payment.service_period_months is distinct from p_period_months then
      raise exception 'handle_usd_industry_maintenance_payment: provider key contract mismatch'
        using errcode = '42501';
    end if;
    select * into v_subscription
    from public.site_subscriptions s
    where s.client_id = p_client_id;
    if not found
       or v_subscription.site_id is distinct from p_site_id
       or v_subscription.industry_profile_id is distinct from btrim(p_industry_profile_id)
       or v_subscription.pricing_model_version is distinct from btrim(p_pricing_model_version)
       or v_subscription.stripe_subscription_id is distinct from v_stripe_subscription_id then
      raise exception 'handle_usd_industry_maintenance_payment: duplicated payment lacks subscription binding'
        using errcode = '42501';
    end if;
    return jsonb_build_object(
      'processed', false,
      'duplicated', true,
      'payment_id', v_payment.id,
      'credits_granted', 0,
      'currency', 'USD',
      'current_period_end', v_subscription.current_period_end,
      'stripe_subscription_id', v_stripe_subscription_id
    );
  end if;

  v_renewal := public.renew_site_subscription(
    p_client_id,
    'payment:' || p_provider_payment_key,
    'payment_webhook',
    p_period_months,
    v_payment.id,
    now()
  );

  update public.site_subscriptions
  set site_id = p_site_id,
      industry_profile_id = btrim(p_industry_profile_id),
      pricing_model_version = btrim(p_pricing_model_version),
      stripe_subscription_id = v_stripe_subscription_id
  where client_id = p_client_id
    and (site_id is null or site_id = p_site_id)
    and (
      industry_profile_id is null
      or industry_profile_id = btrim(p_industry_profile_id)
    )
    and (
      pricing_model_version is null
      or pricing_model_version = btrim(p_pricing_model_version)
    )
    and (
      stripe_subscription_id is null
      or stripe_subscription_id = v_stripe_subscription_id
    )
  returning * into v_subscription;
  if not found then
    raise exception 'handle_usd_industry_maintenance_payment: subscription binding failed'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'processed', true,
    'duplicated', false,
    'payment_id', v_payment.id,
    'credits_granted', 0,
    'currency', 'USD',
    'current_period_end', v_renewal -> 'current_period_end',
    'stripe_subscription_id', v_stripe_subscription_id
  );
end;
$$;

revoke all on function public.handle_usd_industry_maintenance_payment(
  uuid, uuid, text, numeric, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.handle_usd_industry_maintenance_payment(
  uuid, uuid, text, numeric, text, text, integer, text
) to service_role;
