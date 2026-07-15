-- ============================================================================
-- 0010_asset_provenance_registry.sql — generic server-owned asset identity
--
-- URL is a display projection. (storage_bucket, storage_key) is authoritative
-- identity. Origin is stamped by service-role code and is immutable. The
-- specialized 0009 before/after evidence ledger remains unchanged and trusted.
-- ============================================================================

-- Nullable means legacy cohort. Only server-side site creation/marking may set 2.
alter table public.sites
  add column if not exists asset_policy_version smallint
  check (asset_policy_version is null or asset_policy_version = 2);

comment on column public.sites.asset_policy_version is
  'Server-owned asset provenance policy cohort. null=legacy, 2=provenance v2.';

create table if not exists public.asset_records (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  site_id         uuid references public.sites (id) on delete cascade,
  origin          text not null check (origin in (
                    'customer_upload', 'customer_import', 'ai_generated', 'legacy_unknown'
                  )),
  media_type      text not null check (media_type in ('image', 'video')),
  storage_bucket  text,
  storage_key     text,
  canonical_url   text not null check (length(btrim(canonical_url)) > 0),
  created_at      timestamptz not null default now(),
  constraint asset_records_storage_pair check (
    (storage_bucket is null and storage_key is null)
    or (
      storage_bucket is not null and length(btrim(storage_bucket)) > 0
      and storage_key is not null and length(btrim(storage_key)) > 0
    )
  ),
  constraint asset_records_known_origin_has_storage check (
    origin = 'legacy_unknown'
    or (storage_bucket is not null and storage_key is not null)
  )
);

comment on table public.asset_records is
  'Generic immutable asset provenance. service role writes; owners can read their rows.';
comment on column public.asset_records.canonical_url is
  'Non-authoritative display projection. Never proves ownership or provenance.';

-- Retried uploads/generations converge on one registry row by storage identity.
create unique index if not exists asset_records_storage_identity_uidx
  on public.asset_records (storage_bucket, storage_key)
  where storage_bucket is not null and storage_key is not null;
create index if not exists asset_records_client_created_idx
  on public.asset_records (client_id, created_at desc);
create index if not exists asset_records_site_created_idx
  on public.asset_records (site_id, created_at desc)
  where site_id is not null;

-- Even service-role bugs cannot mutate origin/identity or rebind a site.
create or replace function public.guard_asset_record_authority()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id             is distinct from old.id
    or new.client_id      is distinct from old.client_id
    or new.origin         is distinct from old.origin
    or new.media_type     is distinct from old.media_type
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_key    is distinct from old.storage_key
    or new.canonical_url  is distinct from old.canonical_url
    or new.created_at     is distinct from old.created_at
    then
      raise exception 'asset record authority fields are immutable'
        using errcode = '23514';
    end if;

    if old.site_id is not null and new.site_id is distinct from old.site_id then
      raise exception 'asset record site binding is immutable once set'
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

drop trigger if exists asset_records_guard_authority on public.asset_records;
create trigger asset_records_guard_authority
before insert or update on public.asset_records
for each row execute function public.guard_asset_record_authority();

-- Extend the latest sites protected-column guard additively. A non-null cohort
-- marker is also one-way so rollback only disables flags; it never rewrites data.
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

alter table public.asset_records enable row level security;

create policy asset_records_select_own on public.asset_records
  for select to authenticated
  using (client_id = auth.uid());

revoke all on table public.asset_records from public, anon, authenticated;
grant select on table public.asset_records to authenticated;
grant select, insert, update, delete on table public.asset_records to service_role;

revoke execute on function public.guard_asset_record_authority()
  from public, anon, authenticated;

-- First generation must never persist a SiteConfig containing provisional
-- asset refs and only bind them afterwards. This service-role RPC inserts the
-- draft site and binds every referenced registry row in one transaction.
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
  v_owned integer;
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
  if v_expected = 0 or exists (
    select 1 from unnest(p_asset_ids) as ids(asset_id) where asset_id is null
  ) then
    raise exception 'atomic asset binding requires at least one complete asset id'
      using errcode = '23514';
  end if;
  if (
    select count(distinct asset_id) from unnest(p_asset_ids) as ids(asset_id)
  ) <> v_expected then
    raise exception 'duplicate asset ids are not allowed' using errcode = '23514';
  end if;

  -- Lock the complete provisional set before the site exists. Another request
  -- cannot bind one of these rows between validation and UPDATE.
  perform 1
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
  for update;

  select count(*) into v_owned
  from public.asset_records ar
  where ar.id = any(p_asset_ids)
    and ar.client_id = p_client_id
    and ar.site_id is null;
  if v_owned <> v_expected then
    raise exception 'asset set is missing, foreign, or already site-bound'
      using errcode = '42501';
  end if;

  select count(*) into v_manifest_count
  from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item;
  select count(distinct (item ->> 'assetId')) into v_manifest_distinct
  from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item;
  if v_manifest_count <> v_expected or v_manifest_distinct <> v_expected or exists (
    select 1
    from jsonb_array_elements(coalesce(p_draft_config -> 'assetRefs', '[]'::jsonb)) item
    left join public.asset_records ar
      on ar.id = (item ->> 'assetId')::uuid
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

  return query select s.* from public.sites s where s.id = v_site_id;
end;
$$;

revoke all on function public.create_site_with_asset_bindings(uuid, text, jsonb, smallint, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_site_with_asset_bindings(uuid, text, jsonb, smallint, uuid[])
  to service_role;
