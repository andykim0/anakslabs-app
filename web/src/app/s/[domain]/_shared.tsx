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
// [S-batch] canonical·JSON-LD 단일 소스 — 정적 발행물(render-static)과 동일 함수 공유
import { canonicalUrlFor, jsonLdScriptContent, siteUrlOf } from '@/lib/seo/structured-data';

export { siteUrlOf };

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
  const pageUrl = canonicalUrlFor(siteUrlOf(site.domain), pageSlug) ?? '';
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
  const jsonLdHtml = jsonLdScriptContent(config, siteUrlOf(site.domain));

  // [motion-system 2단계] 모션 유무·종류의 단일 소스는 config.motion.presetId(프리셋 계획)다.
  // Stage-1의 tier 게이팅(animate=tier==='premium')은 제거 — 티어 적정성은 sanitizeMotion이
  // 저장/발행 단계에서 이미 보장한다. 실서빙은 항상 모션 레이어를 방출(animate 미지정=interactive=true).
  // [3단계] 티어는 게이트가 아니라 방어용 — resolveMotionPlan이 sanitizeMotion 강등에만 사용(defense-in-depth).
  const tier = await getOwnerTier(site.clientId);

  return (
    <>
      {/* JSON-LD: AEO/GEO가 발췌·인용할 구조화 데이터 (단일 소스 — '<' 이스케이프 포함) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />
      {/* [P1] 헤더+main(아웃라인+렌더)+법적푸터 = render-static과 공유하는 시맨틱 셸 단일 소스 */}
      <TenantPageContent config={config} pageSlug={pageSlug} siteId={site.id} tier={tier} />
    </>
  );
}
