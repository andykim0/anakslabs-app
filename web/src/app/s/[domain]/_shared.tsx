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
import { LegalFooter, SemanticOutline, SiteRenderer, SuspendedNotice, TenantHeader } from '@/components/site-renderer';
import { buildJsonLd } from '@/lib/seo/jsonld';

/** generateMetadata + page 중복 조회 방지 (요청 단위 dedupe) */
export const getSiteByDomain = cache(async (rawDomain: string): Promise<Site | null> => {
  let domain: string;
  try {
    domain = decodeURIComponent(rawDomain).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!domain) return null;
  return getDataServices().sites.getByDomain(domain);
});

/** 테넌트 라이브 URL (canonical/JSON-LD 원천) */
export function siteUrlOf(domain: string | null): string {
  return domain ? `https://${domain}` : '';
}

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
    return { title: '사이트를 찾을 수 없습니다 · 아낙스랩스', robots: { index: false } };
  }
  const config = site.siteConfig;
  const page = findPage(config, pageSlug);
  if (!page) {
    return { title: '사이트를 찾을 수 없습니다 · 아낙스랩스', robots: { index: false } };
  }
  const isHome = pageSlug === '';
  const meta = config.meta;
  const baseUrl = siteUrlOf(site.domain);
  const pageUrl = baseUrl ? (isHome ? baseUrl : `${baseUrl}/${pageSlug}`) : '';
  const title = isHome ? meta.title : `${page.title} · ${meta.title}`;
  const publishedTime = site.publishedAt ?? undefined;

  return {
    title,
    description: meta.description,
    ...(pageUrl ? { alternates: { canonical: pageUrl } } : {}),
    icons: { icon: '/favicon.ico' },
    openGraph: {
      type: 'article',
      title,
      description: meta.description,
      ...(pageUrl ? { url: pageUrl } : {}),
      ...(publishedTime ? { publishedTime, modifiedTime: publishedTime } : {}),
      ...(meta.ogImage ? { images: [{ url: meta.ogImage }] } : {}),
    },
    ...(site.status === 'suspended' ? { robots: { index: false } } : {}),
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
  const businessInfo = config.businessInfo ?? null;
  const jsonLd = buildJsonLd(config, siteUrlOf(site.domain));

  // [motion-system 2단계] 모션 유무·종류의 단일 소스는 config.motion.presetId(프리셋 계획)다.
  // Stage-1의 tier 게이팅(animate=tier==='premium')은 제거 — 티어 적정성은 sanitizeMotion이
  // 저장/발행 단계에서 이미 보장한다. 실서빙은 항상 모션 레이어를 방출(animate 미지정=interactive=true).
  // [3단계] 티어는 게이트가 아니라 방어용 — resolveMotionPlan이 sanitizeMotion 강등에만 사용(defense-in-depth).
  const tier = await getOwnerTier(site.clientId);

  return (
    <>
      {/* JSON-LD: AEO/GEO가 발췌·인용할 구조화 데이터 */}
      <script
        type="application/ld+json"
        // 신뢰된 서버 생성 값 (사용자 입력은 businessInfo 문자열 필드뿐 — JSON 인코딩으로 이스케이프)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* [v4 Phase 3] 페이지 ≥2 & nav 활성 시 자동 헤더 내비 (단일 페이지 사이트는 미표시) */}
      <TenantHeader config={config} currentSlug={pageSlug} />
      <main>
        {/* 화면 비표시 시맨틱 개요 — 크롤러·AI·스크린리더용 문서 구조 */}
        <SemanticOutline config={config} pageSlug={pageSlug} />
        <SiteRenderer config={config} mode="auto" siteId={site.id} pageSlug={pageSlug} tier={tier} />
      </main>
      {businessInfo ? <LegalFooter info={businessInfo} theme={config.theme} /> : null}
    </>
  );
}
