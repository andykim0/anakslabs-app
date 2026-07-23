-- Immutable server assessment for customer raster image promotion.
alter table public.asset_records
  add column if not exists image_quality jsonb;

alter table public.asset_records
  add constraint asset_records_image_quality_shape
  check (
    image_quality is null
    or (
      origin = 'customer_upload'
      and media_type = 'image'
      and image_quality ->> 'algorithmVersion' = 'hero-photo-v1'
      and jsonb_typeof(image_quality -> 'passed') = 'boolean'
      and jsonb_typeof(image_quality -> 'reasons') = 'array'
      and jsonb_typeof(image_quality -> 'metrics') = 'object'
      and (image_quality ->> 'inputSha256') ~ '^[0-9a-f]{64}$'
      and (image_quality ->> 'stampSha256') ~ '^[0-9a-f]{64}$'
    )
  );

comment on column public.asset_records.image_quality is
  'Immutable server-computed raster quality assessment used for hero promotion.';

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
    or new.image_quality  is distinct from old.image_quality
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

revoke execute on function public.guard_asset_record_authority()
  from public, anon, authenticated;
