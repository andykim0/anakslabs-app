-- Immutable service-only record of verbal permission to prepare a private demo by email.

create table public.us_medical_demo_consents (
  id               uuid primary key default gen_random_uuid(),
  prospect_id      text not null,
  consenter_name   text not null,
  consenter_title  text not null,
  consented_at     timestamptz not null,
  consent_scope    text not null,
  recorded_by      text not null,
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  constraint us_medical_demo_consents_prospect_check check (
    char_length(btrim(prospect_id)) between 1 and 100
  ),
  constraint us_medical_demo_consents_consenter_name_check check (
    char_length(btrim(consenter_name)) between 1 and 120
  ),
  constraint us_medical_demo_consents_consenter_title_check check (
    char_length(btrim(consenter_title)) between 1 and 120
  ),
  constraint us_medical_demo_consents_scope_check check (
    consent_scope = 'demo-by-email'
  ),
  constraint us_medical_demo_consents_recorded_by_check check (
    char_length(btrim(recorded_by)) between 1 and 200
  ),
  constraint us_medical_demo_consents_notes_check check (
    char_length(notes) <= 2000
  )
);

create index us_medical_demo_consents_prospect_idx
  on public.us_medical_demo_consents (prospect_id, consented_at desc);

comment on table public.us_medical_demo_consents is
  'Immutable verbal-consent ledger for owner-reviewed private US medical demos; scope is demo-by-email only.';

alter table public.us_medical_demo_consents enable row level security;

revoke all on table public.us_medical_demo_consents
  from public, anon, authenticated, service_role;

grant select, insert on table public.us_medical_demo_consents
  to service_role;
