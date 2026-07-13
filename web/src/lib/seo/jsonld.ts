/**
 * [v3 Phase 7] 테넌트 사이트 JSON-LD(구조화 데이터) 생성 — AEO/GEO가 발췌·인용할 근거.
 *
 * purposeId는 프리즌 계약상 SiteConfig에 저장되지 않으므로(SurveyInput 전용),
 * 섹션 구성 + businessInfo에서 schema.org @type을 추론한다:
 *  - menu 섹션 보유 → LocalBusiness (음식점·서비스·교육 등 오프라인 업종)
 *  - 그 외 → Organization
 *  - businessInfo → name/telephone/address/email
 *  - WebSite 항상 포함, faq 섹션 있으면 FAQPage 추가
 * (purposeId를 정밀 반영한 Event/Product 세분화는 계약에 purposeId 저장이 선행돼야 함 — 보고 참조)
 */
import type { Section, SiteConfig } from '@/lib/types/site';
import { allSections } from '@/lib/types/site';
import type { LivePurposeId } from '@/lib/types/domain';

type JsonLdNode = Record<string, unknown>;

/** 섹션의 텍스트 요소들을 위→아래, 왼→오 순으로 추출 */
function sectionTexts(section: Section): string[] {
  return section.elements
    .filter((el) => el.kind === 'text')
    .slice()
    .sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x)
    .map((el) => (el.kind === 'text' ? el.text.trim() : ''))
    .filter(Boolean);
}

/** faq 섹션 → Q&A 쌍 (물음표로 끝나는 텍스트=질문, 이어지는 텍스트=답) */
export function extractFaq(section: Section): { q: string; a: string }[] {
  const texts = sectionTexts(section);
  const pairs: { q: string; a: string }[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (/[?？]\s*$/.test(texts[i])) {
      const q = texts[i];
      const a = texts[i + 1] && !/[?？]\s*$/.test(texts[i + 1]) ? texts[i + 1] : '';
      pairs.push({ q, a });
      if (a) i++;
    }
  }
  return pairs;
}

/**
 * [제품 확정 — SEO/AEO 해자] 목적별 schema.org @type 매핑.
 * "목적이 구조화 데이터 타입을 결정한다" — 소개형 6종(LivePurposeId)만.
 * orgType: 주 노드 @type(배열이면 다중 타입). extra: 추가 노드(Service/Course/CreativeWork).
 * profilePage: 원페이지는 ProfilePage로 감싸고 mainEntity=Person.
 */
export interface PurposeSchemaSpec {
  orgType: string | readonly string[];
  extra?: readonly ('Service' | 'Course' | 'CreativeWork')[];
  profilePage?: boolean;
}
export const PURPOSE_SCHEMA_MAP = {
  local_store: { orgType: 'LocalBusiness' },
  booking_service: { orgType: 'LocalBusiness', extra: ['Service'] },
  company_brand: { orgType: 'Organization' },
  portfolio: { orgType: 'Person', extra: ['CreativeWork'] },
  edu_membership: { orgType: ['LocalBusiness', 'EducationalOrganization'], extra: ['Course'] },
  one_page: { orgType: 'Person', profilePage: true },
} as const satisfies Record<LivePurposeId, PurposeSchemaSpec>;

/** meta.purposeId → 스펙 (deprecated/미설정이면 undefined → 휴리스틱 폴백) */
export function schemaSpecFor(purposeId: string | undefined): PurposeSchemaSpec | undefined {
  if (!purposeId) return undefined;
  return (PURPOSE_SCHEMA_MAP as Record<string, PurposeSchemaSpec>)[purposeId];
}

export function buildJsonLd(config: SiteConfig, siteUrl: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const info = config.businessInfo;
  const name = info?.businessName?.trim() || config.meta.title || info?.ownerName || '사이트';

  // [해자] 목적(meta.purposeId)이 @type을 결정. 레거시(미설정)면 섹션 휴리스틱으로 폴백(무회귀).
  const spec = schemaSpecFor(config.meta.purposeId);
  const hasMenu = allSections(config).some((s) => s.type === 'menu');
  const orgType = spec?.orgType ?? (hasMenu ? 'LocalBusiness' : 'Organization');
  const region = config.meta.region?.trim();

  const org: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': orgType,
    name,
    url: siteUrl,
  };
  if (config.meta.description) org.description = config.meta.description;
  if (config.meta.ogImage) org.image = config.meta.ogImage;
  // [해자] 지역 → areaServed + address.addressLocality (지역 검색 반영)
  if (region) org.areaServed = region;
  if (info || region) {
    const address: JsonLdNode = { '@type': 'PostalAddress', addressCountry: 'KR' };
    if (info?.address) address.streetAddress = info.address;
    if (region) address.addressLocality = region;
    org.address = address;
  }
  if (info) {
    if (info.phone) org.telephone = info.phone;
    if (info.email) org.email = info.email;
  }
  nodes.push(org);

  // 목적별 부가 노드
  const orgRef: JsonLdNode = { '@type': Array.isArray(orgType) ? orgType[0] : orgType, name };
  for (const kind of spec?.extra ?? []) {
    if (kind === 'Service') {
      nodes.push({ '@context': 'https://schema.org', '@type': 'Service', name: `${name} 서비스`, provider: orgRef, ...(region ? { areaServed: region } : {}) });
    } else if (kind === 'Course') {
      nodes.push({ '@context': 'https://schema.org', '@type': 'Course', name: `${name} 커리큘럼`, provider: orgRef });
    } else if (kind === 'CreativeWork') {
      nodes.push({ '@context': 'https://schema.org', '@type': 'CreativeWork', name: `${name} 작업`, creator: orgRef });
    }
  }
  if (spec?.profilePage) {
    nodes.push({ '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: orgRef });
  }

  nodes.push({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: siteUrl,
  });

  // [v4 Phase 3] 내비 노출 페이지 ≥2면 사이트 내비 구조 노출 (헤더 조건과 동일)
  const navPages = config.pages.filter((p) => p.showInNav !== false);
  if (siteUrl && config.nav?.enabled !== false && navPages.length >= 2) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'SiteNavigationElement',
      name: navPages.map((p) => p.navLabel ?? p.title),
      url: navPages.map((p) => (p.slug === '' ? siteUrl : `${siteUrl}/${p.slug}`)),
    });
  }

  const faqSection = allSections(config).find((s) => s.type === 'faq');
  if (faqSection) {
    const pairs = extractFaq(faqSection).filter((p) => p.a);
    if (pairs.length > 0) {
      nodes.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: pairs.map((p) => ({
          '@type': 'Question',
          name: p.q,
          acceptedAnswer: { '@type': 'Answer', text: p.a },
        })),
      });
    }
  }

  return nodes;
}
