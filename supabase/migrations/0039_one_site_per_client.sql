-- BILL$: one paid account may own one persisted site.
-- There is no archived/deleted status, so suspended rows also keep their slot.
-- A second homepage is contracted through operations under a separate account.

create unique index if not exists sites_one_per_client_uidx
  on public.sites (client_id);

comment on index public.sites_one_per_client_uidx is
  'BILL$: one account/payment contract owns one site; additional sites require a separate contract.';
