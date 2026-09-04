-- ============================================================================
-- 0065_citation_checks.sql — [CITE$] "who got named in AI answers"
--
-- We optimize the shared input layer every answer engine reads. These two tables
-- measure the OUTPUT: once a month, for each active site, a small fixed set of the
-- customer's discovery questions is asked of four engines through their APIs, and we
-- record whether the business was NAMED in the answer and LINKED among its sources.
--
-- Honesty constraints these tables encode:
--   * Every row is an API-based probe. It is a close cousin of the answer a person sees
--     in the consumer app, not the same thing (no personalization, memory, or location
--     history). Report copy must say so.
--   * Google Search's AI Overviews / AI Mode have no API. There is no 'google' engine
--     here on purpose, and the report footnote says they are not included.
--   * run_month is the first day of the month IN THE SITE'S OWN TIME ZONE, resolved by
--     lib/reporting/period.ts. There is no global KST month for a US site.
--
-- Answers are third-party text, so only a short plain-text excerpt is retained. No
-- visitor, session, or contact data is stored by either table.
-- ============================================================================

create table public.citation_questions (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  question    text not null check (length(btrim(question)) between 1 and 300),
  -- 'seeded' = rewritten from a survey-FAQ topic seed into a third-person local query.
  source      text not null check (source in ('generated', 'seeded', 'manual')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (site_id, question)
);

create index citation_questions_site_active_idx
  on public.citation_questions (site_id, created_at)
  where active;

comment on table public.citation_questions is
  '[CITE$] Discovery-shaped questions probed against answer engines. Never customer PII.';

create table public.citation_probes (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  question_id     uuid not null references public.citation_questions (id) on delete cascade,
  engine          text not null check (engine in ('openai', 'anthropic', 'gemini', 'perplexity')),
  -- First day of the month in the site's own time zone.
  run_month       date not null,
  status          text not null check (status in ('ok', 'not_configured', 'error', 'skipped')),
  named           boolean not null default false,
  linked          boolean not null default false,
  answer_excerpt  text not null default '' check (length(answer_excerpt) <= 600),
  sources         jsonb not null default '[]'::jsonb,
  model           text not null default '' check (length(model) <= 120),
  error_code      text check (
    error_code is null or (
      length(error_code) between 1 and 80
      and error_code ~ '^[A-Z0-9_:-]+$'
    )
  ),
  created_at      timestamptz not null default now(),
  constraint citation_probes_run_month_start check (
    run_month = date_trunc('month', run_month)::date
  ),
  constraint citation_probes_sources_shape check (jsonb_typeof(sources) = 'array'),
  -- A row we never got an answer for cannot claim a verdict.
  constraint citation_probes_verdict_requires_answer check (
    status = 'ok' or (named = false and linked = false)
  ),
  -- This tuple is the idempotency key. Re-running a month fills missing pairs only.
  unique (site_id, question_id, engine, run_month)
);

create index citation_probes_site_month_idx
  on public.citation_probes (site_id, run_month);
create index citation_probes_month_idx
  on public.citation_probes (run_month);

comment on table public.citation_probes is
  '[CITE$] One API probe per (site, question, engine, month). Retained on the 24-month reporting window.';

-- ---------------------------------------------------------------------------
-- RLS: service-role writes; the owner reads through site ownership, exactly as
-- monthly_site_reports scopes an owner read (0014).
-- ---------------------------------------------------------------------------

alter table public.citation_questions enable row level security;
alter table public.citation_probes enable row level security;

create policy citation_questions_select_own
  on public.citation_questions for select to authenticated
  using (
    exists (
      select 1 from public.sites s
      where s.id = citation_questions.site_id and s.client_id = auth.uid()
    )
  );

create policy citation_probes_select_own
  on public.citation_probes for select to authenticated
  using (
    exists (
      select 1 from public.sites s
      where s.id = citation_probes.site_id and s.client_id = auth.uid()
    )
  );

revoke all on table public.citation_questions from anon, authenticated, service_role;
revoke all on table public.citation_probes from anon, authenticated, service_role;
grant select on table public.citation_questions to authenticated, service_role;
grant select on table public.citation_probes to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Service-only writers.
-- ---------------------------------------------------------------------------

create or replace function public.insert_citation_question(
  p_site_id uuid,
  p_question text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.citation_questions%rowtype;
begin
  if p_source not in ('generated', 'seeded', 'manual') then
    raise exception 'insert_citation_question: unsupported source';
  end if;
  if not exists (select 1 from public.sites s where s.id = p_site_id) then
    raise exception 'insert_citation_question: site not found';
  end if;

  insert into public.citation_questions (site_id, question, source)
  values (p_site_id, btrim(p_question), p_source)
  on conflict (site_id, question) do nothing
  returning * into v_record;

  if not found then
    select * into strict v_record
    from public.citation_questions q
    where q.site_id = p_site_id and q.question = btrim(p_question);
  end if;

  return to_jsonb(v_record);
end;
$$;

create or replace function public.insert_citation_probe(
  p_site_id uuid,
  p_question_id uuid,
  p_engine text,
  p_run_month date,
  p_status text,
  p_named boolean,
  p_linked boolean,
  p_answer_excerpt text,
  p_sources jsonb,
  p_model text,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created boolean := false;
  v_id uuid;
begin
  if p_run_month is null or p_run_month <> date_trunc('month', p_run_month)::date then
    raise exception 'insert_citation_probe: run month must be the first day of a month';
  end if;
  if not exists (
    select 1 from public.citation_questions q
    where q.id = p_question_id and q.site_id = p_site_id
  ) then
    raise exception 'insert_citation_probe: question does not belong to this site';
  end if;

  insert into public.citation_probes (
    site_id, question_id, engine, run_month, status,
    named, linked, answer_excerpt, sources, model, error_code
  ) values (
    p_site_id, p_question_id, p_engine, p_run_month, p_status,
    coalesce(p_named, false), coalesce(p_linked, false),
    coalesce(p_answer_excerpt, ''), coalesce(p_sources, '[]'::jsonb),
    coalesce(p_model, ''), p_error_code
  )
  on conflict (site_id, question_id, engine, run_month) do nothing
  returning id into v_id;

  if found then v_created := true; end if;
  return jsonb_build_object('created', v_created);
end;
$$;

-- Probes expire with the reports that quote them, on the same 24-month window.
create or replace function public.purge_citation_probes(p_cutoff_month date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_cutoff_month is null then
    raise exception 'purge_citation_probes: cutoff is required';
  end if;
  delete from public.citation_probes
  where run_month < date_trunc('month', p_cutoff_month)::date;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.count_citation_probes_for_month(p_run_month date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.citation_probes
  where run_month = p_run_month;
  return v_count;
end;
$$;

revoke execute on function public.insert_citation_question(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.insert_citation_probe(
  uuid, uuid, text, date, text, boolean, boolean, text, jsonb, text, text
) from public, anon, authenticated;
revoke execute on function public.purge_citation_probes(date)
  from public, anon, authenticated;
revoke execute on function public.count_citation_probes_for_month(date)
  from public, anon, authenticated;

grant execute on function public.insert_citation_question(uuid, text, text) to service_role;
grant execute on function public.insert_citation_probe(
  uuid, uuid, text, date, text, boolean, boolean, text, jsonb, text, text
) to service_role;
grant execute on function public.purge_citation_probes(date) to service_role;
grant execute on function public.count_citation_probes_for_month(date) to service_role;
