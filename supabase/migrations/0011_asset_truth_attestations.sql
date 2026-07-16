-- ============================================================================
-- 0011_asset_truth_attestations.sql — versioned factual-asset statements
--
-- Attestation records are server-stamped evidence inputs, not client booleans
-- and not legal-compliance guarantees. Generic statements remain separate from
-- the specialized 0009 before/after ledger. Migration 0010 and its RPC remain
-- unchanged for rollback and legacy compatibility.
-- ============================================================================

create table if not exists public.asset_general_attestations (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients (id) on delete cascade,
  site_id             uuid references public.sites (id) on delete cascade,
  scope_type          text not null check (scope_type in ('onboarding', 'site')),
  statement_version   text not null check (length(btrim(statement_version)) > 0),
  person_asset_ids    uuid[] not null default '{}'::uuid[],
  non_person_asset_ids uuid[] not null default '{}'::uuid[],
  actor_id             uuid not null references public.clients (id) on delete cascade,
  attested_at          timestamptz not null default now(),
  revoked_at           timestamptz,
  idempotency_key      uuid not null,
  created_at           timestamptz not null default now(),
  constraint asset_general_attestations_scope_check check (
    (scope_type = 'onboarding' and site_id is null)
    or (scope_type = 'site' and site_id is not null)
  ),
  constraint asset_general_attestations_revocation_check check (
    revoked_at is null or revoked_at >= attested_at
  ),
  constraint asset_general_attestations_classification_disjoint_check check (
    not (person_asset_ids && non_person_asset_ids)
  ),
  constraint asset_general_attestations_retry_unique unique (client_id, idempotency_key)
);

create table if not exists public.asset_general_attestation_assets (
  attestation_id uuid not null
    references public.asset_general_attestations (id) on delete cascade,
  asset_id       uuid not null references public.asset_records (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (attestation_id, asset_id)
);

alter table public.asset_general_attestations
  add column if not exists person_asset_ids uuid[] not null default '{}'::uuid[],
  add column if not exists non_person_asset_ids uuid[] not null default '{}'::uuid[];

create table if not exists public.asset_person_consents (
  id                  uuid primary key default gen_random_uuid(),
  asset_id            uuid not null references public.asset_records (id) on delete cascade,
  client_id           uuid not null references public.clients (id) on delete cascade,
  statement_version   text not null check (length(btrim(statement_version)) > 0),
  actor_id             uuid not null references public.clients (id) on delete cascade,
  attested_at          timestamptz not null default now(),
  revoked_at           timestamptz,
  created_at           timestamptz not null default now(),
  constraint asset_person_consents_revocation_check check (
    revoked_at is null or revoked_at >= attested_at
  )
);

-- A site may accumulate immutable snapshots as its selected photo set changes.
-- One-time binding applies per record, not as a one-active-record-per-site cap.
drop index if exists public.asset_general_attestations_active_site_uidx;
create index if not exists asset_general_attestations_client_idx
  on public.asset_general_attestations (client_id, attested_at desc);
create index if not exists asset_general_attestations_site_current_idx
  on public.asset_general_attestations (site_id, attested_at desc)
  where site_id is not null and revoked_at is null;
create index if not exists asset_general_attestation_assets_asset_idx
  on public.asset_general_attestation_assets (asset_id);
create unique index if not exists asset_person_consents_active_asset_version_uidx
  on public.asset_person_consents (asset_id, statement_version)
  where revoked_at is null;
create index if not exists asset_person_consents_client_idx
  on public.asset_person_consents (client_id, attested_at desc);

comment on table public.asset_general_attestations is
  'Server-stamped, versioned general factual-media statement. Not a legal guarantee.';
comment on table public.asset_person_consents is
  'Per-asset person-publication consent statement. Stores no person name or biometric data.';

-- General statements are immutable except for one onboarding→owned-site bind
-- and one-way revocation. Even service-role bugs cannot forge actor or scope.
create or replace function public.guard_general_asset_attestation_authority()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.actor_id is distinct from new.client_id then
    raise exception 'attestation actor must equal authenticated owner context'
      using errcode = '23514';
  end if;

  if new.site_id is not null and not exists (
    select 1 from public.sites s
    where s.id = new.site_id and s.client_id = new.client_id
  ) then
    raise exception 'general attestation site must belong to client'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.id                is distinct from old.id
    or new.client_id         is distinct from old.client_id
    or new.statement_version is distinct from old.statement_version
    or new.person_asset_ids   is distinct from old.person_asset_ids
    or new.non_person_asset_ids is distinct from old.non_person_asset_ids
    or new.actor_id          is distinct from old.actor_id
    or new.attested_at       is distinct from old.attested_at
    or new.idempotency_key   is distinct from old.idempotency_key
    or new.created_at        is distinct from old.created_at
    then
      raise exception 'general attestation authority fields are immutable'
        using errcode = '23514';
    end if;

    if new.site_id is distinct from old.site_id
       or new.scope_type is distinct from old.scope_type then
      if old.revoked_at is not null
         or old.site_id is not null
         or old.scope_type <> 'onboarding'
         or new.site_id is null
         or new.scope_type <> 'site' then
        raise exception 'general attestation supports one onboarding-to-site binding'
          using errcode = '23514';
      end if;
      if exists (
        select 1
        from public.asset_general_attestation_assets aa
        join public.asset_records ar on ar.id = aa.asset_id
        where aa.attestation_id = old.id
          and (ar.client_id <> new.client_id or ar.site_id is distinct from new.site_id)
      ) then
        raise exception 'general attestation assets must be bound to the same site first'
          using errcode = '23514';
      end if;
    end if;

    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'general attestation revocation is immutable'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists asset_general_attestations_guard_authority
  on public.asset_general_attestations;
create trigger asset_general_attestations_guard_authority
before insert or update on public.asset_general_attestations
for each row execute function public.guard_general_asset_attestation_authority();

-- The covered asset set is fixed at acceptance time. URL membership is never
-- evidence: every row must resolve to an owned generic customer_upload record.
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
      and ar.origin = 'customer_upload'
      and (
        (v_site_id is null and ar.site_id is null)
        or ar.site_id = v_site_id
      )
  ) then
    raise exception 'general attestation requires an owned customer upload in the same scope'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists asset_general_attestation_assets_guard_authority
  on public.asset_general_attestation_assets;
create trigger asset_general_attestation_assets_guard_authority
before insert or update on public.asset_general_attestation_assets
for each row execute function public.guard_general_attestation_asset_authority();

-- Person consent is per generic asset. It can never be attached to an import,
-- AI generation, legacy URL, or another tenant's upload.
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
      and ar.origin = 'customer_upload'
  ) then
    raise exception 'person consent requires an owned customer upload'
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

drop trigger if exists asset_person_consents_guard_authority
  on public.asset_person_consents;
create trigger asset_person_consents_guard_authority
before insert or update on public.asset_person_consents
for each row execute function public.guard_person_asset_consent_authority();

alter table public.asset_general_attestations enable row level security;
alter table public.asset_general_attestation_assets enable row level security;
alter table public.asset_person_consents enable row level security;

create policy asset_general_attestations_select_own
  on public.asset_general_attestations for select to authenticated
  using (client_id = auth.uid());
create policy asset_general_attestation_assets_select_own
  on public.asset_general_attestation_assets for select to authenticated
  using (exists (
    select 1 from public.asset_general_attestations a
    where a.id = asset_general_attestation_assets.attestation_id
      and a.client_id = auth.uid()
  ));
create policy asset_person_consents_select_own
  on public.asset_person_consents for select to authenticated
  using (client_id = auth.uid());

revoke all on table public.asset_general_attestations from public, anon, authenticated;
revoke all on table public.asset_general_attestation_assets from public, anon, authenticated;
revoke all on table public.asset_person_consents from public, anon, authenticated;
revoke all on table public.asset_general_attestations from service_role;
revoke all on table public.asset_general_attestation_assets from service_role;
revoke all on table public.asset_person_consents from service_role;
grant select on table public.asset_general_attestations to authenticated;
grant select on table public.asset_general_attestation_assets to authenticated;
grant select on table public.asset_person_consents to authenticated;
-- General attestation creation is RPC-only so a service-role call site cannot
-- bypass the exact person/non-person partition or membership validation. The
-- service role keeps UPDATE solely for one-time binding and revocation.
grant select, update on table public.asset_general_attestations to service_role;
grant select on table public.asset_general_attestation_assets to service_role;
grant select, insert, update on table public.asset_person_consents to service_role;

revoke execute on function public.guard_general_asset_attestation_authority()
  from public, anon, authenticated;
revoke execute on function public.guard_general_attestation_asset_authority()
  from public, anon, authenticated;
revoke execute on function public.guard_person_asset_consent_authority()
  from public, anon, authenticated;

-- Atomic general statement creation and asset-set stamping. A retry returns the
-- prior row only when owner, scope, version, and the complete asset set match.
drop function if exists public.create_general_asset_attestation(
  uuid, uuid, text, uuid[], uuid
);
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

  -- Serialize identical owner/key attempts before the read. Without this,
  -- two concurrent retries can both observe no row and the loser receives a
  -- unique violation instead of the already-created id.
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
    and ar.origin = 'customer_upload'
    and (
      (p_site_id is null and ar.site_id is null)
      or ar.site_id = p_site_id
    );
  if v_valid <> v_expected then
    raise exception 'general attestation assets must be owned customer uploads in one scope'
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

revoke all on function public.create_general_asset_attestation(
  uuid, uuid, text, uuid[], uuid[], uuid[], uuid
)
  from public, anon, authenticated;
grant execute on function public.create_general_asset_attestation(
  uuid, uuid, text, uuid[], uuid[], uuid[], uuid
)
  to service_role;

-- Compatibility-preserving v2 creation path. 0010's five-argument RPC remains
-- installed and unchanged; callers opt into this six-argument contract only
-- when a current provisional general attestation is available.
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
  v_customer_upload_count integer;
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
    and ar.origin = 'customer_upload'
    and ar.site_id is null;
  select count(*) into v_customer_upload_count
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.origin = 'customer_upload'
    and ar.site_id is null;
  if v_attested_asset_count = 0
     or v_attested_asset_count <> (
       select count(*) from public.asset_general_attestation_assets aa
       where aa.attestation_id = p_general_attestation_id
     )
     or v_attested_asset_count <> v_customer_upload_count
     or v_attestation.person_asset_ids && v_attestation.non_person_asset_ids
     or not (v_attestation.person_asset_ids <@ p_asset_ids)
     or not (v_attestation.non_person_asset_ids <@ p_asset_ids)
     or cardinality(v_attestation.person_asset_ids)
        + cardinality(v_attestation.non_person_asset_ids) <> v_attested_asset_count
  then
    raise exception 'attestation asset set must exactly cover the site customer uploads'
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

revoke all on function public.create_site_with_asset_bindings_and_attestation(
  uuid, text, jsonb, smallint, uuid[], uuid
) from public, anon, authenticated;
grant execute on function public.create_site_with_asset_bindings_and_attestation(
  uuid, text, jsonb, smallint, uuid[], uuid
) to service_role;
