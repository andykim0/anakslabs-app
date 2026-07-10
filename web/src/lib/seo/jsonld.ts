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

export function buildJsonLd(config: SiteConfig, siteUrl: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const info = config.businessInfo;
  const name = info?.businessName?.trim() || config.meta.title || info?.ownerName || '사이트';

  const hasMenu = config.sections.some((s) => s.type === 'menu');
  const orgType = hasMenu ? 'LocalBusiness' : 'Organization';

  const org: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': orgType,
    name,
    url: siteUrl,
  };
  if (config.meta.description) org.description = config.meta.description;
  if (config.meta.ogImage) org.image = config.meta.ogImage;
  if (info) {
    if (info.phone) org.telephone = info.phone;
    if (info.email) org.email = info.email;
    if (info.address) {
      org.address = { '@type': 'PostalAddress', streetAddress: info.address, addressCountry: 'KR' };
    }
  }
  nodes.push(org);

  nodes.push({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: siteUrl,
  });

  const faqSection = config.sections.find((s) => s.type === 'faq');
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
