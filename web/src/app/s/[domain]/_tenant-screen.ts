/**
 * 테넌트 기계판독 표면(llms.txt·sitemap.xml·robots.txt)의 공용 게이트.
 *
 * HTML은 `_shared.tsx:67`에서 fail-closed 되지만, 이 세 라우트는 site를 직접 조회해
 * 스크린을 거치지 않았다. 그래서 스크린에 걸린 발행본이 meta.description·페이지 제목·
 * 섹션 이름·포스트 제목(llms.txt), slug 기반 URL(sitemap.xml), `Allow: /` + `Sitemap:`
 * 광고(robots.txt)로 계속 새어나갔다. 정책이 지키려던 바로 그 표면이다.
 *
 * `_shared.tsx:67` screens `policy.config`, and the projection can only remove screened
 * text (`lib/assets/assignment-core.ts:594-635` deletes ogImage, swaps screened image
 * elements, drops motion scenes). This helper is therefore strictly more conservative:
 * a site whose sole violation lives in an alt or a motion scene the projection drops
 * will serve HTML while these three surfaces close. That is the right direction for a
 * leak gate, and not worth pulling an async, `cache()`-scoped `resolveSiteAssetPolicy`
 * into three static text routes to erase. Both call sites re-derive at request time and
 * are due to branch on a stored decision when human review lands.
 */
import type { Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';

/** 발행본이 실재하고 정지 상태가 아님이 확정된 Site. */
export type PublishedSite = Site & { siteConfig: SiteConfig };

export type TenantScreenVerdict =
  | { serve: true; site: PublishedSite }
  | { serve: false; reason: 'unpublished' | 'screen-failed' };

/**
 * 스크린 대상은 저장된 `site.siteConfig`(발행본)이며, 에셋 정책 프로젝션이 아니다.
 * 세 라우트 모두 verdict.serve가 false면 HTML과 동일하게 닫는다.
 */
export function tenantScreenVerdict(site: Site | null): TenantScreenVerdict {
  if (!site?.siteConfig || site.status === 'suspended') {
    return { serve: false, reason: 'unpublished' };
  }
  if (!screenMedicalSiteConfig(site.siteConfig).ok) {
    return { serve: false, reason: 'screen-failed' };
  }
  return { serve: true, site: site as PublishedSite };
}
