/**
 * [P1] 테넌트 페이지 시맨틱 셸 단일 소스 — 라이브 서빙(/s)과 정적 산출물(render-static)이 공유한다.
 * 헤더 내비 + <main>(시맨틱 아웃라인 + 사이트 렌더) + 법적 푸터. 순수 서버 컴포넌트(훅 0)라
 * React 트리(라이브)로도, renderToStaticMarkup(정적)으로도 동일 마크업을 낸다 → preflight 자가진단이
 * 라이브와 같은 문서를 채점(seo_h1·aeo_main_landmark·geo_business_info 오탐 제거).
 * JSON-LD <script>·정지 처리는 호출부(_shared)가 담당(head/상태 맥락이 달라 여기선 본문만).
 */
import type { MotionTier, SiteConfig } from '@/lib/types/site';
import { TenantHeader } from './TenantHeader';
import { SemanticOutline } from './SemanticOutline';
import { SiteRenderer } from './SiteRenderer';
import { LegalFooter } from './LegalFooter';
import type { MotionAssetProvenance } from '@/lib/motion/signatures';
import { buildSiteBeaconRuntime, SITE_EVENT_INGEST_PATH } from '@/lib/analytics/site-beacon';

export function TenantPageContent({
  config,
  pageSlug,
  siteId,
  tier,
  motionOwnerId,
  motionAssets,
  interactive,
  animate,
  hrefForSlug,
  privacyHref,
  termsHref,
  analyticsEndpoint,
  runtimeDelivery = 'client',
}: {
  config: SiteConfig;
  pageSlug: string;
  siteId?: string;
  tier?: MotionTier;
  /** before-after renderer를 위한 서버 권위 projection. 미지정은 fail-closed. */
  motionOwnerId?: string;
  motionAssets?: readonly MotionAssetProvenance[];
  /** 미지정 시 SiteRenderer 기본(true=실서빙). 정적/프리뷰는 명시 전달 */
  interactive?: boolean;
  animate?: boolean;
  /** 내비·정적 export 상대 링크 매핑(미지정=절대 '/slug') */
  hrefForSlug?: (slug: string) => string;
  /** 법적 페이지 링크(export는 상대 파일명, 미지정=서빙 '/privacy'·'/terms') */
  privacyHref?: string;
  termsHref?: string;
  /** 공개 발행본의 first-party 집계 엔드포인트. export는 반드시 절대 플랫폼 URL을 전달한다. */
  analyticsEndpoint?: string;
  /** App Router는 client, render-static은 inline을 명시한다. */
  runtimeDelivery?: 'inline' | 'client';
}) {
  const businessInfo = config.businessInfo ?? null;
  // A legacy config without business information has no reachable tenant
  // privacy page. Tracking therefore fails closed until the disclosure exists.
  const analyticsRuntime = siteId && businessInfo
    ? buildSiteBeaconRuntime({ siteId, endpoint: analyticsEndpoint ?? SITE_EVENT_INGEST_PATH })
    : null;
  return (
    <>
      {/* 페이지 ≥2 & nav 활성 시 자동 헤더 내비 (단일 페이지 사이트는 컴포넌트가 null) */}
      <TenantHeader config={config} currentSlug={pageSlug} hrefForSlug={hrefForSlug} />
      <main>
        {/* 화면 비표시 시맨틱 개요 — 크롤러·AI·스크린리더용 문서 구조(h1·헤딩 위계·목록) */}
        <SemanticOutline config={config} pageSlug={pageSlug} />
        <SiteRenderer
          config={config}
          mode="auto"
          siteId={siteId}
          pageSlug={pageSlug}
          tier={tier}
          motionOwnerId={motionOwnerId}
          motionAssets={motionAssets}
          interactive={interactive}
          animate={animate}
          runtimeDelivery={runtimeDelivery}
        />
      </main>
      {businessInfo ? (
        <LegalFooter info={businessInfo} theme={config.theme} privacyHref={privacyHref} termsHref={termsHref} />
      ) : null}
      {analyticsRuntime ? (
        <script
          type="module"
          data-daboim-site-beacon="1"
          dangerouslySetInnerHTML={{ __html: analyticsRuntime }}
        />
      ) : null}
    </>
  );
}
