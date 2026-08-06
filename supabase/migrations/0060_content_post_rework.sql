-- `published` was a terminal state. 0049 defines five transitions and none of them leaves
-- `published`, so a slot filled by a safe-catalog fallback under an operator override stayed that
-- way forever: the month could never reach N/N delivered, and the only way to replace the text was
-- to publish the same hardcoded article on another slot.
--
-- Rework does not move the status. The row stays published and keeps serving its current version
-- for the whole cycle; a replacement is staged on a third pointer and swapped in atomically. The
-- public boundary is untouched by design — `projectPublishedContentPost` reads only
-- `published_version_id` and `current_version_id`, so a staged rework is invisible to every public
-- and customer surface until the instant both pointers move together.

alter table public.content_posts
  add column pending_version_id uuid;

alter table public.content_posts
  add constraint content_posts_pending_version_fk
  foreign key (pending_version_id)
  references public.content_post_versions (id)
  on delete restrict;

comment on column public.content_posts.pending_version_id is
  'Staged rework version for an already-published post. Never public: the serving pointers are published_version_id and current_version_id, and this one only exists between a rework claim and its atomic swap.';

-- The published equality from 0049 is kept exactly as it was. The only addition is that a row
-- which is not published cannot carry a staged rework — there is nothing to swap it into.
-- Every existing row has pending_version_id null, so this rewrite cannot fail on current data.
alter table public.content_posts
  drop constraint content_posts_publish_shape;

alter table public.content_posts
  add constraint content_posts_publish_shape check (
    (
      status = 'published'
      and current_version_id is not null
      and published_version_id = current_version_id
      and published_at is not null
    )
    or (
      status <> 'published'
      and published_version_id is null
      and published_at is null
      and pending_version_id is null
    )
  );

-- Two new audit verbs. Both record from_status = to_status = 'published': the ledger should say
-- what happened, and what happened is that a published row was reworked without ever leaving
-- 'published'. Writing a fake transition would be the dishonest alternative.
alter table public.content_post_events
  drop constraint content_post_events_event_type_check;

alter table public.content_post_events
  add constraint content_post_events_event_type_check
  check (event_type in (
    'slot_created',
    'generation_claimed',
    'generation_failed',
    'version_generated',
    'approval_requested',
    'rejected',
    'regeneration_requested',
    'approved',
    'published',
    'rework_claimed',
    'rework_published'
  ));

-- The admin queue reads published rows only when one carries a staged rework, so the partial
-- index answers exactly that predicate instead of scanning every delivered post.
create index content_posts_rework_pending_idx
  on public.content_posts (updated_at asc, site_id)
  where pending_version_id is not null;

create or replace function public.claim_content_post_rework(
  p_content_post_id uuid,
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post public.content_posts%rowtype;
begin
  if nullif(btrim(p_actor_id), '') is null then
    raise exception 'content rework actor is required'
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
  if v_post.status <> 'published' then
    raise exception 'content post rework state conflict'
      using errcode = '40001';
  end if;
  -- A rework already staged is not re-claimed; the operator replaces it by storing another
  -- version, which is what makes a refused swap recoverable. The row lock serializes two
  -- simultaneous claims, but neither moves the status, so both can succeed until the first
  -- version is stored — the later store then wins the pointer and the earlier version stays in
  -- the ledger unreferenced. That is deliberate: the alternative is inventing a lock state that
  -- the public surface would have to know about.
  if v_post.pending_version_id is not null then
    raise exception 'content post rework state conflict'
      using errcode = '40001';
  end if;

  -- The row itself is not touched, `updated_at` included: it is published as the article's
  -- dateModified, and at this moment nothing about the article has been modified.
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
    v_post.current_version_id,
    v_post.client_id,
    v_post.site_id,
    'rework_claimed',
    'published',
    'published',
    'admin',
    btrim(p_actor_id)
  );

  return jsonb_build_object('post', to_jsonb(v_post));
end;
$$;

-- Deliberately not store_content_post_generated: that one demands status 'generating' and leaves
-- the row in 'pending_approval', which would take a live post off the air on its way through.
create or replace function public.store_content_post_rework_version(
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
  p_generation_metadata jsonb
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
begin
  if nullif(btrim(p_actor_id), '') is null
     or nullif(btrim(p_title), '') is null
     or nullif(btrim(p_summary), '') is null then
    raise exception 'rework content fields are required'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_tags) <> 'array'
     or jsonb_typeof(p_document) <> 'object'
     or jsonb_typeof(p_source_snapshot) <> 'object'
     or jsonb_typeof(p_source_refs) <> 'array'
     or jsonb_typeof(p_policy_versions) <> 'object'
     or jsonb_typeof(p_validation_evidence) <> 'object'
     or jsonb_typeof(p_generation_metadata) <> 'object' then
    raise exception 'rework content JSON shape is invalid'
      using errcode = '22023';
  end if;
  if p_source_snapshot_sha256 !~ '^[a-f0-9]{64}$'
     or p_document ->> 'version' <> '1'
     or p_document::text ~ '<[[:alpha:]/]'
     or p_policy_versions ->> 'honesty' <> 'content-honesty-2026-07-v1'
     or p_policy_versions ->> 'medical' <> 'medical-ad-2026-07-v1'
     or p_validation_evidence #>> '{honesty,ok}' <> 'true'
     or p_validation_evidence #>> '{medical,ok}' <> 'true'
     or p_generation_metadata ->> 'pipelineVersion' <> 'content-post-generator-2026-07-v1'
     or p_generation_metadata ->> 'rawHtml' <> 'false' then
    raise exception 'rework content validation evidence is invalid'
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
  if v_post.status <> 'published' then
    raise exception 'content post rework state conflict'
      using errcode = '40001';
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
    'admin',
    btrim(p_actor_id)
  )
  returning * into v_version;

  -- Only the staging pointer moves. current_version_id and published_version_id keep serving the
  -- version the customer's site is showing right now, and `updated_at` stays where it is because
  -- the public projection publishes it as the article's dateModified — a staged draft has not
  -- modified the article. The swap is what earns a new timestamp.
  update public.content_posts
  set pending_version_id = v_version.id
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
    'version_generated',
    'published',
    'published',
    'admin',
    btrim(p_actor_id)
  );

  return jsonb_build_object(
    'post', to_jsonb(v_post),
    'version', to_jsonb(v_version)
  );
end;
$$;

create or replace function public.approve_and_swap_content_post(
  p_content_post_id uuid,
  p_expected_version_id uuid,
  p_actor_id text,
  p_source_snapshot_sha256 text,
  p_honesty_policy_version text,
  p_medical_policy_version text,
  p_validated_document_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post public.content_posts%rowtype;
  v_version public.content_post_versions%rowtype;
  v_site public.sites%rowtype;
  v_column jsonb;
  v_row jsonb;
  v_cell jsonb;
  v_tag jsonb;
  v_source_ref jsonb;
begin
  if nullif(btrim(p_actor_id), '') is null then
    raise exception 'content rework actor is required'
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
  -- A retried swap that already landed is not a conflict: both pointers are on the version the
  -- caller asked for and nothing is staged. Same shape as approve_and_publish_content_post.
  if v_post.status = 'published'
     and v_post.pending_version_id is null
     and v_post.published_version_id = p_expected_version_id
     and v_post.current_version_id = p_expected_version_id then
    select * into v_site from public.sites where id = v_post.site_id;
    return jsonb_build_object(
      'post', to_jsonb(v_post),
      'site', to_jsonb(v_site),
      'duplicated', true
    );
  end if;
  if v_post.status <> 'published'
     or v_post.pending_version_id is null
     or v_post.pending_version_id is distinct from p_expected_version_id then
    raise exception 'content post rework state conflict'
      using errcode = '40001';
  end if;

  select *
  into v_version
  from public.content_post_versions
  where id = p_expected_version_id
    and post_id = v_post.id
  for update;

  if v_version.id is null then
    raise exception 'content post version not found'
      using errcode = 'P0002';
  end if;

  -- Same evidence gate the first publication passed. A rework is a publication.
  if v_version.source_snapshot_sha256 <> p_source_snapshot_sha256
     or v_version.policy_versions ->> 'honesty' <> p_honesty_policy_version
     or v_version.policy_versions ->> 'medical' <> p_medical_policy_version
     or v_version.validation_evidence #>> '{honesty,ok}' <> 'true'
     or v_version.validation_evidence #>> '{medical,ok}' <> 'true'
     or v_version.validation_evidence ->> 'validatedDocumentSha256' <> p_validated_document_sha256
     or v_version.document::text ~ '<[[:alpha:]/]' then
    raise exception 'content post approval evidence conflict'
      using errcode = '40001';
  end if;

  for v_column in
    select columns.column_item
    from jsonb_array_elements(v_version.document -> 'blocks') as blocks(block_item)
    cross join lateral jsonb_array_elements(blocks.block_item -> 'columns') as columns(column_item)
    where blocks.block_item ->> 'type' = 'table'
  loop
    if nullif(btrim(v_column ->> 'sourceRef'), '') is null then
      raise exception 'content table header source reference missing'
        using errcode = '22023';
    end if;
  end loop;

  for v_row in
    select rows.row_item
    from jsonb_array_elements(v_version.document -> 'blocks') as blocks(block_item)
    cross join lateral jsonb_array_elements(blocks.block_item -> 'rows') as rows(row_item)
    where blocks.block_item ->> 'type' = 'table'
  loop
    for v_cell in
      select cells.cell_item
      from jsonb_array_elements(v_row -> 'cells') as cells(cell_item)
    loop
      if nullif(btrim(v_cell ->> 'sourceRef'), '') is null then
        raise exception 'content table cell source reference missing'
          using errcode = '22023';
      end if;
    end loop;
  end loop;

  -- Swapping in the generator's own fallback copy would republish the same hardcoded article the
  -- rework exists to get rid of, and it would not count toward the month either. Refused on its
  -- own terms rather than silently allowed: the operator stores another version and swaps that.
  if v_version.generation_metadata ->> 'attempt' = 'safe-catalog' then
    raise exception 'content rework safe-catalog swap refused'
      using errcode = '42501';
  end if;

  -- The public projection is stricter than these columns are. Anything it would reject has to be
  -- rejected here instead, because after the swap the pointers are already moved and the customer
  -- is looking at a 404 on a URL that was serving a moment ago. Mirrors
  -- projectPublishedContentPost (lib/content-fulfillment/contracts.ts) for everything SQL can
  -- state: the tag list it parses, and the integrity block the pipeline-version gate demands.
  --
  -- What it deliberately does NOT check is the inside of `document`. The column constraint only
  -- says the blocks array exists and is 1..100 long; whether every block satisfies
  -- `contentPostDocumentSchema` — block types, source references on table cells, row/column
  -- arity — is guaranteed by exactly one thing: the application generator that produced the
  -- version (generateVersionForItem → validateContentPostForPending). A document that never went
  -- through it can be stored here and will swap in, and the tenant page will then drop the post
  -- whole on the next read. So: do not add an operations script, backfill, or import path that
  -- calls store_content_post_rework_version (or store_content_post_generated) directly with
  -- service_role and a hand-built document. If one is ever needed, the document schema has to
  -- move into the database first, or that path has to run the same validator before it writes.
  if jsonb_typeof(v_version.tags) <> 'array'
     or jsonb_array_length(v_version.tags) > 12 then
    raise exception 'content rework public projection precheck failed'
      using errcode = '22023';
  end if;
  for v_tag in select jsonb_array_elements(v_version.tags)
  loop
    if jsonb_typeof(v_tag) <> 'string'
       or length(btrim(v_tag #>> '{}')) < 1
       or length(btrim(v_tag #>> '{}')) > 60 then
      raise exception 'content rework public projection precheck failed'
        using errcode = '22023';
    end if;
  end loop;

  if v_version.generation_metadata ->> 'pipelineVersion' = 'content-post-generator-2026-07-v1' then
    if jsonb_typeof(v_version.source_snapshot) <> 'object'
       or v_version.source_snapshot ->> 'version' <> '1'
       or v_version.source_snapshot ->> 'siteId' !~ '^[0-9a-fA-F-]{36}$'
       or v_version.source_snapshot ->> 'clientId' !~ '^[0-9a-fA-F-]{36}$'
       or v_version.source_snapshot ->> 'capturedAt' is null
       or jsonb_typeof(v_version.source_snapshot -> 'sources') <> 'array'
       or jsonb_array_length(v_version.source_snapshot -> 'sources') > 300
       or jsonb_typeof(v_version.source_refs) <> 'array'
       or jsonb_array_length(v_version.source_refs) > 300 then
      raise exception 'content rework public projection precheck failed'
        using errcode = '22023';
    end if;
    for v_source_ref in select jsonb_array_elements(v_version.source_refs)
    loop
      if jsonb_typeof(v_source_ref) <> 'string'
         or v_source_ref #>> '{}' !~ '^[A-Za-z0-9][A-Za-z0-9:._-]*$' then
        raise exception 'content rework public projection precheck failed'
          using errcode = '22023';
      end if;
    end loop;
  end if;

  -- Both serving pointers move in the same statement. There is no instant in which the row points
  -- at a version the public projection would reject, and none in which it points at nothing:
  -- readers outside this transaction see the old version, then the new one.
  update public.content_posts
  set current_version_id = v_version.id,
      published_version_id = v_version.id,
      -- The date beside the article has to describe the article that is being served.
      published_at = now(),
      pending_version_id = null,
      updated_at = now()
  where id = v_post.id
  returning * into v_post;

  update public.sites
  set export_status = 'none',
      export_requested_at = null,
      export_url = null
  where id = v_post.site_id
  returning * into v_site;

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
    'rework_published',
    'published',
    'published',
    'admin',
    btrim(p_actor_id)
  );

  return jsonb_build_object(
    'post', to_jsonb(v_post),
    'site', to_jsonb(v_site),
    'duplicated', false
  );
end;
$$;

comment on function public.claim_content_post_rework(uuid, text) is
  'Opens a rework on a published post. Records intent only — the status and both serving pointers are untouched.';
comment on function public.store_content_post_rework_version(
  uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb
) is
  'Stages a replacement version on pending_version_id. The live post keeps serving its current version.';
comment on function public.approve_and_swap_content_post(uuid, uuid, text, text, text, text, text) is
  'Atomically swaps a staged rework into both serving pointers. Refuses safe-catalog fallbacks and anything the public projection would reject.';

revoke execute on function public.claim_content_post_rework(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.store_content_post_rework_version(
  uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke execute on function public.approve_and_swap_content_post(
  uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.claim_content_post_rework(uuid, text)
  to service_role;
grant execute on function public.store_content_post_rework_version(
  uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.approve_and_swap_content_post(
  uuid, uuid, text, text, text, text, text
) to service_role;
