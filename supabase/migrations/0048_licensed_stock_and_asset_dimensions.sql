-- Licensed stock is a server-owned shared registry row. Customer-owned assets
-- keep their existing owner and one-site binding contract.

alter table public.asset_records
  alter column client_id drop not null;

alter table public.asset_records
  drop constraint if exists asset_records_origin_check;

alter table public.asset_records
  add constraint asset_records_origin_check
  check (origin in (
    'customer_upload',
    'customer_import',
    'ai_generated',
    'licensed_stock',
    'legacy_unknown'
  ));

alter table public.asset_records
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists stock_key text,
  add column if not exists provider text,
  add column if not exists provider_asset_id text,
  add column if not exists attribution jsonb;

alter table public.asset_records
  add constraint asset_records_raster_dimensions_pair
  check (
    (width is null and height is null)
    or (
      media_type = 'image'
      and width is not null and width > 0
      and height is not null and height > 0
    )
  ),
  add constraint asset_records_licensed_stock_shape
  check (
    (
      origin = 'licensed_stock'
      and client_id is null
      and site_id is null
      and media_type = 'image'
      and width is not null
      and height is not null
      and length(btrim(stock_key)) > 0
      and provider = 'pexels'
      and length(btrim(provider_asset_id)) > 0
      and attribution ->> 'provider' = 'pexels'
      and length(btrim(attribution ->> 'photographer')) > 0
      and attribution ->> 'photographerUrl' like 'https://www.pexels.com/%'
      and attribution ->> 'sourceUrl' like 'https://www.pexels.com/photo/%'
      and attribution ->> 'licenseUrl' = 'https://www.pexels.com/license/'
    )
    or (
      origin <> 'licensed_stock'
      and client_id is not null
      and stock_key is null
      and provider is null
      and provider_asset_id is null
      and attribution is null
    )
  );

create unique index if not exists asset_records_stock_key_uidx
  on public.asset_records (stock_key)
  where stock_key is not null;

create unique index if not exists asset_records_provider_asset_uidx
  on public.asset_records (provider, provider_asset_id)
  where provider is not null and provider_asset_id is not null;

update public.asset_records
set
  width = (image_quality -> 'metrics' ->> 'width')::integer,
  height = (image_quality -> 'metrics' ->> 'height')::integer
where media_type = 'image'
  and width is null
  and height is null
  and (image_quality -> 'metrics' ->> 'width') ~ '^[1-9][0-9]*$'
  and (image_quality -> 'metrics' ->> 'height') ~ '^[1-9][0-9]*$';

comment on column public.asset_records.width is
  'Immutable server-decoded raster width. Unknown legacy, SVG, and video records remain null.';
comment on column public.asset_records.height is
  'Immutable server-decoded raster height. Unknown legacy, SVG, and video records remain null.';
comment on column public.asset_records.stock_key is
  'Stable provider-neutral stock key, separate from the UUID registry identity.';
comment on column public.asset_records.attribution is
  'Immutable licensed stock credit projected into saved site manifests.';

create or replace function public.guard_asset_record_authority()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id                is distinct from old.id
    or new.client_id         is distinct from old.client_id
    or new.origin            is distinct from old.origin
    or new.media_type        is distinct from old.media_type
    or new.storage_bucket    is distinct from old.storage_bucket
    or new.storage_key       is distinct from old.storage_key
    or new.canonical_url     is distinct from old.canonical_url
    or new.created_at        is distinct from old.created_at
    or new.image_quality     is distinct from old.image_quality
    or new.stock_key         is distinct from old.stock_key
    or new.provider          is distinct from old.provider
    or new.provider_asset_id is distinct from old.provider_asset_id
    or new.attribution       is distinct from old.attribution
    then
      raise exception 'asset record authority fields are immutable'
        using errcode = '23514';
    end if;

    if old.width is not null and new.width is distinct from old.width then
      raise exception 'asset width is immutable once known'
        using errcode = '23514';
    end if;
    if old.height is not null and new.height is distinct from old.height then
      raise exception 'asset height is immutable once known'
        using errcode = '23514';
    end if;
    if (old.width is null) <> (old.height is null) then
      raise exception 'partial legacy dimensions cannot be updated'
        using errcode = '23514';
    end if;
    if old.width is null and (
      (new.width is null) <> (new.height is null)
      or (new.width is not null and new.media_type <> 'image')
    ) then
      raise exception 'asset dimensions must be a complete raster pair'
        using errcode = '23514';
    end if;

    if old.site_id is not null and new.site_id is distinct from old.site_id then
      raise exception 'asset record site binding is immutable once set'
        using errcode = '23514';
    end if;
    if old.origin = 'licensed_stock' and new.site_id is not null then
      raise exception 'licensed stock cannot be bound to a customer site'
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

revoke execute on function public.guard_asset_record_authority()
  from public, anon, authenticated;

-- Service-role maintenance seam for one-time raster dimension backfill.
create or replace function public.set_asset_raster_dimensions_once(
  p_asset_id uuid,
  p_width integer,
  p_height integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if p_width is null or p_width <= 0 or p_height is null or p_height <= 0 then
    raise exception 'positive raster dimensions are required'
      using errcode = '23514';
  end if;

  update public.asset_records
  set width = p_width, height = p_height
  where id = p_asset_id
    and media_type = 'image'
    and width is null
    and height is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.set_asset_raster_dimensions_once(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.set_asset_raster_dimensions_once(uuid, integer, integer)
  to service_role;
