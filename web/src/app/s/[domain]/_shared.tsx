/**
 * [v4] 테넌트 서빙 공통 로직 — 홈(page.tsx)과 서브페이지([...path]/page.tsx)가 공유.
 * (파일명 '_' 접두 = Next App Router 비라우트 private 모듈)
 *
 * 발행본(siteConfig)만 서빙. 메타데이터·JSON-LD·시맨틱 아웃라인·법적 푸터·정지 처리 동일 흐름.
 */
import type { Metadata } from 'next';
import { cache } from 'react';
import type { Site } from '@/lib/types/domain';
import { findPage } from '@/lib/types/site';
import { getDataServices } from '@/lib/data';
import { SuspendedNotice, TenantPageContent } from '@/components/site-renderer';
import { resolveStoredBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
// [S-batch] canonical·JSON-LD 단일 소스 — 정적 발행물(render-static)과 동일 함수 공유
import { canonicalUrlFor, jsonLdScriptContent, siteUrlOf } from '@/lib/seo/structured-data';
import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';

export { siteUrlOf };

function absoluteMediaUrl(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, `${baseUrl.replace(/\/+$/, '')}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * generateMetadata + page 중복 조회와 provenance audit를 함께 dedupe한다.
 * React cache는 Metadata/Page/Server Component 사이의 같은 요청 데이터를 공유하므로,
 * OG metadata와 본문이 반드시 같은 audited config projection을 소비한다.
 */
export const getSiteByDomain = cache(async (rawDomain: string): Promise<Site | null> => {
  let domain: string;
  try {
    domain = decodeURIComponent(rawDomain).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!domain) return null;
  const site = await getDataServices().sites.getByDomain(domain);
  if (!site?.siteConfig) return site;

  const policy = await resolveSiteAssetPolicy({
    operation: 'audit',
    config: site.siteConfig,
    clientId: site.clientId,
    siteId: site.id,
    assetPolicyVersion: site.assetPolicyVersion,
    phase: 'render',
  });

  // Legacy-bypass/observe preserve the original object and exact DOM contract.
  // Enforced v2 sites receive the server-projected config with honest fallbacks.
  const projectedSite = policy.config === site.siteConfig
    ? site
    : { ...site, siteConfig: policy.config };
  // 공개 tenant는 문장 일부를 숨기지 않는다. 저장 우회·레거시 오염이 있으면 사이트 전체를
  // fail-closed해 금지 표현이 HTML·JSON-LD·SemanticOutline 어디에도 도달하지 못하게 한다.
  if (!screenMedicalSiteConfig(policy.config).ok) return null;
  return projectedSite;
});

/**
 * [motion 3단계 — 렌더시점 티어 방어] 소유자 티어(요청 단위 dedupe). 발행 게이트가 이미 프리셋을
 * 강등하지만, DB 오염·저장 방벽 우회 대비로 렌더 진입점에서 sanitizeMotion 강등을 한 번 더 건다.
 */
const getOwnerTier = cache(async (clientId: string) => {
  return (await getDataServices().clients.getById(clientId))?.tier;
});

/**
 * 페이지 단위 메타데이터. pageSlug=''(홈)은 사이트 제목, 서브페이지는 "페이지명 · 사이트명".
 * site가 없거나 해당 페이지가 없으면 색인 제외.
 */
export function tenantMetadata(site: Site | null, pageSlug: string): Metadata {
  if (!site?.siteConfig) {
    return { title: `사이트를 찾을 수 없습니다 · ${PUBLIC_BRAND_NAMES.brand}`, robots: { index: false } };
  }
  const config = site.siteConfig;
  const page = findPage(config, pageSlug);
  if (!page) {
    return { title: `사이트를 찾을 수 없습니다 · ${PUBLIC_BRAND_NAMES.brand}`, robots: { index: false } };
  }
  const isHome = pageSlug === '';
  const meta = config.meta;
  const pageUrl = canonicalUrlFor(siteUrlOf(site.domain), pageSlug) ?? '';
  const ogImage = absoluteMediaUrl(meta.ogImage, siteUrlOf(site.domain));
  const title = isHome ? meta.title : `${page.title} · ${meta.title}`;
  return {
    title,
    description: meta.description,
    verification: {
      ...(config.searchVerification?.google ? { google: config.searchVerification.google } : {}),
      ...(config.searchVerification?.naver
        ? { other: { 'naver-site-verification': config.searchVerification.naver } }
        : {}),
    },
    ...(pageUrl ? { alternates: { canonical: pageUrl } } : {}),
    icons: { icon: '/favicon.ico' },
    openGraph: {
      type: 'website',
      siteName: meta.title,
      locale: 'ko_KR',
      title,
      description: meta.description,
      ...(pageUrl ? { url: pageUrl } : {}),
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description: meta.description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    robots:
      site.status === 'suspended'
        ? { index: false, follow: false }
        : {
            index: true,
            follow: true,
            googleBot: {
              index: true,
              follow: true,
              'max-image-preview': 'large',
              'max-snippet': -1,
              'max-video-preview': -1,
            },
          },
  };
}

/**
 * 테넌트 페이지 본문 렌더. 호출부가 site.siteConfig 존재 + 해당 페이지 존재를 사전 확인한다
 * (없으면 notFound). 정지 사이트는 안내 화면.
 */
export async function TenantPageBody({ site, pageSlug }: { site: Site; pageSlug: string }) {
  if (site.status === 'suspended') {
    return <SuspendedNotice siteName={site.name} />;
  }
  const config = site.siteConfig!;
  const jsonLdHtml = jsonLdScriptContent(config, siteUrlOf(site.domain), pageSlug);

  // [motion-system 2단계] 모션 유무·종류의 단일 소스는 config.motion.presetId(프리셋 계획)다.
  // Stage-1의 tier 게이팅(animate=tier==='premium')은 제거 — 티어 적정성은 sanitizeMotion이
  // 저장/발행 단계에서 이미 보장한다. 실서빙은 항상 모션 레이어를 방출(animate 미지정=interactive=true).
  // [3단계] 티어는 게이트가 아니라 방어용 — resolveMotionPlan이 sanitizeMotion 강등에만 사용(defense-in-depth).
  const tier = await getOwnerTier(site.clientId);
  const provenance = await resolveStoredBeforeAfterMotionOptions({
    config,
    clientId: site.clientId,
    siteId: site.id,
  });

  return (
    <>
      {/* JSON-LD: AEO/GEO가 발췌·인용할 구조화 데이터 (단일 소스 — '<' 이스케이프 포함) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />
      {/* [P1] 헤더+main(아웃라인+렌더)+법적푸터 = render-static과 공유하는 시맨틱 셸 단일 소스 */}
      <TenantPageContent
        config={config}
        pageSlug={pageSlug}
        siteId={site.id}
        tier={tier}
        motionOwnerId={site.clientId}
        motionAssets={provenance.ok ? provenance.options.assets : undefined}
      />
    </>
  );
}
