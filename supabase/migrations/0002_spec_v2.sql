-- ============================================================================
-- 0002_spec_v2.sql — 스펙 개정 v2 애드온 (설계서 docs/SPEC-V2-DESIGN.md)
--
-- 원칙 (0001과 동일 불변식 유지):
--  * 금액/크레딧은 numeric (float 금지). 시각은 timestamptz.
--  * 크레딧 변동은 credit_ledger append + security definer 함수 경유만.
--  * sites 보호 컬럼(export_*, free_regens_used)은 고객 직접 UPDATE 차단 — 서버(service role) 경유.
--
-- TS 계약과 동기 (값 변경 시 함께 수정):
--  * web/src/lib/types/domain.ts — Site/Client/EditRequest/Payment 확장 필드
--  * web/src/lib/credits/constants.ts — REFUND_POLICY, FREE_REGEN_LIMIT 등
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 컬럼 추가
-- ----------------------------------------------------------------------------

-- §3 최초 결과물 안전장치
alter table public.sites          add column if not exists free_regens_used int not null default 0;
alter table public.edit_requests  add column if not exists is_initial_revision boolean not null default false;
alter table public.payments       add column if not exists refunded_at timestamptz;
alter table public.payments       add column if not exists refund_amount numeric;  -- numeric 불변식 준수

-- §5 Export
alter table public.sites   add column if not exists export_status text
  not null default 'none' check (export_status in ('none','processing','ready','failed'));
alter table public.sites   add column if not exists export_requested_at timestamptz;
alter table public.sites   add column if not exists export_url text;               -- Storage object path (signed URL 아님)
alter table public.clients add column if not exists cancel_requested_at timestamptz;

-- §6 법적 필수요소
alter table public.clients add column if not exists business_info jsonb;           -- BusinessInfo 형태

-- §2 QA 자동화 (스키마만 선반영 — 활성화는 P2)
alter table public.edit_requests add column if not exists auto_approved boolean not null default false;
alter table public.edit_requests add column if not exists reviewed_at timestamptz;
alter table public.edit_requests add column if not exists qa_note text;

create table if not exists public.qa_automation_rules (
  edit_type          text primary key check (edit_type in ('text','image','video','structure')),
  enabled            boolean not null default false,
  approval_threshold numeric not null default 0.98,
  min_samples        int     not null default 30,
  sample_audit_rate  numeric not null default 0.10,
  updated_at         timestamptz not null default now()
);

-- 유형별 규칙 시드 (video는 원가 사유로 자동화 대상 제외 — enabled 영구 false 권장)
insert into public.qa_automation_rules (edit_type) values
  ('text'), ('image'), ('video'), ('structure')
on conflict (edit_type) do nothing;

-- ----------------------------------------------------------------------------
-- 2. 인덱스
-- ----------------------------------------------------------------------------

-- export 재생성/보관 배치 스캔용
create index if not exists sites_export_status_idx on public.sites (export_status)
  where export_status <> 'none';
-- QA 승인률 집계용 (유형별 최근 N건)
create index if not exists edit_requests_type_created_idx on public.edit_requests (type, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. sites 보호 컬럼 가드 트리거 확장
--    export_*, free_regens_used 를 고객 직접 UPDATE 금지 목록에 추가.
-- ----------------------------------------------------------------------------

create or replace function public.guard_site_protected_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id                     is distinct from old.id
    or new.client_id              is distinct from old.client_id
    or new.domain                 is distinct from old.domain
    or new.domain_type            is distinct from old.domain_type
    or new.dns_verified           is distinct from old.dns_verified
    or new.cloudflare_hostname_id is distinct from old.cloudflare_hostname_id
    or new.status                 is distinct from old.status
    or new.site_config            is distinct from old.site_config
    or new.published_at           is distinct from old.published_at
    or new.created_at             is distinct from old.created_at
    or new.free_regens_used       is distinct from old.free_regens_used
    or new.export_status          is distinct from old.export_status
    or new.export_requested_at    is distinct from old.export_requested_at
    or new.export_url             is distinct from old.export_url
    then
      raise exception 'sites: 고객은 name/draft_config/survey만 수정할 수 있습니다'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. edit_requests insert RLS 강화
--    고객 직접 insert 시 is_initial_revision/auto_approved 를 위조하지 못하게 강제 false.
--    (무료 수정권·자동 승인은 서버 service role만 부여 — RLS bypass 경로)
-- ----------------------------------------------------------------------------

alter policy edit_requests_insert_own on public.edit_requests
  with check (
    client_id = auth.uid()
    and status = 'pending'
    and ai_output is null
    and applied_at is null
    and is_initial_revision = false
    and auto_approved = false
    -- CREDIT_COSTS 와 동기 (web/src/lib/credits/constants.ts)
    and credit_cost = case type
      when 'text' then 1
      when 'image' then 1
      when 'video' then 3
      when 'structure' then 2
    end
    and exists (
      select 1 from public.sites s
      where s.id = site_id and s.client_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. QA 승인률 집계 뷰 (§2)
--    유형별 최근 50건 중 무수정 자동/수동 승인(applied) 비율 + 표본 수.
--    관리자 API GET /api/admin/qa-stats 가 조회.
-- ----------------------------------------------------------------------------

create or replace view public.qa_approval_stats
with (security_invoker = true) as
with recent as (
  select
    type,
    status,
    row_number() over (partition by type order by created_at desc) as rn
  from public.edit_requests
  where status in ('applied', 'rejected')
)
select
  type as edit_type,
  count(*) filter (where rn <= 50)                                    as sample_size,
  count(*) filter (where rn <= 50 and status = 'applied')            as approved_count,
  case when count(*) filter (where rn <= 50) = 0 then 0
       else round(
         count(*) filter (where rn <= 50 and status = 'applied')::numeric
         / count(*) filter (where rn <= 50), 4)
  end                                                                  as approval_rate
from recent
group by type;

-- ----------------------------------------------------------------------------
-- 6. 크레딧 lot 잔여 조회 헬퍼 (§3 환불 클로백용)
--    expire_client_credits 와 동일한 시간순 리플레이로 특정 지급 lot의 미사용 잔여를 반환.
-- ----------------------------------------------------------------------------

create or replace function public.credit_lot_remaining(
  p_client_id uuid,
  p_lot_id    uuid
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row       record;
  v_lot       record;
  v_need      numeric;
  v_alloc     numeric;
  v_remaining numeric := 0;
begin
  create temp table if not exists _anaks_lot_remaining (
    seq        bigint generated always as identity,
    lot_id     uuid,
    expires_at timestamptz,
    remaining  numeric
  ) on commit drop;
  truncate _anaks_lot_remaining;

  for v_row in
    select id, amount, reason, reference_id, expires_at
    from credit_ledger
    where client_id = p_client_id
    order by created_at asc, id asc
  loop
    if v_row.amount > 0 then
      insert into _anaks_lot_remaining (lot_id, expires_at, remaining)
      values (v_row.id, v_row.expires_at, v_row.amount);
    elsif v_row.reason = 'expired' then
      update _anaks_lot_remaining
      set remaining = greatest(0, remaining + v_row.amount)
      where lot_id = v_row.reference_id;
    else
      v_need := -v_row.amount;
      for v_lot in
        select seq, remaining
        from _anaks_lot_remaining
        where remaining > 0
        order by expires_at asc nulls last, seq asc
      loop
        exit when v_need <= 0;
        v_alloc := least(v_lot.remaining, v_need);
        update _anaks_lot_remaining set remaining = remaining - v_alloc where seq = v_lot.seq;
        v_need := v_need - v_alloc;
      end loop;
    end if;
  end loop;

  select coalesce(sum(remaining), 0) into v_remaining
  from _anaks_lot_remaining
  where lot_id = p_lot_id;

  return v_remaining;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. admin_refund_payment: 관리자 수동 환불 (§3) — 멱등
--    * payments.refunded_at/refund_amount 기록 (이미 환불됐으면 no-op)
--    * build_fee 환불이면 해당 결제로 지급된 initial_grant lot의 미사용 잔여를
--      admin_adjust 음수 원장으로 회수 (미사용분에 한해)
--    * PG 환불 API 호출은 애플리케이션(실모드 TODO)에서 별도 처리 — 이 함수는 원장 정합만
--    * 반환: { ok, already_refunded, clawed_back }
-- ----------------------------------------------------------------------------

create or replace function public.admin_refund_payment(
  p_payment_id uuid,
  p_amount     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id  uuid;
  v_type       text;
  v_refunded   timestamptz;
  v_lot_id     uuid;
  v_remaining  numeric := 0;
  v_clawed     numeric := 0;
begin
  select client_id, type, refunded_at
  into v_client_id, v_type, v_refunded
  from payments
  where id = p_payment_id
  for update;

  if v_client_id is null then
    raise exception 'admin_refund_payment: 결제를 찾을 수 없습니다 (%)', p_payment_id;
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'admin_refund_payment: p_amount는 0 이상이어야 합니다 (입력: %)', p_amount;
  end if;

  if v_refunded is not null then
    return jsonb_build_object('ok', true, 'already_refunded', true, 'clawed_back', 0);
  end if;

  update payments
  set refunded_at = now(), refund_amount = p_amount
  where id = p_payment_id;

  -- build_fee 환불: 이 결제로 지급된 initial_grant lot의 미사용 잔여 회수
  if v_type = 'build_fee' then
    perform lock_credit_balance(v_client_id);

    select id into v_lot_id
    from credit_ledger
    where client_id = v_client_id
      and reference_id = p_payment_id
      and reason = 'initial_grant'
      and amount > 0
    order by created_at asc
    limit 1;

    if v_lot_id is not null then
      v_remaining := credit_lot_remaining(v_client_id, v_lot_id);
      if v_remaining > 0 then
        insert into credit_ledger (client_id, amount, reason, reference_id)
        values (v_client_id, -v_remaining, 'admin_adjust', p_payment_id);

        update credit_balances
        set balance = balance - v_remaining, updated_at = now()
        where client_id = v_client_id;

        v_clawed := v_remaining;
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'already_refunded', false, 'clawed_back', v_clawed);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. RLS / 권한
-- ----------------------------------------------------------------------------

-- qa_automation_rules: service role 전용 (관리자 콘솔이 rpc/service role로 접근)
alter table public.qa_automation_rules enable row level security;
revoke all on table public.qa_automation_rules from anon, authenticated;
grant select on public.qa_approval_stats to service_role;

-- 신규 함수: service role 전용
revoke execute on function public.credit_lot_remaining(uuid, uuid)    from public, anon, authenticated;
revoke execute on function public.admin_refund_payment(uuid, numeric) from public, anon, authenticated;
grant  execute on function public.credit_lot_remaining(uuid, uuid)    to service_role;
grant  execute on function public.admin_refund_payment(uuid, numeric) to service_role;

-- ----------------------------------------------------------------------------
-- 9. Storage 버킷 (§5 export / §7 로고 업로드)
--    exports: 비공개 (service role 업로드 + signed URL 다운로드)
--    client-assets: 공개 (로고 등 — 공개 읽기, service role 업로드)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('client-assets', 'client-assets', true)
on conflict (id) do nothing;
