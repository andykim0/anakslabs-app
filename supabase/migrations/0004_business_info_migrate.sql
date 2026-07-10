-- ============================================================================
-- 0004_business_info_migrate.sql — [v3 Phase 4] 사업자정보 사이트 단위 이관
--
-- v2는 사업자정보를 clients.business_info(고객 단위, v2 필드명)에 저장했다.
-- v3 계약은 SiteConfig.businessInfo(사이트 단위, v3 필드명) — 이 마이그레이션이
-- 기존 데이터를 해당 client 소유 사이트들의 site_config/draft_config로 복사한다.
--
-- 필드명 매핑 (v2 → v3):
--   legalName      → businessName
--   representative → ownerName
--   bizRegNo       → businessNumber
--   ecommerceRegNo → mailOrderNumber
--   address/phone/email 동일
--
-- 정책: 이미 businessInfo가 있는 config는 건드리지 않는다(idempotent).
--       clients.business_info 컬럼은 유지(롤백 여지)하되 deprecated로 주석.
-- ============================================================================

-- v2 → v3 필드명 변환 헬퍼 (이 마이그레이션 전용, 마지막에 drop)
create or replace function pg_temp.v2_biz_to_v3(v2 jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'businessName',    v2->>'legalName',
      'ownerName',       v2->>'representative',
      'businessNumber',  v2->>'bizRegNo',
      'address',         v2->>'address',
      'phone',           v2->>'phone',
      'email',           v2->>'email',
      'mailOrderNumber', v2->>'ecommerceRegNo'
    )
  );
$$;

-- 발행본(site_config)에 주입 — businessInfo 미보유 + 필수(ownerName/phone) 존재 시에만
update public.sites s
set site_config = jsonb_set(s.site_config, '{businessInfo}', pg_temp.v2_biz_to_v3(c.business_info))
from public.clients c
where c.id = s.client_id
  and c.business_info is not null
  and c.business_info ? 'representative'
  and c.business_info ? 'phone'
  and s.site_config is not null
  and s.site_config->'businessInfo' is null;

-- 초안(draft_config)에도 동일 주입 — 에디터가 열었을 때 사업자정보가 채워져 있도록
update public.sites s
set draft_config = jsonb_set(s.draft_config, '{businessInfo}', pg_temp.v2_biz_to_v3(c.business_info))
from public.clients c
where c.id = s.client_id
  and c.business_info is not null
  and c.business_info ? 'representative'
  and c.business_info ? 'phone'
  and s.draft_config is not null
  and s.draft_config->'businessInfo' is null;

-- 컬럼은 유지 (롤백 여지) — 신규 쓰기 경로는 v3에서 제거됨
comment on column public.clients.business_info is
  '[deprecated v3 Phase 4] 사업자정보는 sites.site_config/draft_config의 businessInfo(사이트 단위)로 이관됨. 쓰기 경로 없음 — 롤백 대비 보존.';
