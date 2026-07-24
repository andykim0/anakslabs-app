-- CRAWL: manually designated pilot crawl artifacts and expiring read-only previews.
-- The crawler stores bounded projections only. Raw HTML, image bytes, cookies,
-- request IP, user-agent, and recipient identity are not persisted.

create table public.crawl_artifacts (
  id            uuid primary key default gen_random_uuid(),
  seed_url      text not null,
  final_origin  text not null,
  artifact      jsonb not null,
  decay_result  jsonb,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  constraint crawl_artifacts_expiry_check check (expires_at > created_at),
  constraint crawl_artifacts_shape_check check (
    jsonb_typeof(artifact) = 'object'
    and (artifact ->> 'schemaVersion')::integer = 1
    and artifact ?& array[
      'schemaVersion', 'seedUrl', 'finalOrigin', 'observedAt',
      'tls', 'robots', 'pages', 'skippedUrls'
    ]
  )
);

create index crawl_artifacts_expiry_idx
  on public.crawl_artifacts (expires_at);

comment on table public.crawl_artifacts is
  'Thirty-day admin-only bounded projections for manually designated pilot URLs.';

create table public.shared_site_previews (
  id                 uuid primary key default gen_random_uuid(),
  crawl_artifact_id  uuid not null references public.crawl_artifacts (id) on delete cascade,
  token_hash         text not null unique,
  source_url         text not null,
  site_config        jsonb not null,
  notice_version     integer not null default 1,
  created_by         text not null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  revoked_at         timestamptz,
  constraint shared_site_previews_token_hash_check check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint shared_site_previews_expiry_check check (expires_at > created_at),
  constraint shared_site_previews_config_check check (
    jsonb_typeof(site_config) = 'object'
  )
);

create index shared_site_previews_expiry_idx
  on public.shared_site_previews (expires_at)
  where revoked_at is null;

comment on table public.shared_site_previews is
  'Fourteen-day bearer previews. Only a SHA-256 token hash is stored; recipient identity and opens are not logged.';

alter table public.crawl_artifacts enable row level security;
alter table public.shared_site_previews enable row level security;

revoke all on table public.crawl_artifacts
  from public, anon, authenticated, service_role;
revoke all on table public.shared_site_previews
  from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.crawl_artifacts
  to service_role;
grant select, insert, update, delete on table public.shared_site_previews
  to service_role;
