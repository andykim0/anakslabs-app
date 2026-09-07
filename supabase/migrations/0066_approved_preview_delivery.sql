-- ============================================================================
-- 0066_approved_preview_delivery.sql — deliver the artefact the customer approved
--
-- Two facts this schema could not carry:
--
-- 1. AN APPROVED PREVIEW COULD NOT OUTLIVE ITS CRAWL ARTIFACT.
--    0046 made shared_site_previews.crawl_artifact_id `not null references
--    crawl_artifacts(id) on delete cascade`. Artifacts are kept 46 days and a US
--    outreach preview is stamped 45 (lib/crawl/contracts.ts), so on day 46 the
--    retention purge deletes the artifact and the approved preview row goes with
--    it — including the site_config the customer actually said yes to. Delivery
--    then has nothing left to ship but a second crawl, which produces a different
--    product (measured: 19 hash-slug pages against 12 curated ones on cameods).
--
--    The artifact is the raw material; the preview is the approved result and the
--    only thing delivery reads (lib/crawl/repository.ts getSharedSitePreviewById
--    selects from shared_site_previews alone). So the reference becomes nullable
--    and `on delete set null`: purging the artifact now erases the raw material
--    and keeps the approval. Nothing reads crawl_artifact_id at delivery time.
--
-- 2. A DELIVERED SITE DID NOT RECORD WHAT IT WAS DELIVERED FROM.
--    sites has no JSON/metadata column and SitesRepo.create() takes no provenance
--    fields, so after an operator shipped an approved preview there was no way to
--    tell that site apart from one compiled by a second crawl. Three nullable
--    columns carry it. They are written once, by the server, right after the site
--    row is created.
--
-- Deliberately NOT a foreign key: delivered_from_preview_id must survive the
-- preview's own 45-day expiry. A reference with `on delete set null` would erase
-- the provenance exactly when the audit trail starts to matter, and a cascade
-- would delete the customer's site. It is an id we recorded, not a live join.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. An approved preview survives its artifact.
-- ---------------------------------------------------------------------------

alter table public.shared_site_previews
  alter column crawl_artifact_id drop not null;

-- 0046 declared the reference inline, so its constraint carries whatever name Postgres chose.
-- Look it up rather than guess, and fail loudly if it is not there: silently skipping the drop
-- would leave the cascade in place and this migration would report success without doing its job.
do $$
declare
  v_constraint text;
begin
  select con.conname
    into v_constraint
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'shared_site_previews'
     and con.contype = 'f'
     and con.conkey = array[(
       select att.attnum
         from pg_attribute att
        where att.attrelid = rel.oid
          and att.attname = 'crawl_artifact_id'
     )]::smallint[];

  if v_constraint is null then
    raise exception
      'shared_site_previews.crawl_artifact_id has no foreign key to replace';
  end if;

  execute format(
    'alter table public.shared_site_previews drop constraint %I',
    v_constraint
  );
end
$$;

alter table public.shared_site_previews
  add constraint shared_site_previews_crawl_artifact_id_fkey
  foreign key (crawl_artifact_id)
  references public.crawl_artifacts (id)
  on delete set null;

comment on column public.shared_site_previews.crawl_artifact_id is
  'Raw material this preview was compiled from, or null once that artifact was purged. The approved site_config in this row is what delivery ships; it never re-reads the artifact.';

-- ---------------------------------------------------------------------------
-- 2. Delivery provenance on the site row.
-- ---------------------------------------------------------------------------

alter table public.sites
  add column delivered_from_preview_id uuid,
  add column delivered_at              timestamptz,
  add column approved_at               timestamptz;

comment on column public.sites.delivered_from_preview_id is
  'shared_site_previews.id this site was delivered from. Intentionally not a foreign key: the preview expires in 45 days and this record must outlive it.';
comment on column public.sites.delivered_at is
  'When the operator delivered the approved preview as this site.';
comment on column public.sites.approved_at is
  'When the customer approved that preview, as recorded by the operator. Null when the operator did not supply it.';

-- ---------------------------------------------------------------------------
-- 3. Extend the sites protected-column guard additively (0047 is the latest).
--    Provenance is server-written; a customer session must not be able to claim
--    a site was delivered from an approved preview, or to erase that it was.
-- ---------------------------------------------------------------------------

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
  if old.industry_profile_id is not null
     and new.industry_profile_id is distinct from old.industry_profile_id then
    raise exception 'sites: industry_profile_id cannot be changed once set'
      using errcode = '42501';
  end if;
  if old.pricing_model_version is not null
     and new.pricing_model_version is distinct from old.pricing_model_version then
    raise exception 'sites: pricing_model_version cannot be changed once set'
      using errcode = '42501';
  end if;
  if old.delivered_from_preview_id is not null
     and new.delivered_from_preview_id is distinct from old.delivered_from_preview_id then
    raise exception 'sites: delivered_from_preview_id cannot be changed once set'
      using errcode = '42501';
  end if;

  if current_user in ('authenticated', 'anon') then
    if new.draft_expires_at is distinct from old.draft_expires_at
       or new.industry_profile_id is distinct from old.industry_profile_id
       or new.pricing_model_version is distinct from old.pricing_model_version then
      raise exception 'sites: server-owned contract fields cannot be changed'
        using errcode = '42501';
    end if;
  end if;

  if new.draft_config is distinct from old.draft_config
     and old.draft_expires_at is not null
     and new.status in ('draft', 'building') then
    new.draft_expires_at := now() + interval '30 days';
  end if;

  if current_user in ('authenticated', 'anon') then
    if new.id                        is distinct from old.id
    or new.client_id                 is distinct from old.client_id
    or new.domain                    is distinct from old.domain
    or new.domain_type               is distinct from old.domain_type
    or new.dns_verified              is distinct from old.dns_verified
    or new.cloudflare_hostname_id    is distinct from old.cloudflare_hostname_id
    or new.status                    is distinct from old.status
    or new.site_config               is distinct from old.site_config
    or new.published_at              is distinct from old.published_at
    or new.created_at                is distinct from old.created_at
    or new.free_regens_used          is distinct from old.free_regens_used
    or new.export_status             is distinct from old.export_status
    or new.export_requested_at       is distinct from old.export_requested_at
    or new.export_url                is distinct from old.export_url
    or new.asset_policy_version      is distinct from old.asset_policy_version
    or new.delivered_from_preview_id is distinct from old.delivered_from_preview_id
    or new.delivered_at              is distinct from old.delivered_at
    or new.approved_at               is distinct from old.approved_at
    then
      raise exception 'sites: 고객은 name/draft_config/survey만 수정할 수 있습니다'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
