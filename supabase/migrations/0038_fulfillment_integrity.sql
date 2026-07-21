-- FUL: atomic edit submission/completion and append-only actor audit.

create table public.edit_request_events (
  id uuid primary key default gen_random_uuid(),
  edit_request_id uuid not null references public.edit_requests(id) on delete cascade,
  from_status text check (
    from_status is null or from_status in ('pending', 'ai_processing', 'qa_review', 'applied', 'rejected')
  ),
  to_status text not null check (
    to_status in ('pending', 'ai_processing', 'qa_review', 'applied', 'rejected')
  ),
  actor_type text not null check (actor_type in ('client', 'system', 'admin')),
  actor_id text not null check (length(btrim(actor_id)) between 1 and 200),
  created_at timestamptz not null default now()
);

create index edit_request_events_request_created_idx
  on public.edit_request_events (edit_request_id, created_at asc);

comment on table public.edit_request_events is
  'Append-only status transition audit. Service RPCs are the only writers.';

alter table public.edit_request_events enable row level security;
revoke all on table public.edit_request_events from public, anon, authenticated, service_role;
grant select on table public.edit_request_events to service_role;

-- All new mutations must pass through the audited transaction functions below.
revoke insert, update, delete on table public.edit_requests from authenticated, service_role;
grant select on table public.edit_requests to authenticated, service_role;

create or replace function public.submit_edit_request_atomic(
  p_client_id uuid,
  p_site_id uuid,
  p_type text,
  p_credit_cost numeric,
  p_reason text,
  p_requested_content text,
  p_is_initial_revision boolean,
  p_auto_approved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.edit_requests%rowtype;
  v_site public.sites%rowtype;
  v_balance numeric;
begin
  if p_client_id is null or p_site_id is null
     or p_type not in ('text', 'image', 'video', 'structure')
     or p_credit_cost is null or p_credit_cost < 0
     or length(btrim(coalesce(p_requested_content, ''))) < 1
     or length(p_requested_content) > 4000
     or p_reason <> case p_type
       when 'text' then 'edit_text'
       when 'image' then 'edit_image'
       when 'video' then 'edit_video'
       when 'structure' then 'edit_structure'
     end then
    raise exception 'edit request input is invalid' using errcode = '23514';
  end if;
  select * into v_site from public.sites
  where id = p_site_id for update;
  if not found or v_site.client_id <> p_client_id then
    raise exception 'edit request site owner mismatch' using errcode = '42501';
  end if;
  if p_is_initial_revision and (
    p_type = 'video'
    or v_site.published_at is null
    or v_site.published_at + interval '7 days' <= now()
    or exists (
      select 1 from public.edit_requests er
      where er.site_id = p_site_id and er.status <> 'rejected'
    )
  ) then
    raise exception 'initial revision eligibility changed' using errcode = '40001';
  end if;

  insert into public.edit_requests (
    client_id, site_id, type, credit_cost, status, requested_content,
    is_initial_revision, auto_approved
  ) values (
    p_client_id, p_site_id, p_type,
    case when p_is_initial_revision then 0 else p_credit_cost end,
    'pending', btrim(p_requested_content), p_is_initial_revision, p_auto_approved
  ) returning * into v_request;

  if p_is_initial_revision then
    select coalesce(balance, 0) into v_balance
    from public.credit_balances where client_id = p_client_id;
    v_balance := coalesce(v_balance, 0);
  else
    -- Any error, including insufficient_credits, rolls the request insert back.
    v_balance := public.consume_credits(
      p_client_id, p_credit_cost, p_reason, v_request.id
    );
  end if;

  insert into public.edit_request_events (
    edit_request_id, from_status, to_status, actor_type, actor_id
  ) values (
    v_request.id, null, 'pending', 'client', p_client_id::text
  );

  return jsonb_build_object('request', to_jsonb(v_request), 'balance', v_balance);
end;
$$;

create or replace function public.transition_edit_request_atomic(
  p_edit_request_id uuid,
  p_expected_statuses text[],
  p_next_status text,
  p_actor_type text,
  p_actor_id text,
  p_has_ai_output boolean default false,
  p_ai_output jsonb default null,
  p_has_qa_note boolean default false,
  p_qa_note text default null,
  p_applied_at timestamptz default null,
  p_reviewed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.edit_requests%rowtype;
  v_from text;
begin
  if p_edit_request_id is null
     or coalesce(array_length(p_expected_statuses, 1), 0) = 0
     or p_next_status not in ('pending', 'ai_processing', 'qa_review', 'applied', 'rejected')
     or p_actor_type not in ('client', 'system', 'admin')
     or length(btrim(coalesce(p_actor_id, ''))) < 1 then
    raise exception 'edit transition input is invalid' using errcode = '23514';
  end if;

  select * into v_request from public.edit_requests
  where id = p_edit_request_id for update;
  if not found then
    raise exception 'edit request not found' using errcode = 'P0002';
  end if;
  if not (v_request.status = any(p_expected_statuses)) then
    raise exception 'edit request state conflict: %', v_request.status using errcode = '40001';
  end if;
  v_from := v_request.status;

  update public.edit_requests
  set status = p_next_status,
      ai_output = case when p_has_ai_output then p_ai_output else ai_output end,
      qa_note = case when p_has_qa_note then p_qa_note else qa_note end,
      applied_at = coalesce(p_applied_at, applied_at),
      reviewed_at = coalesce(p_reviewed_at, reviewed_at)
  where id = p_edit_request_id
  returning * into v_request;

  insert into public.edit_request_events (
    edit_request_id, from_status, to_status, actor_type, actor_id
  ) values (
    p_edit_request_id, v_from, p_next_status, p_actor_type, btrim(p_actor_id)
  );
  return to_jsonb(v_request);
end;
$$;

create or replace function public.complete_edit_request_fulfillment(
  p_edit_request_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_completed_at timestamptz,
  p_expected_draft_config jsonb,
  p_expected_site_config jsonb,
  p_next_draft_config jsonb,
  p_next_site_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.edit_requests%rowtype;
  v_site public.sites%rowtype;
begin
  if p_edit_request_id is null or p_completed_at is null
     or p_actor_type not in ('admin', 'system')
     or length(btrim(coalesce(p_actor_id, ''))) < 1
     or (p_next_draft_config is null and p_next_site_config is null) then
    raise exception 'edit completion input is invalid' using errcode = '23514';
  end if;

  select * into v_request from public.edit_requests
  where id = p_edit_request_id for update;
  if not found then
    raise exception 'edit request not found' using errcode = 'P0002';
  end if;
  if v_request.status = 'applied' then
    return jsonb_build_object('request', to_jsonb(v_request), 'duplicated', true);
  end if;
  if v_request.status <> 'qa_review' then
    raise exception 'edit request state conflict: %', v_request.status using errcode = '40001';
  end if;

  select * into v_site from public.sites
  where id = v_request.site_id and client_id = v_request.client_id for update;
  if not found then
    raise exception 'edit request site owner mismatch' using errcode = '42501';
  end if;
  if v_site.draft_config is distinct from p_expected_draft_config
     or v_site.site_config is distinct from p_expected_site_config then
    raise exception 'edit fulfillment config changed concurrently' using errcode = '40001';
  end if;
  if (p_expected_draft_config is null) <> (p_next_draft_config is null)
     or (p_expected_site_config is null) <> (p_next_site_config is null)
     or (v_site.status = 'live' and p_next_site_config is null) then
    raise exception 'edit fulfillment config columns are invalid' using errcode = '23514';
  end if;

  update public.sites
  set draft_config = p_next_draft_config,
      site_config = p_next_site_config,
      export_status = 'none',
      export_url = null,
      export_requested_at = null
  where id = v_site.id;

  update public.edit_requests
  set status = 'applied', applied_at = p_completed_at,
      reviewed_at = p_completed_at, qa_note = 'ADMIN_APPLIED_TO_PUBLISHED_SITE'
  where id = v_request.id
  returning * into v_request;

  insert into public.edit_request_events (
    edit_request_id, from_status, to_status, actor_type, actor_id, created_at
  ) values (
    v_request.id, 'qa_review', 'applied', p_actor_type, btrim(p_actor_id), p_completed_at
  );
  return jsonb_build_object('request', to_jsonb(v_request), 'duplicated', false);
end;
$$;

revoke execute on function public.submit_edit_request_atomic(
  uuid, uuid, text, numeric, text, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.submit_edit_request_atomic(
  uuid, uuid, text, numeric, text, text, boolean, boolean
) to service_role;

revoke execute on function public.transition_edit_request_atomic(
  uuid, text[], text, text, text, boolean, jsonb, boolean, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.transition_edit_request_atomic(
  uuid, text[], text, text, text, boolean, jsonb, boolean, text, timestamptz, timestamptz
) to service_role;

revoke execute on function public.complete_edit_request_fulfillment(
  uuid, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_edit_request_fulfillment(
  uuid, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb
) to service_role;
