-- USD-PAYMENTS: make the unit carried by payments.amount explicit without
-- reinterpreting historical evidence. Existing rows receive the DEFAULT value
-- as part of this ADD COLUMN, so every pre-existing amount remains whole KRW.

alter table public.payments
  add column currency text not null default 'KRW';

alter table public.payments
  add constraint payments_currency_check check (currency in ('KRW', 'USD'));

comment on column public.payments.currency is
  'Unit of payments.amount: whole KRW for KRW rows and whole dollars for USD rows. Provider minor units are converted before this boundary.';

-- USD setup payments deliberately use a separate RPC. The historical KRW
-- handle_build_fee_payment contract continues to update tiers and grant initial
-- credits unchanged; the US Enterprise contract records cash evidence only.
create or replace function public.handle_usd_build_fee_payment(
  p_client_id uuid,
  p_provider_payment_key text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
begin
  if p_provider_payment_key is null or btrim(p_provider_payment_key) = '' then
    raise exception 'handle_usd_build_fee_payment: provider_payment_key is required'
      using errcode = '23514';
  end if;
  if p_amount is null
     or trunc(p_amount) <> p_amount
     or p_amount <> 990::numeric then
    raise exception 'handle_usd_build_fee_payment: amount must equal 990 whole USD'
      using errcode = '23514';
  end if;

  select * into v_payment
  from public.payments p
  where p.provider_payment_key = p_provider_payment_key;
  if found then
    if v_payment.client_id <> p_client_id
       or v_payment.type <> 'build_fee'
       or v_payment.amount <> p_amount
       or v_payment.currency <> 'USD' then
      raise exception 'handle_usd_build_fee_payment: provider key contract mismatch'
        using errcode = '42501';
    end if;
    return jsonb_build_object(
      'processed', false,
      'duplicated', true,
      'payment_id', v_payment.id,
      'credits_granted', 0,
      'currency', 'USD'
    );
  end if;

  insert into public.payments (
    client_id,
    type,
    amount,
    currency,
    credits_granted,
    provider_payment_key
  ) values (
    p_client_id,
    'build_fee',
    p_amount,
    'USD',
    0,
    p_provider_payment_key
  )
  on conflict (provider_payment_key) do nothing
  returning * into v_payment;

  if not found then
    -- A concurrent delivery won the unique-key race. Re-read and verify that
    -- it is the same business effect before treating this request as a retry.
    select * into v_payment
    from public.payments p
    where p.provider_payment_key = p_provider_payment_key;
    if not found
       or v_payment.client_id <> p_client_id
       or v_payment.type <> 'build_fee'
       or v_payment.amount <> p_amount
       or v_payment.currency <> 'USD' then
      raise exception 'handle_usd_build_fee_payment: provider key contract mismatch'
        using errcode = '42501';
    end if;
    return jsonb_build_object(
      'processed', false,
      'duplicated', true,
      'payment_id', v_payment.id,
      'credits_granted', 0,
      'currency', 'USD'
    );
  end if;

  return jsonb_build_object(
    'processed', true,
    'duplicated', false,
    'payment_id', v_payment.id,
    'credits_granted', 0,
    'currency', 'USD'
  );
end;
$$;

revoke all on function public.handle_usd_build_fee_payment(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.handle_usd_build_fee_payment(uuid, text, numeric)
  to service_role;
