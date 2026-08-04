-- USD-PAYMENTS follow-up: the dormant monthly credit batch predates provider
-- subscriptions. Stripe Enterprise subscriptions are cash-only and must never
-- enter that batch, while every historical KRW subscription remains eligible.

create or replace function public.grant_monthly_subscription_credits(
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_eligible integer := 0;
  v_granted integer := 0;
begin
  for v_client_id in
    select s.client_id
    from public.site_subscriptions s
    where s.status = 'active'
      and s.current_period_end > p_as_of
      and s.stripe_subscription_id is null
    order by s.client_id
  loop
    v_eligible := v_eligible + 1;
    if public.grant_subscription_month_credits(v_client_id, p_as_of, null) then
      v_granted := v_granted + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'eligible', v_eligible,
    'granted', v_granted,
    'skipped', v_eligible - v_granted
  );
end;
$$;

revoke execute on function public.grant_monthly_subscription_credits(timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_monthly_subscription_credits(timestamptz)
  to service_role;
