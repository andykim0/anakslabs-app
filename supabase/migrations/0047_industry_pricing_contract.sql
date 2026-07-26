-- Industry-priced contracts pin the server-selected profile before the first
-- publish quote. Existing rows stay null and retain their historical contract.

alter table public.sites
  add column industry_profile_id text,
  add column pricing_model_version text;

alter table public.sites
  add constraint sites_industry_contract_pair_check check (
    (industry_profile_id is null and pricing_model_version is null)
    or (
      pricing_model_version is not null
      and length(btrim(pricing_model_version)) > 0
      and (
        industry_profile_id is null
        or length(btrim(industry_profile_id)) > 0
      )
    )
  );

comment on column public.sites.industry_profile_id is
  'Server-selected industry contract profile for new sites. Null preserves legacy sites.';
comment on column public.sites.pricing_model_version is
  'Price catalog cohort pinned before the first quote, including unsupported new industries.';

alter table public.site_subscriptions
  add column site_id uuid references public.sites (id) on delete restrict,
  add column industry_profile_id text,
  add column pricing_model_version text;

create unique index site_subscriptions_site_idx
  on public.site_subscriptions (site_id)
  where site_id is not null;

alter table public.site_subscriptions
  add constraint site_subscriptions_industry_contract_check check (
    (site_id is null and industry_profile_id is null and pricing_model_version is null)
    or (
      site_id is not null
      and length(btrim(industry_profile_id)) > 0
      and length(btrim(pricing_model_version)) > 0
    )
  );

alter table public.payments
  add column industry_profile_id text;

alter table public.payments
  add constraint payments_industry_contract_check check (
    industry_profile_id is null
    or (
      type = 'maintenance_subscription'
      and pricing_model_version is not null
      and length(btrim(industry_profile_id)) > 0
    )
  );

alter table public.manual_payment_entries
  add column industry_profile_id text;

alter table public.manual_payment_entries
  add constraint manual_payment_industry_contract_check check (
    industry_profile_id is null
    or (
      product_kind = 'subscription'
      and pricing_model_version is not null
      and length(btrim(industry_profile_id)) > 0
    )
  );

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
  if old.industry_profile_id is not null
     and new.industry_profile_id is distinct from old.industry_profile_id then
    raise exception 'sites: industry_profile_id cannot be changed once set'
      using errcode = '42501';
  end if;
  if old.pricing_model_version is not null
     and new.pricing_model_version is distinct from old.pricing_model_version then
    raise exception 'sites: pricing_model_version cannot be changed once set'
      using errcode = '42501';
  end if;

  if current_user in ('authenticated', 'anon') then
    if new.draft_expires_at is distinct from old.draft_expires_at
       or new.industry_profile_id is distinct from old.industry_profile_id
       or new.pricing_model_version is distinct from old.pricing_model_version then
      raise exception 'sites: server-owned contract fields cannot be changed'
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

create or replace function public.create_industry_site_with_asset_bindings(
  p_client_id uuid,
  p_name text,
  p_draft_config jsonb,
  p_asset_policy_version smallint,
  p_asset_ids uuid[],
  p_industry_profile_id text,
  p_pricing_model_version text
)
returns setof public.sites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.sites%rowtype;
begin
  if p_pricing_model_version is null
     or length(btrim(p_pricing_model_version)) = 0 then
    raise exception 'pricing model version is required' using errcode = '23514';
  end if;
  if p_industry_profile_id is not null
     and length(btrim(p_industry_profile_id)) = 0 then
    raise exception 'industry profile cannot be blank' using errcode = '23514';
  end if;

  select * into v_site
  from public.create_site_with_asset_bindings(
    p_client_id,
    p_name,
    p_draft_config,
    p_asset_policy_version,
    p_asset_ids
  );

  update public.sites
  set industry_profile_id = nullif(btrim(p_industry_profile_id), ''),
      pricing_model_version = btrim(p_pricing_model_version)
  where id = v_site.id
    and industry_profile_id is null
    and pricing_model_version is null
  returning * into v_site;

  if not found then
    raise exception 'industry contract pin failed' using errcode = '40001';
  end if;
  return next v_site;
end;
$$;

create or replace function public.create_industry_site_with_asset_bindings_and_attestation(
  p_client_id uuid,
  p_name text,
  p_draft_config jsonb,
  p_asset_policy_version smallint,
  p_asset_ids uuid[],
  p_general_attestation_id uuid,
  p_industry_profile_id text,
  p_pricing_model_version text
)
returns setof public.sites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.sites%rowtype;
begin
  if p_pricing_model_version is null
     or length(btrim(p_pricing_model_version)) = 0 then
    raise exception 'pricing model version is required' using errcode = '23514';
  end if;
  if p_industry_profile_id is not null
     and length(btrim(p_industry_profile_id)) = 0 then
    raise exception 'industry profile cannot be blank' using errcode = '23514';
  end if;

  select * into v_site
  from public.create_site_with_asset_bindings_and_attestation(
    p_client_id,
    p_name,
    p_draft_config,
    p_asset_policy_version,
    p_asset_ids,
    p_general_attestation_id
  );

  update public.sites
  set industry_profile_id = nullif(btrim(p_industry_profile_id), ''),
      pricing_model_version = btrim(p_pricing_model_version)
  where id = v_site.id
    and industry_profile_id is null
    and pricing_model_version is null
  returning * into v_site;

  if not found then
    raise exception 'industry contract pin failed' using errcode = '40001';
  end if;
  return next v_site;
end;
$$;

revoke all on function public.create_industry_site_with_asset_bindings(
  uuid, text, jsonb, smallint, uuid[], text, text
) from public, anon, authenticated;
grant execute on function public.create_industry_site_with_asset_bindings(
  uuid, text, jsonb, smallint, uuid[], text, text
) to service_role;

revoke all on function public.create_industry_site_with_asset_bindings_and_attestation(
  uuid, text, jsonb, smallint, uuid[], uuid, text, text
) from public, anon, authenticated;
grant execute on function public.create_industry_site_with_asset_bindings_and_attestation(
  uuid, text, jsonb, smallint, uuid[], uuid, text, text
) to service_role;
