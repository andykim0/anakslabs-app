-- ============================================================================
-- 0016_admin_video_fulfillments.sql — service-only hero video fulfillment log
--
-- A completion is both a provenance-sensitive asset assignment and a config
-- write. The RPC below holds the site row lock, verifies optimistic config
-- equality and asset authority, writes draft/live configs, then records the
-- immutable completion in one transaction.
-- ============================================================================

create table public.hero_video_fulfillments (
  id                       uuid primary key default gen_random_uuid(),
  site_id                  uuid not null unique references public.sites (id) on delete cascade,
  client_id                uuid not null references public.clients (id) on delete cascade,
  video_asset_id           uuid not null unique references public.asset_records (id) on delete restrict,
  canonical_video_url      text not null check (
                              length(btrim(canonical_video_url)) between 1 and 4096
                            ),
  poster_url               text not null check (
                              length(btrim(poster_url)) between 1 and 4096
                            ),
  requested_at             timestamptz not null,
  requested_at_source      text not null check (
                              requested_at_source in ('recorded', 'site-created-fallback')
                            ),
  completed_at             timestamptz not null default now()
);

comment on table public.hero_video_fulfillments is
  'Immutable service-only history for manually fulfilled AI hero-video add-ons.';
comment on column public.hero_video_fulfillments.canonical_video_url is
  'Projection copied from asset_records. Asset identity remains video_asset_id/storage identity.';

create index hero_video_fulfillments_completed_idx
  on public.hero_video_fulfillments (completed_at desc);
create index hero_video_fulfillments_client_idx
  on public.hero_video_fulfillments (client_id, completed_at desc);

alter table public.hero_video_fulfillments enable row level security;
revoke all on table public.hero_video_fulfillments from public, anon, authenticated, service_role;
grant select on table public.hero_video_fulfillments to service_role;

create or replace function public.complete_hero_video_fulfillment(
  p_site_id uuid,
  p_client_id uuid,
  p_video_asset_id uuid,
  p_canonical_video_url text,
  p_poster_url text,
  p_expected_draft_config jsonb,
  p_expected_site_config jsonb,
  p_next_draft_config jsonb,
  p_next_site_config jsonb,
  p_requested_at timestamptz,
  p_requested_at_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.sites%rowtype;
  v_asset public.asset_records%rowtype;
  v_existing public.hero_video_fulfillments%rowtype;
  v_created public.hero_video_fulfillments%rowtype;
  v_config jsonb;
  v_current_config jsonb;
  v_draft_hero_image text;
  v_site_hero_image text;
  v_has_hero boolean;
  v_has_ref boolean;
  v_requested boolean;
begin
  if p_site_id is null or p_client_id is null or p_video_asset_id is null
     or p_canonical_video_url is null or length(btrim(p_canonical_video_url)) = 0
     or p_poster_url is null or length(btrim(p_poster_url)) = 0
     or length(p_canonical_video_url) > 4096 or length(p_poster_url) > 4096
     or p_requested_at is null
     or p_requested_at_source not in ('recorded', 'site-created-fallback') then
    raise exception 'video fulfillment input is incomplete or invalid'
      using errcode = '23514';
  end if;
  if not (
    p_poster_url ~ '^https?://'
    or (left(p_poster_url, 1) = '/' and left(p_poster_url, 2) <> '//')
  ) then
    raise exception 'video fulfillment poster URL is unsafe'
      using errcode = '23514';
  end if;
  if not (
    p_canonical_video_url ~ '^https?://'
    or (left(p_canonical_video_url, 1) = '/' and left(p_canonical_video_url, 2) <> '//')
  ) then
    raise exception 'video fulfillment canonical URL is unsafe'
      using errcode = '23514';
  end if;
  if p_requested_at > now() + interval '5 minutes' then
    raise exception 'video fulfillment request timestamp is in the future'
      using errcode = '23514';
  end if;

  select * into v_site
  from public.sites
  where id = p_site_id
  for update;
  if not found or v_site.client_id <> p_client_id then
    raise exception 'video fulfillment site owner mismatch'
      using errcode = '42501';
  end if;
  if v_site.asset_policy_version is distinct from 2 then
    raise exception 'video fulfillment requires asset provenance v2'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.tier = 'premium'
  ) then
    raise exception 'video fulfillment requires an approved video add-on'
      using errcode = '42501';
  end if;

  select * into v_existing
  from public.hero_video_fulfillments
  where site_id = p_site_id;
  if found then
    if v_existing.client_id <> p_client_id
       or v_existing.video_asset_id <> p_video_asset_id
       or v_existing.canonical_video_url <> btrim(p_canonical_video_url)
       or v_existing.poster_url <> btrim(p_poster_url)
       or v_existing.requested_at <> p_requested_at
       or v_existing.requested_at_source <> p_requested_at_source then
      raise exception 'video fulfillment retry conflicts with completed history'
        using errcode = '23505';
    end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_asset
  from public.asset_records
  where id = p_video_asset_id
  for update;
  if not found
     or v_asset.client_id <> p_client_id
     or v_asset.site_id <> p_site_id
     or v_asset.origin <> 'ai_generated'
     or v_asset.media_type <> 'video'
     or v_asset.storage_bucket is null
     or v_asset.storage_key is null
     or v_asset.canonical_url <> btrim(p_canonical_video_url) then
    raise exception 'video fulfillment asset provenance mismatch'
      using errcode = '42501';
  end if;

  if p_requested_at_source = 'site-created-fallback'
     and p_requested_at <> v_site.created_at then
    raise exception 'site-created fallback timestamp does not match the site'
      using errcode = '23514';
  end if;
  if p_requested_at_source = 'recorded' and not exists (
    select 1 from public.video_gen_log vgl
    where vgl.site_id = p_site_id and vgl.created_at = p_requested_at
  ) then
    raise exception 'recorded request timestamp has no server log evidence'
      using errcode = '42501';
  end if;

  if v_site.draft_config is null and v_site.site_config is null then
    raise exception 'video fulfillment requires a persisted site config'
      using errcode = '23514';
  end if;

  -- Prefer a requested draft, but do not let a stale non-requesting draft hide
  -- an explicit request in the published snapshot.
  v_current_config := null;
  foreach v_config in array array[v_site.draft_config, v_site.site_config]
  loop
    if v_config is null then
      continue;
    end if;
    v_requested := case
      when (v_config -> 'motion') ? 'videoAddon'
        then v_config #>> '{motion,videoAddon}' = 'true'
      else v_config #>> '{motion,videoRequested}' = 'true'
    end;
    if coalesce(v_requested, false) then
      v_current_config := v_config;
      exit;
    end if;
  end loop;
  if v_current_config is null then
    raise exception 'video fulfillment was not explicitly requested'
      using errcode = '42501';
  end if;

  select section #>> '{background,image,src}'
  into v_draft_hero_image
  from jsonb_array_elements(coalesce(v_site.draft_config -> 'pages', '[]'::jsonb)) page,
       jsonb_array_elements(coalesce(page -> 'sections', '[]'::jsonb)) section
  where page ->> 'slug' = ''
    and section ->> 'type' = 'hero'
    and coalesce(section ->> 'hidden', 'false') = 'false'
  limit 1;
  select section #>> '{background,image,src}'
  into v_site_hero_image
  from jsonb_array_elements(coalesce(v_site.site_config -> 'pages', '[]'::jsonb)) page,
       jsonb_array_elements(coalesce(page -> 'sections', '[]'::jsonb)) section
  where page ->> 'slug' = ''
    and section ->> 'type' = 'hero'
    and coalesce(section ->> 'hidden', 'false') = 'false'
  limit 1;
  if v_site.draft_config is not null and v_site.site_config is not null
     and v_draft_hero_image is distinct from v_site_hero_image then
    raise exception 'draft and published hero poster sources differ'
      using errcode = '23514';
  end if;
  if coalesce(v_draft_hero_image, v_site_hero_image) is null
     or coalesce(v_draft_hero_image, v_site_hero_image) <> btrim(p_poster_url) then
    raise exception 'video fulfillment poster does not match the persisted hero source'
      using errcode = '23514';
  end if;

  -- Completion is redundant only when every config column that exists already
  -- contains a complete hero video. A partially applied pair remains repairable.
  if (v_site.draft_config is null or exists (
    select 1
    from jsonb_array_elements(coalesce(v_site.draft_config -> 'pages', '[]'::jsonb)) page,
         jsonb_array_elements(coalesce(page -> 'sections', '[]'::jsonb)) section
    where page ->> 'slug' = ''
      and section ->> 'type' = 'hero'
      and coalesce(section ->> 'hidden', 'false') = 'false'
      and nullif(section #>> '{background,video,src}', '') is not null
      and nullif(section #>> '{background,video,poster}', '') is not null
  )) and (v_site.site_config is null or exists (
    select 1
    from jsonb_array_elements(coalesce(v_site.site_config -> 'pages', '[]'::jsonb)) page,
         jsonb_array_elements(coalesce(page -> 'sections', '[]'::jsonb)) section
    where page ->> 'slug' = ''
      and section ->> 'type' = 'hero'
      and coalesce(section ->> 'hidden', 'false') = 'false'
      and nullif(section #>> '{background,video,src}', '') is not null
      and nullif(section #>> '{background,video,poster}', '') is not null
  )) then
    raise exception 'hero video is already applied'
      using errcode = '23505';
  end if;

  if v_site.draft_config is distinct from p_expected_draft_config
     or v_site.site_config is distinct from p_expected_site_config then
    raise exception 'video fulfillment config changed concurrently'
      using errcode = '40001';
  end if;
  if (p_expected_draft_config is null) <> (p_next_draft_config is null)
     or (p_expected_site_config is null) <> (p_next_site_config is null)
     or (p_next_draft_config is null and p_next_site_config is null) then
    raise exception 'video fulfillment cannot add, remove, or omit a config column'
      using errcode = '23514';
  end if;

  foreach v_config in array array[p_next_draft_config, p_next_site_config]
  loop
    if v_config is null then
      continue;
    end if;
    select exists (
      select 1
      from jsonb_array_elements(coalesce(v_config -> 'pages', '[]'::jsonb)) page,
           jsonb_array_elements(coalesce(page -> 'sections', '[]'::jsonb)) section
      where page ->> 'slug' = ''
        and section ->> 'type' = 'hero'
        and coalesce(section ->> 'hidden', 'false') = 'false'
        and section #>> '{background,video,src}' = btrim(p_canonical_video_url)
        and section #>> '{background,video,poster}' = btrim(p_poster_url)
    ) into v_has_hero;
    select exists (
      select 1
      from jsonb_array_elements(coalesce(v_config -> 'assetRefs', '[]'::jsonb)) ref
      where ref ->> 'assetId' = p_video_asset_id::text
        and ref ->> 'url' = btrim(p_canonical_video_url)
    ) into v_has_ref;
    if not v_has_hero or not v_has_ref
       or v_config #>> '{motion,videoAddon}' <> 'true' then
      raise exception 'next config does not contain the verified hero video assignment'
        using errcode = '23514';
    end if;
  end loop;

  update public.sites
  set draft_config = p_next_draft_config,
      site_config = p_next_site_config,
      export_status = 'none',
      export_url = null,
      export_requested_at = null
  where id = p_site_id and client_id = p_client_id;
  if not found then
    raise exception 'video fulfillment site changed concurrently'
      using errcode = '40001';
  end if;

  insert into public.hero_video_fulfillments (
    site_id, client_id, video_asset_id, canonical_video_url, poster_url,
    requested_at, requested_at_source
  ) values (
    p_site_id, p_client_id, p_video_asset_id, btrim(p_canonical_video_url), btrim(p_poster_url),
    p_requested_at, p_requested_at_source
  ) returning * into v_created;

  return to_jsonb(v_created);
end;
$$;

revoke execute on function public.complete_hero_video_fulfillment(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.complete_hero_video_fulfillment(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, timestamptz, text
) to service_role;
