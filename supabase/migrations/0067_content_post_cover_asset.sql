-- Let a generated article version store the cover image 0049 already made room for.
--
-- `content_post_versions.cover_asset_id` has existed since 0049 and was never written: the only
-- writer of that table is `store_content_post_generated`, whose parameter list did not carry the
-- column, and `content_post_versions_append_only` (0049:179) blocks any follow-up UPDATE. So the
-- column could not be filled by any code path at all. This adds the parameter.
--
-- Deployment ordering. `CONTENT_COVER_IMAGES_ENABLED` is off by default and the client only sends
-- `p_cover_asset_id` when a cover was actually generated, so a database that has not taken this
-- migration keeps working unchanged — the call is byte-identical to the pre-cover one. Enabling
-- the flag before applying this migration fails loudly on the RPC rather than silently discarding
-- an image the run has already paid for.
--
-- The old signature is dropped rather than replaced: PostgreSQL treats a different parameter count
-- as a new overload, and a defaulted 13th parameter alongside the 12-parameter function would make
-- every existing 12-argument call ambiguous.

drop function if exists public.store_content_post_generated(
  uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb
);

create function public.store_content_post_generated(
  p_content_post_id uuid,
  p_actor_id text,
  p_title text,
  p_summary text,
  p_tags jsonb,
  p_document jsonb,
  p_source_snapshot jsonb,
  p_source_snapshot_sha256 text,
  p_source_refs jsonb,
  p_policy_versions jsonb,
  p_validation_evidence jsonb,
  p_generation_metadata jsonb,
  p_cover_asset_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post public.content_posts%rowtype;
  v_version public.content_post_versions%rowtype;
  v_version_number integer;
  v_cover_owner uuid;
begin
  if nullif(btrim(p_actor_id), '') is null
     or nullif(btrim(p_title), '') is null
     or nullif(btrim(p_summary), '') is null then
    raise exception 'generated content fields are required'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_tags) <> 'array'
     or jsonb_typeof(p_document) <> 'object'
     or jsonb_typeof(p_source_snapshot) <> 'object'
     or jsonb_typeof(p_source_refs) <> 'array'
     or jsonb_typeof(p_policy_versions) <> 'object'
     or jsonb_typeof(p_validation_evidence) <> 'object'
     or jsonb_typeof(p_generation_metadata) <> 'object' then
    raise exception 'generated content JSON shape is invalid'
      using errcode = '22023';
  end if;
  if p_source_snapshot_sha256 !~ '^[a-f0-9]{64}$'
     or p_document ->> 'version' <> '1'
     or p_document::text ~ '<[[:alpha:]/]'
     or p_policy_versions ->> 'honesty' <> 'content-honesty-2026-07-v1'
     or p_policy_versions ->> 'medical' <> 'us-medical-ad-2026-08-v1'
     or p_validation_evidence #>> '{honesty,ok}' <> 'true'
     or p_validation_evidence #>> '{medical,ok}' <> 'true'
     or p_generation_metadata ->> 'pipelineVersion' <> 'content-post-generator-2026-07-v1'
     or p_generation_metadata ->> 'rawHtml' <> 'false' then
    raise exception 'generated content validation evidence is invalid'
      using errcode = '22023';
  end if;

  select *
  into v_post
  from public.content_posts
  where id = p_content_post_id
  for update;

  if v_post.id is null then
    raise exception 'content post not found'
      using errcode = 'P0002';
  end if;
  if v_post.status <> 'generating' then
    raise exception 'content post generation state conflict'
      using errcode = '40001';
  end if;

  -- A cover is only ever this client's own AI-generated asset. The foreign key alone would accept
  -- another tenant's image, and a picture is a public surface on the customer's own domain, so
  -- ownership and origin are checked here rather than trusted from the caller.
  if p_cover_asset_id is not null then
    select client_id
    into v_cover_owner
    from public.asset_records
    where id = p_cover_asset_id
      and origin = 'ai_generated'
      and media_type = 'image';

    if v_cover_owner is null or v_cover_owner <> v_post.client_id then
      raise exception 'content post cover asset is not an owned generated image'
        using errcode = '22023';
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_version_number
  from public.content_post_versions
  where post_id = v_post.id;

  insert into public.content_post_versions (
    post_id,
    version_number,
    title,
    summary,
    tags,
    document,
    source_snapshot,
    source_snapshot_sha256,
    source_refs,
    policy_versions,
    validation_evidence,
    generation_metadata,
    cover_asset_id,
    created_by_type,
    created_by_id
  ) values (
    v_post.id,
    v_version_number,
    btrim(p_title),
    btrim(p_summary),
    p_tags,
    p_document,
    p_source_snapshot,
    p_source_snapshot_sha256,
    p_source_refs,
    p_policy_versions,
    p_validation_evidence,
    p_generation_metadata,
    p_cover_asset_id,
    'admin',
    btrim(p_actor_id)
  )
  returning * into v_version;

  insert into public.content_post_events (
    content_post_id,
    content_post_version_id,
    client_id,
    site_id,
    event_type,
    from_status,
    to_status,
    actor_type,
    actor_id
  ) values (
    v_post.id,
    v_version.id,
    v_post.client_id,
    v_post.site_id,
    'version_generated',
    'generating',
    'generated',
    'admin',
    btrim(p_actor_id)
  );

  update public.content_posts
  set status = 'pending_approval',
      current_version_id = v_version.id,
      updated_at = now()
  where id = v_post.id
  returning * into v_post;

  insert into public.content_post_events (
    content_post_id,
    content_post_version_id,
    client_id,
    site_id,
    event_type,
    from_status,
    to_status,
    actor_type,
    actor_id
  ) values (
    v_post.id,
    v_version.id,
    v_post.client_id,
    v_post.site_id,
    'approval_requested',
    'generated',
    'pending_approval',
    'admin',
    btrim(p_actor_id)
  );

  return jsonb_build_object(
    'post', to_jsonb(v_post),
    'version', to_jsonb(v_version)
  );
end;
$$;

revoke execute on function public.store_content_post_generated(
  uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb, uuid
) from public, anon, authenticated;

grant execute on function public.store_content_post_generated(
  uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb, uuid
) to service_role;

comment on column public.content_post_versions.cover_asset_id is
  'Optional generated hero image for this version. Written only by store_content_post_generated, '
  'gated by CONTENT_COVER_IMAGES_ENABLED, and always an ai_generated asset owned by the same client.';
