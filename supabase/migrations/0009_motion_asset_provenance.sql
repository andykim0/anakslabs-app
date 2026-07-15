-- ============================================================================
-- 0009_motion_asset_provenance.sql — 고객 실사 before/after 자산의 증거 원장
--
-- 공개 URL은 표시 수단일 뿐 소유권·진위의 증거가 아니다. 영상/모션 처리 전에 서버가
-- 아래 레코드를 asset id로 조회해 소유자·사이트·동일 case·권리 확인·비합성 여부를
-- fail-closed로 검증한다. 사이트 생성 전 업로드는 site_id=null로 기록한 뒤 소유 사이트에
-- 한 번 바인딩할 수 있다. 쓰기는 service role만, 고객은 본인 레코드 조회만 허용한다.
-- ============================================================================

create table if not exists public.motion_asset_provenance (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients (id) on delete cascade,
  site_id               uuid references public.sites (id) on delete set null,
  object_path           text not null unique,
  public_url            text not null,
  mime_type             text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  width                  integer not null check (width > 0),
  height                 integer not null check (height > 0),
  source                 text not null default 'customer-upload'
                         check (source = 'customer-upload'),
  ai_generated           boolean not null default false check (ai_generated = false),
  generative_edited      boolean not null default false check (generative_edited = false),
  case_id                text not null check (length(btrim(case_id)) between 1 and 120),
  usage_context          text not null
                         check (usage_context in ('beauty', 'remodeling', 'medical', 'other')),
  rights_attested        boolean not null,
  same_case_attested     boolean not null,
  attested_at            timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

create index if not exists motion_asset_provenance_client_idx
  on public.motion_asset_provenance (client_id, created_at desc);
create index if not exists motion_asset_provenance_site_idx
  on public.motion_asset_provenance (site_id, created_at desc)
  where site_id is not null;
create index if not exists motion_asset_provenance_case_idx
  on public.motion_asset_provenance (client_id, case_id);

-- service role도 잘못된 client/site 조합을 만들 수 없도록 DB에서 한 번 더 강제한다.
create or replace function public.guard_motion_asset_site_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.site_id is not null and not exists (
    select 1
    from public.sites s
    where s.id = new.site_id
      and s.client_id = new.client_id
  ) then
    raise exception 'motion asset site must belong to client';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_motion_asset_site_owner on public.motion_asset_provenance;
create trigger trg_motion_asset_site_owner
before insert or update of client_id, site_id on public.motion_asset_provenance
for each row execute function public.guard_motion_asset_site_owner();

alter table public.motion_asset_provenance enable row level security;

create policy motion_asset_provenance_select_own on public.motion_asset_provenance
  for select to authenticated
  using (client_id = auth.uid());

revoke all on table public.motion_asset_provenance from anon, authenticated;
grant select on table public.motion_asset_provenance to authenticated;
grant select, insert, update, delete on table public.motion_asset_provenance to service_role;
