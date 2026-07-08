-- ============================================================================
-- 0001_init.sql — 아낙스랩스 멀티테넌트 초기 스키마
--
-- 원칙 (CLAUDE.md 불변식):
--  * 크레딧 잔액 직접 UPDATE 금지 — credit_ledger append가 원본(source of truth),
--    credit_balances는 캐시. 모든 변동은 아래 SQL 함수 경유.
--  * 금액/크레딧은 numeric (float 금지). 시각은 전부 timestamptz.
--  * 모든 테넌트 테이블 RLS: client_id = auth.uid(). 관리자는 service role.
--  * ledger/balances/payments는 어떤 API role도 직접 INSERT/UPDATE/DELETE 불가
--    (service_role은 BYPASSRLS이므로 테이블 권한 회수로 차단) — 함수 경유만.
--
-- TS 계약과 동기 유지 (값 변경 시 양쪽 함께 수정):
--  * web/src/lib/types/domain.ts  — 컬럼/체크 목록 1:1
--  * web/src/lib/credits/constants.ts — CREDIT_COSTS, INITIAL_GRANT, CREDIT_EXPIRY_DAYS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 테이블
-- ----------------------------------------------------------------------------

-- 고객(사업자). auth.users와 1:1 — id = auth.users.id
create table public.clients (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null,
  email         text not null,
  auth_provider text not null check (auth_provider in ('kakao', 'google', 'email')),
  tier          text not null default 'basic' check (tier in ('basic', 'premium')),
  status        text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at    timestamptz not null default now()
);

comment on table public.clients is '최종 고객(사업자). auth.users 1:1. 내부 운영진은 service role로 구분';

-- 고객 사이트. site_config = 발행본(라이브 서빙), draft_config = 에디터 초안
create table public.sites (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients (id) on delete cascade,
  name                   text not null,
  -- subdomain이면 전체 호스트(xxx.anakslabs.com), custom이면 고객 도메인
  domain                 text unique,
  domain_type            text not null default 'subdomain' check (domain_type in ('subdomain', 'custom')),
  dns_verified           boolean not null default false,
  cloudflare_hostname_id text,
  status                 text not null default 'draft'
                         check (status in ('draft', 'building', 'live', 'pending_dns', 'suspended')),
  site_config            jsonb,        -- 발행본 (SiteConfig)
  draft_config           jsonb,        -- 초안 (SiteConfig)
  survey                 jsonb,        -- 온보딩 설문 (SurveyInput)
  published_at           timestamptz,
  created_at             timestamptz not null default now()
);

comment on column public.sites.site_config is '발행본 SiteConfig(jsonb) — 멀티테넌트 렌더러 서빙 대상';
comment on column public.sites.draft_config is '에디터 자동저장 초안 — publish 시 site_config로 복사';

-- 크레딧 잔액 캐시. 원본은 credit_ledger — 직접 쓰기 금지, 함수 경유만
create table public.credit_balances (
  client_id  uuid primary key references public.clients (id) on delete cascade,
  balance    numeric not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- 크레딧 원장 (source of truth). 양수 = 지급 lot, 음수 = 차감/만료 상쇄
create table public.credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  amount          numeric not null check (amount <> 0),
  reason          text not null check (reason in (
                    'initial_grant', 'purchase',
                    'edit_text', 'edit_image', 'edit_video', 'edit_structure',
                    'refund', 'expired', 'admin_adjust'
                  )),
  -- edit_requests.id / payments.id / (expired 행은 상쇄 대상 지급 lot의 credit_ledger.id)
  reference_id    uuid,
  -- 지급(양수) 행만: 만료 시각. 차감 행은 null
  expires_at      timestamptz,
  -- 중복 지급 방지 키 (예: 'initial_grant:<payment_key>')
  idempotency_key text,
  created_at      timestamptz not null default now(),
  constraint credit_ledger_expiry_only_on_grants check (expires_at is null or amount > 0),
  constraint credit_ledger_expired_is_negative   check (reason <> 'expired' or amount < 0)
);

-- unique nulls not distinct 대신 부분 유니크 인덱스 (null 키는 자유 삽입)
create unique index credit_ledger_idempotency_key_uidx
  on public.credit_ledger (idempotency_key)
  where idempotency_key is not null;

-- 편집 요청 (제출 시 선차감, 반려 시 refund)
create table public.edit_requests (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  site_id           uuid not null references public.sites (id) on delete cascade,
  type              text not null check (type in ('text', 'image', 'video', 'structure')),
  credit_cost       numeric not null check (credit_cost >= 0),
  status            text not null default 'pending'
                    check (status in ('pending', 'ai_processing', 'qa_review', 'applied', 'rejected')),
  requested_content text not null,
  ai_output         jsonb,
  created_at        timestamptz not null default now(),
  applied_at        timestamptz
);

-- 결제 기록. provider_payment_key = PG 웹훅 멱등성 기준
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients (id) on delete cascade,
  type                 text not null check (type in ('build_fee', 'maintenance_subscription', 'credit_pack')),
  amount               numeric not null check (amount >= 0),   -- KRW
  credits_granted      numeric not null default 0 check (credits_granted >= 0),
  provider_payment_key text unique,
  created_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. 인덱스
-- ----------------------------------------------------------------------------

create index credit_ledger_client_created_idx on public.credit_ledger (client_id, created_at);
create index credit_ledger_reference_idx      on public.credit_ledger (reference_id) where reference_id is not null;
-- 만료 배치 후보 스캔용
create index credit_ledger_expiring_lots_idx  on public.credit_ledger (expires_at) where expires_at is not null;
create index sites_client_idx                 on public.sites (client_id);
-- sites(domain)은 unique 제약으로 인덱스 자동 생성됨
create index edit_requests_status_idx         on public.edit_requests (status);
create index edit_requests_client_idx         on public.edit_requests (client_id, created_at desc);
create index edit_requests_site_idx           on public.edit_requests (site_id);
create index payments_client_idx              on public.payments (client_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. sites 보호 컬럼 가드 트리거
--    고객(authenticated)은 name / draft_config / survey 만 수정 가능.
--    나머지(domain, status, site_config, published_at 등)는 service role 전용.
--    주의: security invoker여야 current_user가 호출 role을 반영한다.
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
    then
      raise exception 'sites: 고객은 name/draft_config/survey만 수정할 수 있습니다'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger sites_guard_protected_columns
  before update on public.sites
  for each row execute function public.guard_site_protected_columns();

-- ----------------------------------------------------------------------------
-- 4. 크레딧/결제 SQL 함수 (전부 security definer + search_path 고정)
--
-- 잠금 규약: 클라이언트별 credit_balances 행을 FOR UPDATE로 잡아
-- 지급/차감/만료를 직렬화한다. 잔액 갱신은 반드시 원장 insert와 같은 트랜잭션.
-- ----------------------------------------------------------------------------

-- 잔액 행 보장 + 행 잠금 (내부 헬퍼)
create or replace function public.lock_credit_balance(p_client_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance numeric;
begin
  insert into credit_balances (client_id, balance)
  values (p_client_id, 0)
  on conflict (client_id) do nothing;

  select balance into v_balance
  from credit_balances
  where client_id = p_client_id
  for update;

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- grant_credits: 크레딧 지급 (idempotency_key 중복이면 no-op)
--  * p_expires_days가 null이면 무만료 lot (관리자 조정 등에서 명시적으로만 사용 권장)
--  * TS 계약: CreditsService.grant — 만료일 계산은 서비스가 CREDIT_EXPIRY_DAYS 기반으로 전달
-- ---------------------------------------------------------------------------
create or replace function public.grant_credits(
  p_client_id       uuid,
  p_amount          numeric,
  p_reason          text,
  p_reference_id    uuid    default null,
  p_idempotency_key text    default null,
  p_expires_days    integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant_credits: p_amount는 양수여야 합니다 (입력: %)', p_amount;
  end if;

  perform lock_credit_balance(p_client_id);

  insert into credit_ledger (client_id, amount, reason, reference_id, expires_at, idempotency_key)
  values (
    p_client_id,
    p_amount,
    p_reason,
    p_reference_id,
    case when p_expires_days is not null then now() + make_interval(days => p_expires_days) end,
    p_idempotency_key
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return; -- idempotency_key 중복 — 이미 지급됨, no-op
  end if;

  update credit_balances
  set balance = balance + p_amount, updated_at = now()
  where client_id = p_client_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- expire_client_credits: 단일 고객의 만료 지난 지급 lot 잔여분을 'expired'로 상쇄
--
-- lot별 잔여 재구성 = 원장 시간순 리플레이 (mock MockCreditsService와 동일 정책):
--   원장을 created_at 순으로 순회하며
--     * 양수 행           → lot 생성 (잔여 = amount)
--     * 'expired' 음수 행 → reference_id가 가리키는 lot 잔여에서 직접 차감
--     * 그 외 음수 행(소진) → "그 시점에 존재하는" lot에만 FIFO(expires_at asc nulls last) 배분
--   → 소진이 발생 이후에 생긴 lot으로 소급 귀속되지 않는다.
--     (전체 소진량을 모든 lot에 일괄 배분하면, 소진 뒤에 지급된 단만료 lot에 과거 소진이
--      귀속되어 이미 소진된 크레딧이 '부활'하는 버그 — 감사 지적 사항)
--   만료 지난 lot의 잔여 > 0 이면 -잔여 'expired' 행 삽입.
-- 멱등: expired 행이 리플레이에서 lot 잔여를 직접 줄이므로 재실행 시 잔여 0 → no-op.
-- ---------------------------------------------------------------------------
create or replace function public.expire_client_credits(
  p_client_id uuid,
  p_now       timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_row   record;
  v_lot   record;
  v_need  numeric;
  v_alloc numeric;
begin
  perform lock_credit_balance(p_client_id);

  -- 리플레이용 임시 lot 테이블 (같은 트랜잭션 내 재호출 대비 truncate)
  create temp table if not exists _anaks_lot_replay (
    seq        bigint generated always as identity,
    lot_id     uuid,
    expires_at timestamptz,
    remaining  numeric
  ) on commit drop;
  truncate _anaks_lot_replay;

  for v_row in
    select id, amount, reason, reference_id, expires_at
    from credit_ledger
    where client_id = p_client_id
    order by created_at asc, id asc
  loop
    if v_row.amount > 0 then
      -- 지급 lot 생성
      insert into _anaks_lot_replay (lot_id, expires_at, remaining)
      values (v_row.id, v_row.expires_at, v_row.amount);
    elsif v_row.reason = 'expired' then
      -- 만료 상쇄 — 대상 lot 잔여에서 직접 차감 (v_row.amount는 음수)
      update _anaks_lot_replay
      set remaining = greatest(0, remaining + v_row.amount)
      where lot_id = v_row.reference_id;
    else
      -- 소진 — 이 시점까지 생성된 lot에만 FIFO(만료 임박 순) 배분
      v_need := -v_row.amount;
      for v_lot in
        select seq, remaining
        from _anaks_lot_replay
        where remaining > 0
        order by expires_at asc nulls last, seq asc
      loop
        exit when v_need <= 0;
        v_alloc := least(v_lot.remaining, v_need);
        update _anaks_lot_replay set remaining = remaining - v_alloc where seq = v_lot.seq;
        v_need := v_need - v_alloc;
      end loop;
    end if;
  end loop;

  -- 만료 지난 lot의 잔여분 상쇄
  for v_lot in
    select lot_id, remaining
    from _anaks_lot_replay
    where remaining > 0
      and expires_at is not null
      and expires_at <= p_now
    order by seq asc
  loop
    insert into credit_ledger (client_id, amount, reason, reference_id)
    values (p_client_id, -v_lot.remaining, 'expired', v_lot.lot_id);

    update credit_balances
    set balance = balance - v_lot.remaining, updated_at = now()
    where client_id = p_client_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- consume_credits: 크레딧 차감 (원자적)
--  * 잔액 행 FOR UPDATE 잠금 → 만료분 선상쇄 → 잔액 검증 → 원장 음수 기록 + 잔액 갱신
--  * 부족 시 exception 'insufficient_credits' — 어떤 기록도 남지 않음(트랜잭션 롤백)
--  * 소진의 lot 귀속은 expire_client_credits의 FIFO 재구성으로 보장
--  * 반환: 차감 후 잔액
-- ---------------------------------------------------------------------------
create or replace function public.consume_credits(
  p_client_id    uuid,
  p_amount       numeric,
  p_reason       text,
  p_reference_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'consume_credits: p_amount는 양수여야 합니다 (입력: %)', p_amount;
  end if;

  perform lock_credit_balance(p_client_id);

  -- 만료 시각이 지났지만 아직 배치가 안 돈 lot을 먼저 상쇄 (만료 크레딧 소진 방지)
  perform expire_client_credits(p_client_id, now());

  select balance into v_balance
  from credit_balances
  where client_id = p_client_id;

  if v_balance < p_amount then
    raise exception 'insufficient_credits'
      using errcode = 'P0001',
            detail  = format('balance=%s, requested=%s', v_balance, p_amount),
            hint    = '크레딧 팩 구매가 필요합니다';
  end if;

  insert into credit_ledger (client_id, amount, reason, reference_id)
  values (p_client_id, -p_amount, p_reason, p_reference_id);

  update credit_balances
  set balance = balance - p_amount, updated_at = now()
  where client_id = p_client_id
  returning balance into v_balance;

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- expire_credits: 전 고객 만료 배치 (매일 cron). 상쇄한 lot 수 반환. 멱등.
-- ---------------------------------------------------------------------------
create or replace function public.expire_credits(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total  integer := 0;
  v_client uuid;
begin
  for v_client in
    select distinct client_id
    from credit_ledger
    where amount > 0
      and expires_at is not null
      and expires_at <= p_now
  loop
    v_total := v_total + expire_client_credits(v_client, p_now);
  end loop;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- refund_credits: reference_id(edit_requests.id)로 차감분을 찾아 +환불 (멱등)
--  * 환불 lot 만료 365일 = CREDIT_EXPIRY_DAYS.refund
--  * 반환: 환불된 크레딧 수 (차감 이력 없거나 이미 환불됐으면 0)
-- ---------------------------------------------------------------------------
create or replace function public.refund_credits(
  p_client_id    uuid,
  p_reference_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_consumed        numeric;
  v_already_refunded boolean;
begin
  perform lock_credit_balance(p_client_id);

  select coalesce(-sum(amount), 0)
  into v_consumed
  from credit_ledger
  where client_id = p_client_id
    and reference_id = p_reference_id
    and amount < 0
    and reason <> 'expired';

  if v_consumed <= 0 then
    return 0;
  end if;

  select exists (
    select 1 from credit_ledger
    where idempotency_key = 'refund:' || p_reference_id::text
  ) into v_already_refunded;

  if v_already_refunded then
    return 0;
  end if;

  perform grant_credits(
    p_client_id,
    v_consumed,
    'refund',
    p_reference_id,
    'refund:' || p_reference_id::text,
    365  -- CREDIT_EXPIRY_DAYS.refund
  );

  return v_consumed;
end;
$$;

-- ---------------------------------------------------------------------------
-- handle_build_fee_payment: 빌드비 웹훅 처리 (멱등 — provider_payment_key 기준)
--  * payments insert (충돌 시 전체 no-op) + clients.tier 반영
--    + tier별 INITIAL_GRANT (basic 1 / premium 3, 만료 180일) 지급까지 단일 트랜잭션
--  * 값 동기: web/src/lib/credits/constants.ts (INITIAL_GRANT, CREDIT_EXPIRY_DAYS.initial_grant)
--  * 반환: { processed, duplicated, payment_id?, credits_granted? }
-- ---------------------------------------------------------------------------
create or replace function public.handle_build_fee_payment(
  p_client_id            uuid,
  p_provider_payment_key text,
  p_amount               numeric,
  p_tier                 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
  v_credits    numeric;
begin
  if p_provider_payment_key is null or btrim(p_provider_payment_key) = '' then
    raise exception 'handle_build_fee_payment: provider_payment_key는 필수입니다';
  end if;
  if p_tier not in ('basic', 'premium') then
    raise exception 'handle_build_fee_payment: 알 수 없는 tier (%)', p_tier;
  end if;

  v_credits := case p_tier when 'basic' then 1 when 'premium' then 3 end;

  insert into payments (client_id, type, amount, credits_granted, provider_payment_key)
  values (p_client_id, 'build_fee', p_amount, v_credits, p_provider_payment_key)
  on conflict (provider_payment_key) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    return jsonb_build_object('processed', false, 'duplicated', true);
  end if;

  update clients set tier = p_tier where id = p_client_id;

  perform grant_credits(
    p_client_id,
    v_credits,
    'initial_grant',
    v_payment_id,
    'initial_grant:' || p_provider_payment_key,
    180  -- CREDIT_EXPIRY_DAYS.initial_grant
  );

  return jsonb_build_object(
    'processed', true,
    'duplicated', false,
    'payment_id', v_payment_id,
    'credits_granted', v_credits
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- handle_credit_pack_payment: 크레딧 팩 웹훅 처리 (멱등)
--  * payments insert + 구매 크레딧 지급 (만료 365일 = CREDIT_EXPIRY_DAYS.purchase)
-- ---------------------------------------------------------------------------
create or replace function public.handle_credit_pack_payment(
  p_client_id            uuid,
  p_provider_payment_key text,
  p_amount               numeric,
  p_credits              numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
begin
  if p_provider_payment_key is null or btrim(p_provider_payment_key) = '' then
    raise exception 'handle_credit_pack_payment: provider_payment_key는 필수입니다';
  end if;
  if p_credits is null or p_credits <= 0 then
    raise exception 'handle_credit_pack_payment: p_credits는 양수여야 합니다 (입력: %)', p_credits;
  end if;

  insert into payments (client_id, type, amount, credits_granted, provider_payment_key)
  values (p_client_id, 'credit_pack', p_amount, p_credits, p_provider_payment_key)
  on conflict (provider_payment_key) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    return jsonb_build_object('processed', false, 'duplicated', true);
  end if;

  perform grant_credits(
    p_client_id,
    p_credits,
    'purchase',
    v_payment_id,
    'purchase:' || p_provider_payment_key,
    365  -- CREDIT_EXPIRY_DAYS.purchase
  );

  return jsonb_build_object(
    'processed', true,
    'duplicated', false,
    'payment_id', v_payment_id,
    'credits_granted', p_credits
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- handle_maintenance_payment: 유지보수 구독 결제 기록 (멱등, 크레딧 없음)
-- ---------------------------------------------------------------------------
create or replace function public.handle_maintenance_payment(
  p_client_id            uuid,
  p_provider_payment_key text,
  p_amount               numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
begin
  if p_provider_payment_key is null or btrim(p_provider_payment_key) = '' then
    raise exception 'handle_maintenance_payment: provider_payment_key는 필수입니다';
  end if;

  insert into payments (client_id, type, amount, credits_granted, provider_payment_key)
  values (p_client_id, 'maintenance_subscription', p_amount, 0, p_provider_payment_key)
  on conflict (provider_payment_key) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    return jsonb_build_object('processed', false, 'duplicated', true);
  end if;

  return jsonb_build_object('processed', true, 'duplicated', false, 'payment_id', v_payment_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------

alter table public.clients         enable row level security;
alter table public.sites           enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger   enable row level security;
alter table public.edit_requests   enable row level security;
alter table public.payments        enable row level security;

-- clients: 본인 행 조회만 (쓰기는 service role 전용)
create policy clients_select_own on public.clients
  for select to authenticated
  using (id = auth.uid());

-- sites: 본인 것 select / update (보호 컬럼은 트리거가 가드)
create policy sites_select_own on public.sites
  for select to authenticated
  using (client_id = auth.uid());

create policy sites_update_own on public.sites
  for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- credit_balances / credit_ledger / payments: 본인 것 조회만
create policy credit_balances_select_own on public.credit_balances
  for select to authenticated
  using (client_id = auth.uid());

create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated
  using (client_id = auth.uid());

create policy payments_select_own on public.payments
  for select to authenticated
  using (client_id = auth.uid());

-- edit_requests: 본인 것 select / insert (신규는 pending, 비용은 고정 단가와 일치해야 함)
create policy edit_requests_select_own on public.edit_requests
  for select to authenticated
  using (client_id = auth.uid());

create policy edit_requests_insert_own on public.edit_requests
  for insert to authenticated
  with check (
    client_id = auth.uid()
    and status = 'pending'
    and ai_output is null
    and applied_at is null
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
-- 6. 권한 (GRANT/REVOKE)
--    service_role은 BYPASSRLS이므로 금전 테이블은 테이블 권한 자체를 회수해
--    "어떤 role도 직접 쓰기 불가 — security definer 함수 경유만"을 강제한다.
-- ----------------------------------------------------------------------------

revoke all on table public.credit_ledger   from anon, authenticated, service_role;
revoke all on table public.credit_balances from anon, authenticated, service_role;
revoke all on table public.payments        from anon, authenticated, service_role;

grant select on table public.credit_ledger   to authenticated, service_role;
grant select on table public.credit_balances to authenticated, service_role;
grant select on table public.payments        to authenticated, service_role;

-- anon은 테넌트 테이블 접근 불필요 (공개 렌더링은 서버에서 service role로 조회)
revoke all on table public.clients       from anon;
revoke all on table public.sites         from anon;
revoke all on table public.edit_requests from anon;

-- 크레딧/결제 함수: 서버(service_role) 전용 — 클라이언트 직접 호출 금지
revoke execute on function public.lock_credit_balance(uuid)                              from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, numeric, text, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.consume_credits(uuid, numeric, text, uuid)             from public, anon, authenticated;
revoke execute on function public.expire_client_credits(uuid, timestamptz)               from public, anon, authenticated;
revoke execute on function public.expire_credits(timestamptz)                            from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, uuid)                             from public, anon, authenticated;
revoke execute on function public.handle_build_fee_payment(uuid, text, numeric, text)    from public, anon, authenticated;
revoke execute on function public.handle_credit_pack_payment(uuid, text, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.handle_maintenance_payment(uuid, text, numeric)        from public, anon, authenticated;

grant execute on function public.grant_credits(uuid, numeric, text, uuid, text, integer) to service_role;
grant execute on function public.consume_credits(uuid, numeric, text, uuid)              to service_role;
grant execute on function public.expire_client_credits(uuid, timestamptz)                to service_role;
grant execute on function public.expire_credits(timestamptz)                             to service_role;
grant execute on function public.refund_credits(uuid, uuid)                              to service_role;
grant execute on function public.handle_build_fee_payment(uuid, text, numeric, text)     to service_role;
grant execute on function public.handle_credit_pack_payment(uuid, text, numeric, numeric) to service_role;
grant execute on function public.handle_maintenance_payment(uuid, text, numeric)         to service_role;
