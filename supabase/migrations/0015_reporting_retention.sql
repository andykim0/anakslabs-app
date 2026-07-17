-- ============================================================================
-- 0015_reporting_retention.sql — [RPT$] anonymous aggregate retention
--
-- Daily aggregate rows and monthly report records are retained for 24 months.
-- The caller computes the Korean calendar cutoff; deletion is service-only.
-- ============================================================================

create or replace function public.purge_site_events(p_before_date date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_before_date is null then
    raise exception 'purge_site_events: cutoff is required';
  end if;
  delete from public.site_events where event_date < p_before_date;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.purge_site_events(date)
  from public, anon, authenticated;
grant execute on function public.purge_site_events(date) to service_role;
