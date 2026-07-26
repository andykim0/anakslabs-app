-- Licensed stock is a server-owned shared registry row. Customer-owned assets
-- keep their existing owner and one-site binding contract.

alter table public.asset_records
  alter column client_id drop not null;

alter table public.asset_records
  drop constraint if exists asset_records_origin_check;

alter table public.asset_records
  add constraint asset_records_origin_check
  check (origin in (
    'customer_upload',
    'customer_import',
    'ai_generated',
    'licensed_stock',
    'legacy_unknown'
  ));

alter table public.asset_records
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists stock_key text,
  add column if not exists provider text,
  add column if not exists provider_asset_id text,
  add column if not exists attribution jsonb;

alter table public.asset_records
  add constraint asset_records_raster_dimensions_pair
  check (
    (width is null and height is null)
    or (
      media_type = 'image'
      and width is not null and width > 0
      and height is not null and height > 0
    )
  ),
  add constraint asset_records_licensed_stock_shape
  check (
    (
      origin = 'licensed_stock'
      and client_id is null
      and site_id is null
      and media_type = 'image'
      and width is not null
      and height is not null
      and length(btrim(stock_key)) > 0
      and provider = 'pexels'
      and length(btrim(provider_asset_id)) > 0
      and attribution ->> 'provider' = 'pexels'
      and length(btrim(attribution ->> 'photographer')) > 0
      and attribution ->> 'photographerUrl' like 'https://www.pexels.com/%'
      and attribution ->> 'sourceUrl' like 'https://www.pexels.com/photo/%'
      and attribution ->> 'licenseUrl' = 'https://www.pexels.com/license/'
    )
    or (
      origin <> 'licensed_stock'
      and client_id is not null
      and stock_key is null
      and provider is null
      and provider_asset_id is null
      and attribution is null
    )
  );

create unique index if not exists asset_records_stock_key_uidx
  on public.asset_records (stock_key)
  where stock_key is not null;

create unique index if not exists asset_records_provider_asset_uidx
  on public.asset_records (provider, provider_asset_id)
  where provider is not null and provider_asset_id is not null;

update public.asset_records
set
  width = (image_quality -> 'metrics' ->> 'width')::integer,
  height = (image_quality -> 'metrics' ->> 'height')::integer
where media_type = 'image'
  and width is null
  and height is null
  and (image_quality -> 'metrics' ->> 'width') ~ '^[1-9][0-9]*$'
  and (image_quality -> 'metrics' ->> 'height') ~ '^[1-9][0-9]*$';

comment on column public.asset_records.width is
  'Immutable server-decoded raster width. Unknown legacy, SVG, and video records remain null.';
comment on column public.asset_records.height is
  'Immutable server-decoded raster height. Unknown legacy, SVG, and video records remain null.';
comment on column public.asset_records.stock_key is
  'Stable provider-neutral stock key, separate from the UUID registry identity.';
comment on column public.asset_records.attribution is
  'Immutable licensed stock credit projected into saved site manifests.';

create or replace function public.guard_asset_record_authority()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id                is distinct from old.id
    or new.client_id         is distinct from old.client_id
    or new.origin            is distinct from old.origin
    or new.media_type        is distinct from old.media_type
    or new.storage_bucket    is distinct from old.storage_bucket
    or new.storage_key       is distinct from old.storage_key
    or new.canonical_url     is distinct from old.canonical_url
    or new.created_at        is distinct from old.created_at
    or new.image_quality     is distinct from old.image_quality
    or new.stock_key         is distinct from old.stock_key
    or new.provider          is distinct from old.provider
    or new.provider_asset_id is distinct from old.provider_asset_id
    or new.attribution       is distinct from old.attribution
    then
      raise exception 'asset record authority fields are immutable'
        using errcode = '23514';
    end if;

    if old.width is not null and new.width is distinct from old.width then
      raise exception 'asset width is immutable once known'
        using errcode = '23514';
    end if;
    if old.height is not null and new.height is distinct from old.height then
      raise exception 'asset height is immutable once known'
        using errcode = '23514';
    end if;
    if (old.width is null) <> (old.height is null) then
      raise exception 'partial legacy dimensions cannot be updated'
        using errcode = '23514';
    end if;
    if old.width is null and (
      (new.width is null) <> (new.height is null)
      or (new.width is not null and new.media_type <> 'image')
    ) then
      raise exception 'asset dimensions must be a complete raster pair'
        using errcode = '23514';
    end if;

    if old.site_id is not null and new.site_id is distinct from old.site_id then
      raise exception 'asset record site binding is immutable once set'
        using errcode = '23514';
    end if;
    if old.origin = 'licensed_stock' and new.site_id is not null then
      raise exception 'licensed stock cannot be bound to a customer site'
        using errcode = '23514';
    end if;
  end if;

  if new.site_id is not null and not exists (
    select 1
    from public.sites s
    where s.id = new.site_id
      and s.client_id = new.client_id
  ) then
    raise exception 'asset record site must belong to client'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_asset_record_authority()
  from public, anon, authenticated;

-- Service-role maintenance seam for one-time raster dimension backfill.
create or replace function public.set_asset_raster_dimensions_once(
  p_asset_id uuid,
  p_width integer,
  p_height integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if p_width is null or p_width <= 0 or p_height is null or p_height <= 0 then
    raise exception 'positive raster dimensions are required'
      using errcode = '23514';
  end if;

  update public.asset_records
  set width = p_width, height = p_height
  where id = p_asset_id
    and media_type = 'image'
    and width is null
    and height is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.set_asset_raster_dimensions_once(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.set_asset_raster_dimensions_once(uuid, integer, integer)
  to service_role;

-- Mixed manifests validate customer-owned provisional rows and global licensed
-- stock together, while binding only the customer-owned subset.
create or replace function public.create_site_with_asset_bindings(
  p_client_id uuid,
  p_name text,
  p_draft_config jsonb,
  p_asset_policy_version smallint,
  p_asset_ids uuid[]
)
returns setof public.sites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site_id uuid := gen_random_uuid();
  v_expected integer := coalesce(cardinality(p_asset_ids), 0);
  v_available integer;
  v_bind_expected integer;
  v_manifest_count integer;
  v_manifest_distinct integer;
  v_bound integer;
begin
  if p_client_id is null or p_name is null or length(btrim(p_name)) = 0 or p_draft_config is null then
    raise exception 'site creation input is incomplete' using errcode = '23514';
  end if;
  if p_asset_policy_version is not null and p_asset_policy_version <> 2 then
    raise exception 'unsupported asset policy version' using errcode = '23514';
  end if;
  if v_expected = 0
     or exists (select 1 from unnest(p_asset_ids) ids(asset_id) where asset_id is null)
     or (select count(distinct asset_id) from unnest(p_asset_ids) ids(asset_id)) <> v_expected
  then
    raise exception 'atomic asset manifest requires unique complete asset ids'
      using errcode = '23514';
  end if;

  perform 1 from public.asset_records ar where ar.id = any(p_asset_ids) for update;
  select count(*) into v_available
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and (
      (ar.client_id = p_client_id and ar.site_id is null)
      or (
        ar.origin = 'licensed_stock'
        and ar.client_id is null
        and ar.site_id is null
      )
    );
  if v_available <> v_expected then
    raise exception 'asset set is missing, foreign, or already site-bound'
      using errcode = '42501';
  end if;

  select count(*) into v_bind_expected
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.site_id is null;

  select count(*) into v_manifest_count
  from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item;
  select count(distinct (item ->> 'assetId')) into v_manifest_distinct
  from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item;
  if v_manifest_count <> v_expected or v_manifest_distinct <> v_expected or exists (
    select 1
    from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item
    left join public.asset_records ar on ar.id = (item ->> 'assetId')::uuid
    where ar.id is null
      or not (ar.id = any(p_asset_ids))
      or not (
        (ar.client_id = p_client_id and ar.site_id is null)
        or (
          ar.origin = 'licensed_stock'
          and ar.client_id is null
          and ar.site_id is null
        )
      )
      or ar.canonical_url is distinct from (item ->> 'url')
  ) then
    raise exception 'draft asset manifest does not match registry authority'
      using errcode = '23514';
  end if;

  insert into public.sites (
    id, client_id, name, draft_config, status, asset_policy_version
  ) values (
    v_site_id, p_client_id, p_name, p_draft_config, 'draft', p_asset_policy_version
  );

  update public.asset_records ar
  set site_id = v_site_id
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.site_id is null;
  get diagnostics v_bound = row_count;
  if v_bound <> v_bind_expected then
    raise exception 'asset binding changed concurrently' using errcode = '40001';
  end if;

  return query select s.* from public.sites s where s.id = v_site_id;
end;
$$;

create or replace function public.create_site_with_asset_bindings_and_attestation(
  p_client_id uuid,
  p_name text,
  p_draft_config jsonb,
  p_asset_policy_version smallint,
  p_asset_ids uuid[],
  p_general_attestation_id uuid
)
returns setof public.sites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site_id uuid := gen_random_uuid();
  v_expected integer := coalesce(cardinality(p_asset_ids), 0);
  v_available integer;
  v_bind_expected integer;
  v_manifest_count integer;
  v_manifest_distinct integer;
  v_bound integer;
  v_attestation public.asset_general_attestations%rowtype;
  v_attested_asset_count integer;
  v_customer_source_count integer;
begin
  if p_client_id is null
     or p_name is null
     or length(btrim(p_name)) = 0
     or p_draft_config is null
     or p_asset_policy_version is distinct from 2
     or p_general_attestation_id is null
  then
    raise exception 'attested site creation requires complete v2 input'
      using errcode = '23514';
  end if;
  if v_expected = 0
     or exists (select 1 from unnest(p_asset_ids) ids(asset_id) where asset_id is null)
     or (select count(distinct asset_id) from unnest(p_asset_ids) ids(asset_id)) <> v_expected
  then
    raise exception 'atomic asset manifest requires unique complete asset ids'
      using errcode = '23514';
  end if;

  perform 1 from public.asset_records ar where ar.id = any(p_asset_ids) for update;
  select count(*) into v_available
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and (
      (ar.client_id = p_client_id and ar.site_id is null)
      or (
        ar.origin = 'licensed_stock'
        and ar.client_id is null
        and ar.site_id is null
      )
    );
  if v_available <> v_expected then
    raise exception 'asset set is missing, foreign, or already site-bound'
      using errcode = '42501';
  end if;
  select count(*) into v_bind_expected
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.site_id is null;

  select * into v_attestation
  from public.asset_general_attestations a
  where a.id = p_general_attestation_id
  for update;
  if not found
     or v_attestation.client_id <> p_client_id
     or v_attestation.site_id is not null
     or v_attestation.scope_type <> 'onboarding'
     or v_attestation.revoked_at is not null
     or v_attestation.statement_version <> 'general-assets-2026-07-v1'
  then
    raise exception 'current owned onboarding attestation is required'
      using errcode = '42501';
  end if;

  select count(*) into v_attested_asset_count
  from public.asset_general_attestation_assets aa
  join public.asset_records ar on ar.id = aa.asset_id
  where aa.attestation_id = p_general_attestation_id
    and aa.asset_id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.origin in ('customer_upload', 'customer_import')
    and ar.site_id is null;
  select count(*) into v_customer_source_count
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.origin in ('customer_upload', 'customer_import')
    and ar.site_id is null;
  if v_attested_asset_count = 0
     or v_attested_asset_count <> (
       select count(*) from public.asset_general_attestation_assets aa
       where aa.attestation_id = p_general_attestation_id
     )
     or v_attested_asset_count <> v_customer_source_count
     or v_attestation.person_asset_ids && v_attestation.non_person_asset_ids
     or not (v_attestation.person_asset_ids <@ p_asset_ids)
     or not (v_attestation.non_person_asset_ids <@ p_asset_ids)
     or cardinality(v_attestation.person_asset_ids)
        + cardinality(v_attestation.non_person_asset_ids) <> v_attested_asset_count
  then
    raise exception 'attestation asset set must exactly cover site customer sources'
      using errcode = '23514';
  end if;

  select count(*) into v_manifest_count
  from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item;
  select count(distinct (item ->> 'assetId')) into v_manifest_distinct
  from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item;
  if v_manifest_count <> v_expected or v_manifest_distinct <> v_expected or exists (
    select 1
    from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item
    left join public.asset_records ar on ar.id = (item ->> 'assetId')::uuid
    where ar.id is null
      or not (ar.id = any(p_asset_ids))
      or not (
        (ar.client_id = p_client_id and ar.site_id is null)
        or (
          ar.origin = 'licensed_stock'
          and ar.client_id is null
          and ar.site_id is null
        )
      )
      or ar.canonical_url is distinct from (item ->> 'url')
  ) then
    raise exception 'draft asset manifest does not match registry authority'
      using errcode = '23514';
  end if;

  insert into public.sites (
    id, client_id, name, draft_config, status, asset_policy_version
  ) values (
    v_site_id, p_client_id, p_name, p_draft_config, 'draft', p_asset_policy_version
  );

  update public.asset_records ar
  set site_id = v_site_id
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.site_id is null;
  get diagnostics v_bound = row_count;
  if v_bound <> v_bind_expected then
    raise exception 'asset binding changed concurrently' using errcode = '40001';
  end if;

  update public.asset_general_attestations a
  set site_id = v_site_id, scope_type = 'site'
  where a.id = p_general_attestation_id
    and a.client_id = p_client_id
    and a.site_id is null
    and a.scope_type = 'onboarding'
    and a.revoked_at is null;
  if not found then
    raise exception 'attestation binding changed concurrently' using errcode = '40001';
  end if;

  return query select s.* from public.sites s where s.id = v_site_id;
end;
$$;

revoke all on function public.create_site_with_asset_bindings(
  uuid, text, jsonb, smallint, uuid[]
) from public, anon, authenticated;
grant execute on function public.create_site_with_asset_bindings(
  uuid, text, jsonb, smallint, uuid[]
) to service_role;

revoke all on function public.create_site_with_asset_bindings_and_attestation(
  uuid, text, jsonb, smallint, uuid[], uuid
) from public, anon, authenticated;
grant execute on function public.create_site_with_asset_bindings_and_attestation(
  uuid, text, jsonb, smallint, uuid[], uuid
) to service_role;
