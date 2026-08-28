/**
 * [P1] 테넌트 페이지 시맨틱 셸 단일 소스 — 라이브 서빙(/s)과 정적 산출물(render-static)이 공유한다.
 * 헤더 내비 + <main>(시맨틱 아웃라인 + 사이트 렌더) + 법적 푸터. 순수 서버 컴포넌트(훅 0)라
 * React 트리(라이브)로도, renderToStaticMarkup(정적)으로도 동일 마크업을 낸다 → preflight 자가진단이
 * 라이브와 같은 문서를 채점(seo_h1·aeo_main_landmark·geo_business_info 오탐 제거).
 * JSON-LD <script>·정지 처리는 호출부(_shared)가 담당(head/상태 맥락이 달라 여기선 본문만).
 */
import type { MotionTier, SiteConfig } from '@/lib/types/site';
import { TenantHeader } from './TenantHeader';
import { MarqueeUtilityStrip } from './ClinicMarquee';
import { LedgerHeaderRuntime, LedgerMicroBar } from './ClinicLedger';
import { SemanticOutline } from './SemanticOutline';
import { SiteRenderer } from './SiteRenderer';
import { LegalFooter } from './LegalFooter';
import type { MotionAssetProvenance } from '@/lib/motion/signatures';
import { buildSiteBeaconRuntime, SITE_EVENT_INGEST_PATH } from '@/lib/analytics/site-beacon';
import { projectAuthoritativePublicContact } from '@/lib/seo/public-contact';
import { resolvePublicContact } from '@/lib/seo/public-contact';
import { PublicContactBar } from './PublicContactBar';
import type { TenantNavigationItem } from './TenantHeader';
import type { ClinicMasterExperience } from '@/lib/clinic-master/live-contract';
import { US_ANONYMOUS_TRACKING_ENABLED } from '@/lib/legal/templates';

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
  additionalNavItems,
  privacyHref,
  termsHref,
  analyticsEndpoint,
  runtimeDelivery = 'client',
  clinicExperience,
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
  /** published 별도 표면(예: 블로그)이 실제 있을 때만 전달한다. */
  additionalNavItems?: readonly TenantNavigationItem[];
  /** 법적 페이지 링크(export는 상대 파일명, 미지정=서빙 '/privacy'·'/terms') */
  privacyHref?: string;
  termsHref?: string;
  /** 공개 발행본의 first-party 집계 엔드포인트. export는 반드시 절대 플랫폼 URL을 전달한다. */
  analyticsEndpoint?: string;
  /** App Router는 client, render-static은 inline을 명시한다. */
  runtimeDelivery?: 'inline' | 'client';
  /** Private CLINIC preview/live projection; never persisted inside SiteConfig. */
  clinicExperience?: ClinicMasterExperience;
}) {
  const renderedConfig = projectAuthoritativePublicContact(config);
  const businessInfo = config.businessInfo ?? null;
  const publicContact = resolvePublicContact(renderedConfig);
  // US measurement is a reviewed fleet release. The non-US legacy branch keeps
  // its existing business-information disclosure boundary byte-for-byte.
  const analyticsRuntime = config.meta.locale === 'en-US'
    ? siteId && US_ANONYMOUS_TRACKING_ENABLED
      ? buildSiteBeaconRuntime({
          siteId,
          endpoint: analyticsEndpoint ?? SITE_EVENT_INGEST_PATH,
          locale: 'en-US',
          bookingHref: config.connectors?.items.find((item) => item.id === 'booking')?.href,
        })
      : null
    : siteId && businessInfo
      ? buildSiteBeaconRuntime({ siteId, endpoint: analyticsEndpoint ?? SITE_EVENT_INGEST_PATH })
      : null;
  return (
    <>
      {/*
        MARQUEE's header is two elements, not one: a brand-coloured utility strip above the sticky
        bar. They are siblings rather than one component because the strip is a document-flow band
        that scrolls away while the bar sticks — folding them together would make the bar's own
        stickiness a property of the strip. Renders null on every other language.
      */}
      <MarqueeUtilityStrip config={renderedConfig} />
      {/*
        LEDGER's header is two elements for the same reason and with the opposite motion: a --panel
        micro-bar in document flow above the sticky white bar, which COLLAPSES to zero height on
        scroll rather than merely scrolling away. Renders null on every other language.
      */}
      <LedgerMicroBar config={renderedConfig} />
      {/* 페이지 ≥2 & nav 활성 시 자동 헤더 내비 (단일 페이지 사이트는 컴포넌트가 null) */}
      <TenantHeader
        config={renderedConfig}
        currentSlug={pageSlug}
        hrefForSlug={hrefForSlug}
        additionalItems={additionalNavItems}
      />
      <main>
        {/* Clinic flow owns visible semantics. Legacy canvas sites retain the byte-identical mirror. */}
        {!renderedConfig.clinicMaster ? (
          <SemanticOutline config={renderedConfig} pageSlug={pageSlug} />
        ) : null}
        <SiteRenderer
          config={renderedConfig}
          mode="auto"
          siteId={siteId}
          pageSlug={pageSlug}
          tier={tier}
          motionOwnerId={motionOwnerId}
          motionAssets={motionAssets}
          interactive={interactive}
          animate={animate}
          runtimeDelivery={runtimeDelivery}
          clinicExperience={clinicExperience}
          hrefForPageSlug={hrefForSlug}
        />
      </main>
      {!businessInfo && publicContact ? (
        <PublicContactBar
          contact={publicContact}
          theme={config.theme}
          locale={config.meta.locale}
        />
      ) : null}
      {businessInfo ? (
        <LegalFooter
          info={businessInfo}
          theme={config.theme}
          locale={config.meta.locale}
          privacyHref={privacyHref}
          termsHref={termsHref}
        />
      ) : null}
      {/*
        The collapse's observer, emitted after the document it observes and only for the one
        language that has a scroll state. Every other language ships zero bytes here.
      */}
      <LedgerHeaderRuntime config={renderedConfig} />
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
