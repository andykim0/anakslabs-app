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

revoke execute on function public.guard_content_post_immutable_rows()
  from public, anon, authenticated, service_role;
revoke execute on function public.guard_content_post_owner()
  from public, anon, authenticated, service_role;
