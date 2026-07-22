-- Customer imports remain distinct provenance, but may enter factual slots only
-- after the same server-stamped rights and person-classification attestations.

create or replace function public.guard_general_attestation_asset_authority()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_site_id uuid;
  v_revoked_at timestamptz;
begin
  if tg_op <> 'INSERT' then
    raise exception 'general attestation asset membership is immutable'
      using errcode = '23514';
  end if;

  select a.client_id, a.site_id, a.revoked_at
    into v_client_id, v_site_id, v_revoked_at
  from public.asset_general_attestations a
  where a.id = new.attestation_id;
  if not found or v_revoked_at is not null then
    raise exception 'active general attestation is required'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.asset_records ar
    where ar.id = new.asset_id
      and ar.client_id = v_client_id
      and ar.origin in ('customer_upload', 'customer_import')
      and (
        (v_site_id is null and ar.site_id is null)
        or ar.site_id = v_site_id
      )
  ) then
    raise exception 'general attestation requires an owned customer source in the same scope'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.guard_person_asset_consent_authority()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.actor_id is distinct from new.client_id then
    raise exception 'person consent actor must equal authenticated owner context'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.asset_records ar
    where ar.id = new.asset_id
      and ar.client_id = new.client_id
      and ar.origin in ('customer_upload', 'customer_import')
  ) then
    raise exception 'person consent requires an owned customer source'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.id                is distinct from old.id
    or new.asset_id          is distinct from old.asset_id
    or new.client_id         is distinct from old.client_id
    or new.statement_version is distinct from old.statement_version
    or new.actor_id          is distinct from old.actor_id
    or new.attested_at       is distinct from old.attested_at
    or new.created_at        is distinct from old.created_at
    then
      raise exception 'person consent authority fields are immutable'
        using errcode = '23514';
    end if;
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'person consent revocation is immutable'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.create_general_asset_attestation(
  p_client_id uuid,
  p_site_id uuid,
  p_statement_version text,
  p_asset_ids uuid[],
  p_person_asset_ids uuid[],
  p_non_person_asset_ids uuid[],
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_expected integer := coalesce(cardinality(p_asset_ids), 0);
  v_valid integer;
  v_existing public.asset_general_attestations%rowtype;
  v_existing_count integer;
begin
  if p_client_id is null
     or p_statement_version is null
     or length(btrim(p_statement_version)) = 0
     or p_idempotency_key is null
     or v_expected = 0
     or p_person_asset_ids is null
     or p_non_person_asset_ids is null
     or exists (select 1 from unnest(p_asset_ids) ids(id) where id is null)
     or (select count(distinct id) from unnest(p_asset_ids) ids(id)) <> v_expected
     or exists (select 1 from unnest(p_person_asset_ids) ids(id) where id is null)
     or exists (select 1 from unnest(p_non_person_asset_ids) ids(id) where id is null)
     or (select count(distinct id) from unnest(p_person_asset_ids) ids(id))
        <> cardinality(p_person_asset_ids)
     or (select count(distinct id) from unnest(p_non_person_asset_ids) ids(id))
        <> cardinality(p_non_person_asset_ids)
     or p_person_asset_ids && p_non_person_asset_ids
     or not (p_person_asset_ids <@ p_asset_ids)
     or not (p_non_person_asset_ids <@ p_asset_ids)
     or cardinality(p_person_asset_ids) + cardinality(p_non_person_asset_ids) <> v_expected
  then
    raise exception 'general attestation input is incomplete or duplicated'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_client_id::text || ':' || p_idempotency_key::text, 0)
  );

  select * into v_existing
  from public.asset_general_attestations a
  where a.client_id = p_client_id and a.idempotency_key = p_idempotency_key
  for update;
  if found then
    select count(*) into v_existing_count
    from public.asset_general_attestation_assets aa
    where aa.attestation_id = v_existing.id
      and aa.asset_id = any(p_asset_ids);
    if v_existing.site_id is distinct from p_site_id
       or v_existing.statement_version is distinct from p_statement_version
       or not (v_existing.person_asset_ids @> p_person_asset_ids
               and v_existing.person_asset_ids <@ p_person_asset_ids)
       or not (v_existing.non_person_asset_ids @> p_non_person_asset_ids
               and v_existing.non_person_asset_ids <@ p_non_person_asset_ids)
       or v_existing.revoked_at is not null
       or v_existing_count <> v_expected
       or (select count(*) from public.asset_general_attestation_assets aa
           where aa.attestation_id = v_existing.id) <> v_expected
    then
      raise exception 'idempotency key belongs to a different general attestation'
        using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  if p_site_id is not null and not exists (
    select 1 from public.sites s where s.id = p_site_id and s.client_id = p_client_id
  ) then
    raise exception 'general attestation site must belong to client'
      using errcode = '42501';
  end if;

  perform 1 from public.asset_records ar where ar.id = any(p_asset_ids) for update;
  select count(*) into v_valid
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.origin in ('customer_upload', 'customer_import')
    and (
      (p_site_id is null and ar.site_id is null)
      or ar.site_id = p_site_id
    );
  if v_valid <> v_expected then
    raise exception 'general attestation assets must be owned customer sources in one scope'
      using errcode = '23514';
  end if;

  insert into public.asset_general_attestations (
    client_id, site_id, scope_type, statement_version,
    person_asset_ids, non_person_asset_ids, actor_id, idempotency_key
  ) values (
    p_client_id,
    p_site_id,
    case when p_site_id is null then 'onboarding' else 'site' end,
    p_statement_version,
    p_person_asset_ids,
    p_non_person_asset_ids,
    p_client_id,
    p_idempotency_key
  ) returning id into v_id;

  insert into public.asset_general_attestation_assets (attestation_id, asset_id)
  select v_id, ids.id from unnest(p_asset_ids) ids(id);
  return v_id;
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
  v_owned integer;
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
    raise exception 'atomic asset binding requires unique complete asset ids'
      using errcode = '23514';
  end if;

  perform 1 from public.asset_records ar where ar.id = any(p_asset_ids) for update;
  select count(*) into v_owned
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.site_id is null;
  if v_owned <> v_expected then
    raise exception 'asset set is missing, foreign, or already site-bound'
      using errcode = '42501';
  end if;

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
    raise exception 'attestation asset set must exactly cover the site customer sources'
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
      or ar.client_id <> p_client_id
      or ar.site_id is not null
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
  if v_bound <> v_expected then
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

revoke all on function public.create_general_asset_attestation(
  uuid, uuid, text, uuid[], uuid[], uuid[], uuid
) from public, anon, authenticated;
grant execute on function public.create_general_asset_attestation(
  uuid, uuid, text, uuid[], uuid[], uuid[], uuid
) to service_role;

revoke all on function public.create_site_with_asset_bindings_and_attestation(
  uuid, text, jsonb, smallint, uuid[], uuid
) from public, anon, authenticated;
grant execute on function public.create_site_with_asset_bindings_and_attestation(
  uuid, text, jsonb, smallint, uuid[], uuid
) to service_role;
