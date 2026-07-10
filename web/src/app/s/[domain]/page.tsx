/**
 * 멀티테넌트 사이트 서빙 — proxy가 테넌트 호스트를 /s/[domain]으로 rewrite.
 * 발행본(siteConfig)만 서빙. 앱 chrome 없이 순수 사이트만 렌더.
 *
 * [v3 Phase 7] 검색·AI 가독성 내장: generateMetadata(og/canonical/dates/icons),
 * JSON-LD 자동 주입, 시맨틱 아웃라인(<main> 안 h1/h2/h3·목록), 법적 푸터.
 *
 * 데모: http://localhost:3000/s/hwarodam.anakslabs.com
 *      http://hwarodam.localhost:3000 (proxy의 .localhost 매핑)
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDataServices } from '@/lib/data';
import { LegalFooter, SemanticOutline, SiteRenderer, SuspendedNotice } from '@/components/site-renderer';
import { buildJsonLd } from '@/lib/seo/jsonld';

// 발행 즉시 반영되어야 하므로 항상 요청 시 렌더 (캐싱 최적화는 ISR 도입 시)
export const dynamic = 'force-dynamic';

/** generateMetadata + page 중복 조회 방지 (요청 단위 dedupe) */
const getSiteByDomain = cache(async (rawDomain: string) => {
  let domain: string;
  try {
    domain = decodeURIComponent(rawDomain).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!domain) return null;
  return getDataServices().sites.getByDomain(domain);
});

interface Props {
  params: Promise<{ domain: string }>;
}

/** 테넌트 라이브 URL (canonical/JSON-LD 원천) */
function siteUrlOf(domain: string | null): string {
  return domain ? `https://${domain}` : '';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const site = await getSiteByDomain(domain);

  if (!site?.siteConfig) {
    return {
      title: '사이트를 찾을 수 없습니다 · 아낙스랩스',
      robots: { index: false },
    };
  }

  const meta = site.siteConfig.meta;
  const url = siteUrlOf(site.domain);
  const publishedTime = site.publishedAt ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    ...(url ? { alternates: { canonical: url } } : {}),
    icons: { icon: '/favicon.ico' },
    openGraph: {
      type: 'article',
      title: meta.title,
      description: meta.description,
      ...(url ? { url } : {}),
      ...(publishedTime ? { publishedTime, modifiedTime: publishedTime } : {}),
      ...(meta.ogImage ? { images: [{ url: meta.ogImage }] } : {}),
    },
    // 정지된 사이트는 색인 제외
    ...(site.status === 'suspended' ? { robots: { index: false } } : {}),
  };
}

export default async function TenantSitePage({ params }: Props) {
  const { domain } = await params;
  const site = await getSiteByDomain(domain);

  if (!site?.siteConfig) notFound();

  if (site.status === 'suspended') {
    return <SuspendedNotice siteName={site.name} />;
  }

  const config = site.siteConfig;
  // [§6] 발행 사이트 최하단에 사업자정보 법적 푸터 (site.siteConfig.businessInfo 기반)
  const businessInfo = config.businessInfo ?? null;
  const jsonLd = buildJsonLd(config, siteUrlOf(site.domain));

  return (
    <>
      {/* JSON-LD: AEO/GEO가 발췌·인용할 구조화 데이터 */}
      <script
        type="application/ld+json"
        // 신뢰된 서버 생성 값 (사용자 입력은 businessInfo 문자열 필드뿐 — JSON 인코딩으로 이스케이프)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main>
        {/* 화면 비표시 시맨틱 개요 — 크롤러·AI·스크린리더용 문서 구조 */}
        <SemanticOutline config={config} />
        <SiteRenderer config={config} mode="auto" siteId={site.id} />
      </main>
      {businessInfo ? <LegalFooter info={businessInfo} theme={config.theme} /> : null}
    </>
  );
}
