-- Monthly content slots had no creation path: 0049 defined the schedule identity and the
-- 'slot_created' event type, but nothing ever inserted a content_posts row, so the product could
-- not start. Provisioning stays a security-definer RPC like every other content mutation —
-- content_posts carries only a select grant, and no new grant is issued here.

create or replace function public.provision_content_post_slots(
  p_client_id uuid,
  p_site_id uuid,
  p_pricing_model_version text,
  p_period_month date,
  p_count integer,
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.sites%rowtype;
  v_period date;
  v_existing integer;
  v_created integer;
  v_slot record;
begin
  if nullif(btrim(p_actor_id), '') is null then
    raise exception 'content slot provisioning actor is required'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_pricing_model_version), '') is null then
    raise exception 'content slot pricing model version is required'
      using errcode = '22023';
  end if;
  if p_count is null or p_count < 1 or p_count > 31 then
    raise exception 'content slot count is invalid'
      using errcode = '22023';
  end if;
  if p_period_month is null then
    raise exception 'content slot period month is required'
      using errcode = '22023';
  end if;

  -- The caller resolves the month in the site's own time zone; the stored key is that calendar
  -- month, and any stray day component is normalized rather than rejected asymmetrically.
  v_period := date_trunc('month', p_period_month)::date;

  select *
  into v_site
  from public.sites
  where id = p_site_id
  for update;

  if v_site.id is null then
    raise exception 'content slot site not found'
      using errcode = 'P0002';
  end if;
  if v_site.client_id <> p_client_id then
    raise exception 'content slot site must belong to client'
      using errcode = '42501';
  end if;

  select count(*)
  into v_existing
  from public.content_posts
  where site_id = p_site_id
    and pricing_model_version = p_pricing_model_version
    and period_month = v_period;

  -- Slug determinism rests on one external guarantee. The schedule identity is keyed on
  -- (site_id, pricing_model_version, period_month, ordinal) while the slug is derived from only
  -- (period_month, ordinal), so two different pricing model versions in the same month would
  -- derive the same slug and collide on the separate (site_id, slug) unique index. The only thing
  -- preventing that is 0047's sites_protected_columns guard, which raises
  -- 'pricing_model_version cannot be changed once set' — a site can never move to a second
  -- version. If 0047 is ever relaxed, the `on conflict do nothing` below stops being a no-op
  -- retry and starts silently swallowing genuinely missing slots: the month would report
  -- created = 0 while standing short, and the customer counter would quietly under-deliver.
  -- Relaxing 0047 therefore requires putting pricing_model_version into the slug.
  with wanted as (
    select generate_series(1, p_count)::smallint as ordinal
  ),
  inserted as (
    insert into public.content_posts (
      client_id,
      site_id,
      pricing_model_version,
      period_month,
      ordinal,
      slug,
      status
    )
    select
      v_site.client_id,
      v_site.id,
      p_pricing_model_version,
      v_period,
      wanted.ordinal,
      to_char(v_period, 'YYYY-MM') || '-post-' || wanted.ordinal::text,
      'draft'
    from wanted
    where not exists (
      select 1
      from public.content_posts existing
      where existing.site_id = v_site.id
        and existing.pricing_model_version = p_pricing_model_version
        and existing.period_month = v_period
        and existing.ordinal = wanted.ordinal
    )
    on conflict do nothing
    returning id, client_id, site_id
  )
  select count(*)
  into v_created
  from inserted;

  for v_slot in
    select p.id, p.client_id, p.site_id
    from public.content_posts p
    where p.site_id = p_site_id
      and p.pricing_model_version = p_pricing_model_version
      and p.period_month = v_period
      -- Only rows still sitting at 'draft'. Backfilling an event for a row that has already moved
      -- on would append a 'slot_created' after its 'published' entry, and the ledger is
      -- append-only, so a future import path could permanently corrupt the audit order.
      and p.status = 'draft'
      and not exists (
        select 1
        from public.content_post_events e
        where e.content_post_id = p.id
          and e.event_type = 'slot_created'
      )
  loop
    insert into public.content_post_events (
      content_post_id,
      client_id,
      site_id,
      event_type,
      from_status,
      to_status,
      actor_type,
      actor_id
    ) values (
      v_slot.id,
      v_slot.client_id,
      v_slot.site_id,
      'slot_created',
      null,
      'draft',
      'admin',
      btrim(p_actor_id)
    );
  end loop;

  return jsonb_build_object(
    'periodMonth', to_char(v_period, 'YYYY-MM-DD'),
    'created', v_created,
    'existing', v_existing
  );
end;
$$;

comment on function public.provision_content_post_slots(uuid, uuid, text, date, integer, text) is
  'Idempotently fills the missing monthly content slots for one site. Re-running adds only the ordinals that are absent.';

revoke execute on function public.provision_content_post_slots(
  uuid, uuid, text, date, integer, text
) from public, anon, authenticated;

grant execute on function public.provision_content_post_slots(
  uuid, uuid, text, date, integer, text
) to service_role;
