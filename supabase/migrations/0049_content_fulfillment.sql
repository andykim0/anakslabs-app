-- Content posts are separate contract records. They never become a site section
-- and only the immutable version selected by the published pointer is public.

alter table public.asset_records
  drop constraint if exists asset_records_origin_check;

alter table public.asset_records
  add constraint asset_records_origin_check
  check (origin in (
    'customer_upload',
    'customer_import',
    'ai_generated',
    'system_generated',
    'licensed_stock',
    'legacy_unknown'
  ));

create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  site_id uuid not null references public.sites (id) on delete restrict,
  pricing_model_version text not null check (length(btrim(pricing_model_version)) > 0),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  ordinal smallint not null check (ordinal between 1 and 31),
  slug text not null check (
    length(slug) between 1 and 120
    and slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  status text not null default 'draft' check (status in (
    'draft',
    'generating',
    'generated',
    'pending_approval',
    'approved',
    'published',
    'rejected'
  )),
  current_version_id uuid,
  published_version_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_posts_schedule_identity unique (
    site_id, pricing_model_version, period_month, ordinal
  ),
  constraint content_posts_slug_identity unique (site_id, slug),
  constraint content_posts_publish_shape check (
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
    )
  )
);

create table public.content_post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.content_posts (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title text not null check (length(btrim(title)) between 1 and 240),
  summary text not null check (length(btrim(summary)) between 1 and 600),
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
  document jsonb not null check (
    jsonb_typeof(document) = 'object'
    and document ->> 'version' = '1'
    and jsonb_typeof(document -> 'blocks') = 'array'
    and jsonb_array_length(document -> 'blocks') between 1 and 100
  ),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  source_snapshot_sha256 text not null check (source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  policy_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(policy_versions) = 'object'),
  validation_evidence jsonb not null default '{}'::jsonb check (
    jsonb_typeof(validation_evidence) = 'object'
  ),
  generation_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(generation_metadata) = 'object'
  ),
  cover_asset_id uuid references public.asset_records (id) on delete restrict,
  created_by_type text not null check (created_by_type in ('system', 'admin')),
  created_by_id text not null check (length(btrim(created_by_id)) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint content_post_versions_number unique (post_id, version_number)
);

alter table public.content_posts
  add constraint content_posts_current_version_fk
  foreign key (current_version_id)
  references public.content_post_versions (id)
  on delete restrict,
  add constraint content_posts_published_version_fk
  foreign key (published_version_id)
  references public.content_post_versions (id)
  on delete restrict;

create table public.content_post_events (
  id uuid primary key default gen_random_uuid(),
  content_post_id uuid not null references public.content_posts (id) on delete restrict,
  content_post_version_id uuid references public.content_post_versions (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  site_id uuid not null references public.sites (id) on delete restrict,
  event_type text not null check (event_type in (
    'slot_created',
    'generation_claimed',
    'generation_failed',
    'version_generated',
    'approval_requested',
    'rejected',
    'regeneration_requested',
    'approved',
    'published'
  )),
  from_status text check (
    from_status is null or from_status in (
      'draft',
      'generating',
      'generated',
      'pending_approval',
      'approved',
      'published',
      'rejected'
    )
  ),
  to_status text not null check (to_status in (
    'draft',
    'generating',
    'generated',
    'pending_approval',
    'approved',
    'published',
    'rejected'
  )),
  actor_type text not null check (actor_type in ('system', 'admin')),
  actor_id text not null check (length(btrim(actor_id)) between 1 and 200),
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index content_posts_site_published_idx
  on public.content_posts (site_id, published_at desc, slug)
  where status = 'published';

create index content_posts_admin_queue_idx
  on public.content_posts (status, updated_at asc, site_id);

create index content_post_events_post_created_idx
  on public.content_post_events (content_post_id, created_at asc);

comment on table public.content_posts is
  'Content fulfillment identity and public pointer. Public surfaces require status published and an exact immutable version pointer.';
comment on table public.content_post_versions is
  'Immutable generated versions with source snapshot, source references, policy evidence, and generation audit.';
comment on table public.content_post_events is
  'Append-only actor and status transition audit for content fulfillment.';
comment on column public.content_post_versions.source_snapshot_sha256 is
  'Hash of the server-read customer source snapshot used for this immutable version.';
comment on column public.content_post_versions.validation_evidence is
  'Audit evidence only. Every approval and public boundary must run the current validators again.';

create or replace function public.guard_content_post_immutable_rows()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'content version and event rows are append-only'
    using errcode = '42501';
end;
$$;

create trigger content_post_versions_append_only
before update or delete on public.content_post_versions
for each row execute function public.guard_content_post_immutable_rows();

create trigger content_post_events_append_only
before update or delete on public.content_post_events
for each row execute function public.guard_content_post_immutable_rows();

create or replace function public.guard_content_post_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.sites s
    where s.id = new.site_id
      and s.client_id = new.client_id
  ) then
    raise exception 'content post site must belong to client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger content_posts_owner_guard
before insert or update on public.content_posts
for each row execute function public.guard_content_post_owner();

create trigger content_post_events_owner_guard
before insert on public.content_post_events
for each row execute function public.guard_content_post_owner();

create or replace function public.claim_content_post_generation(
  p_content_post_id uuid,
  p_actor_id text,
  p_regeneration boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post public.content_posts%rowtype;
  v_previous_status text;
begin
  if nullif(btrim(p_actor_id), '') is null then
    raise exception 'content generation actor is required'
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

  v_previous_status := v_post.status;
  if p_regeneration then
    if v_previous_status <> 'rejected' then
      raise exception 'content post regeneration state conflict'
        using errcode = '40001';
    end if;
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
      'regeneration_requested',
      'rejected',
      'rejected',
      'admin',
      btrim(p_actor_id)
    );
  else
    if v_previous_status <> 'draft' then
      raise exception 'content post generation state conflict'
        using errcode = '40001';
    end if;
  end if;

  update public.content_posts
  set status = 'generating',
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
    v_post.current_version_id,
    v_post.client_id,
    v_post.site_id,
    'generation_claimed',
    v_previous_status,
    'generating',
    'admin',
    btrim(p_actor_id)
  );

  return jsonb_build_object(
    'post', to_jsonb(v_post),
    'previousStatus', v_previous_status
  );
end;
$$;

create or replace function public.fail_content_post_generation(
  p_content_post_id uuid,
  p_actor_id text,
  p_restore_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post public.content_posts%rowtype;
begin
  if p_restore_status not in ('draft', 'rejected') then
    raise exception 'content generation restore state is invalid'
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
    return jsonb_build_object('post', to_jsonb(v_post), 'duplicated', true);
  end if;

  update public.content_posts
  set status = p_restore_status,
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
    actor_id,
    reason
  ) values (
    v_post.id,
    v_post.current_version_id,
    v_post.client_id,
    v_post.site_id,
    'generation_failed',
    'generating',
    p_restore_status,
    'admin',
    btrim(p_actor_id),
    left(nullif(btrim(p_reason), ''), 2000)
  );

  return jsonb_build_object('post', to_jsonb(v_post), 'duplicated', false);
end;
$$;

create or replace function public.store_content_post_generated(
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
     or p_policy_versions ->> 'medical' <> 'medical-ad-2026-07-v1'
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

create or replace function public.reject_content_post_version(
  p_content_post_id uuid,
  p_expected_version_id uuid,
  p_actor_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post public.content_posts%rowtype;
begin
  if nullif(btrim(p_actor_id), '') is null
     or nullif(btrim(p_reason), '') is null then
    raise exception 'content rejection actor and reason are required'
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
  if v_post.status = 'rejected'
     and v_post.current_version_id = p_expected_version_id then
    return jsonb_build_object('post', to_jsonb(v_post), 'duplicated', true);
  end if;
  if v_post.status <> 'pending_approval'
     or v_post.current_version_id is distinct from p_expected_version_id then
    raise exception 'content post rejection state conflict'
      using errcode = '40001';
  end if;

  update public.content_posts
  set status = 'rejected',
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
    actor_id,
    reason
  ) values (
    v_post.id,
    p_expected_version_id,
    v_post.client_id,
    v_post.site_id,
    'rejected',
    'pending_approval',
    'rejected',
    'admin',
    btrim(p_actor_id),
    left(btrim(p_reason), 2000)
  );

  return jsonb_build_object('post', to_jsonb(v_post), 'duplicated', false);
end;
$$;

create or replace function public.approve_and_publish_content_post(
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
begin
  if nullif(btrim(p_actor_id), '') is null then
    raise exception 'content approval actor is required'
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
  if v_post.status = 'published'
     and v_post.current_version_id = p_expected_version_id
     and v_post.published_version_id = p_expected_version_id then
    select * into v_site from public.sites where id = v_post.site_id;
    return jsonb_build_object(
      'post', to_jsonb(v_post),
      'site', to_jsonb(v_site),
      'duplicated', true
    );
  end if;
  if v_post.status <> 'pending_approval'
     or v_post.current_version_id is distinct from p_expected_version_id then
    raise exception 'content post approval state conflict'
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
    'approved',
    'pending_approval',
    'approved',
    'admin',
    btrim(p_actor_id)
  );

  update public.content_posts
  set status = 'published',
      published_version_id = v_version.id,
      published_at = now(),
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
    'published',
    'approved',
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

alter table public.content_posts enable row level security;
alter table public.content_post_versions enable row level security;
alter table public.content_post_events enable row level security;

revoke all on table public.content_posts
  from public, anon, authenticated, service_role;
revoke all on table public.content_post_versions
  from public, anon, authenticated, service_role;
revoke all on table public.content_post_events
  from public, anon, authenticated, service_role;

grant select on table public.content_posts to service_role;
grant select on table public.content_post_versions to service_role;
grant select on table public.content_post_events to service_role;

revoke execute on function public.claim_content_post_generation(uuid, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.fail_content_post_generation(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.store_content_post_generated(
  uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke execute on function public.reject_content_post_version(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.approve_and_publish_content_post(
  uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.claim_content_post_generation(uuid, text, boolean)
  to service_role;
grant execute on function public.fail_content_post_generation(uuid, text, text, text)
  to service_role;
grant execute on function public.store_content_post_generated(
  uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.reject_content_post_version(uuid, uuid, text, text)
  to service_role;
grant execute on function public.approve_and_publish_content_post(
  uuid, uuid, text, text, text, text, text
) to service_role;

revoke execute on function public.guard_content_post_immutable_rows()
  from public, anon, authenticated, service_role;
revoke execute on function public.guard_content_post_owner()
  from public, anon, authenticated, service_role;
