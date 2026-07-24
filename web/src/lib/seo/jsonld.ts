/**
 * Tenant JSON-LD graph.
 *
 * Stable @id references connect the operator, WebSite, current WebPage,
 * breadcrumbs, official Korean channels, and page-specific content. This
 * avoids emitting identical, disconnected schema blocks on every page.
 */
import type { Section, SiteConfig } from '@/lib/types/site';
import { allSections, findPage, homePage } from '@/lib/types/site';
import type { LivePurposeId } from '@/lib/types/domain';
import { resolvePublicContact } from './public-contact';

type JsonLdNode = Record<string, unknown>;

/** 섹션의 텍스트 요소들을 위→아래, 왼→오 순으로 추출 */
function sectionTexts(section: Section): string[] {
  return section.elements
    .filter((element) => element.kind === 'text')
    .slice()
    .sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x)
    .map((element) => (element.kind === 'text' ? element.text.trim() : ''))
    .filter(Boolean);
}

/** faq 섹션 → Q&A 쌍 (물음표로 끝나는 텍스트=질문, 이어지는 텍스트=답) */
export function extractFaq(section: Section): { q: string; a: string }[] {
  const texts = sectionTexts(section);
  const pairs: { q: string; a: string }[] = [];
  for (let index = 0; index < texts.length; index++) {
    if (/[?？]\s*$/.test(texts[index])) {
      const question = texts[index];
      const answer =
        texts[index + 1] && !/[?？]\s*$/.test(texts[index + 1]) ? texts[index + 1] : '';
      pairs.push({ q: question, a: answer });
      if (answer) index++;
    }
  }
  return pairs;
}

/**
 * 목적별 schema.org @type 매핑.
 * orgType: 주 엔티티 @type(배열이면 다중 타입). extra: 대표 페이지의 추가 엔티티.
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
  edu_membership: {
    orgType: ['LocalBusiness', 'EducationalOrganization'],
    extra: ['Course'],
  },
  one_page: { orgType: 'Person', profilePage: true },
} as const satisfies Record<LivePurposeId, PurposeSchemaSpec>;

/** meta.purposeId → 스펙 (deprecated/미설정이면 undefined → 휴리스틱 폴백) */
export function schemaSpecFor(purposeId: string | undefined): PurposeSchemaSpec | undefined {
  if (!purposeId) return undefined;
  return (PURPOSE_SCHEMA_MAP as Record<string, PurposeSchemaSpec>)[purposeId];
}

const OFFICIAL_CHANNEL_HOSTS = new Set([
  'blog.naver.com',
  'm.blog.naver.com',
  'smartstore.naver.com',
  'shopping.naver.com',
  'tv.naver.com',
  'chzzk.naver.com',
  'pf.kakao.com',
  'story.kakao.com',
  'instagram.com',
  'www.instagram.com',
  'youtube.com',
  'www.youtube.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'www.facebook.com',
  'threads.net',
  'www.threads.net',
  'tiktok.com',
  'www.tiktok.com',
  'tistory.com',
]);

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

function pageUrlFor(siteUrl: string, pageSlug: string): string {
  return pageSlug ? `${siteUrl}/${pageSlug}` : siteUrl;
}

function absoluteHttpUrl(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, `${baseUrl}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function officialChannelUrls(config: SiteConfig): string[] {
  const urls: string[] = [];
  for (const section of allSections(config)) {
    for (const element of section.elements) {
      const candidates =
        element.kind === 'socialLinks'
          ? element.links.map((link) => link.url)
          : element.kind === 'button'
            ? [element.href]
            : [];
      for (const raw of candidates) {
        try {
          const url = new URL(raw);
          if (!['http:', 'https:'].includes(url.protocol)) continue;
          const hostname = url.hostname.toLowerCase();
          const supported = [...OFFICIAL_CHANNEL_HOSTS].some(
            (host) => hostname === host || hostname.endsWith(`.${host}`),
          );
          if (!supported) continue;
          url.hash = '';
          urls.push(url.toString());
        } catch {
          // Relative and malformed URLs are not external entity identities.
        }
      }
    }
  }
  return [...new Set(urls)];
}

function ref(id: string): JsonLdNode {
  return { '@id': id };
}

function organizationTypeFor(
  config: SiteConfig,
  spec: PurposeSchemaSpec | undefined,
  hasMenu: boolean,
): string | readonly string[] {
  const broadType = spec?.orgType ?? (hasMenu ? 'LocalBusiness' : 'Organization');
  const purposeId = config.meta.purposeId;
  const localPurpose =
    purposeId === 'local_store' ||
    purposeId === 'booking_service' ||
    purposeId === 'edu_membership' ||
    (purposeId === 'company_brand' &&
      ['legal', 'remodeling'].includes(config.meta.industryClass ?? ''));
  if (!localPurpose) return broadType;

  const subtypeByIndustry: Partial<Record<NonNullable<typeof config.meta.industryClass>, string>> = {
    cafe: 'CafeOrCoffeeShop',
    fine_dining: 'Restaurant',
    retail: 'Store',
    beauty: 'BeautySalon',
    medical: 'MedicalClinic',
    legal: 'LegalService',
    consulting: 'ProfessionalService',
    workshop: 'ProfessionalService',
    photography: 'ProfessionalService',
    remodeling: 'HomeAndConstructionBusiness',
  };
  const subtype = config.meta.industryClass
    ? subtypeByIndustry[config.meta.industryClass]
    : undefined;
  if (!subtype) return broadType;

  const broadTypes = Array.isArray(broadType) ? broadType : [broadType];
  return [...new Set([subtype, ...broadTypes])];
}

export function buildJsonLd(config: SiteConfig, siteUrl: string, pageSlug = ''): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const info = config.businessInfo;
  const publicContact = resolvePublicContact(config);
  const name = info?.businessName?.trim() || config.meta.title || info?.ownerName || '사이트';
  const baseUrl = normalizeSiteUrl(siteUrl);
  const currentPage = findPage(config, pageSlug) ?? homePage(config);
  const currentUrl = pageUrlFor(baseUrl, currentPage.slug);
  const identityId = `${baseUrl}#identity`;
  const websiteId = `${baseUrl}#website`;
  const webPageId = `${currentUrl}#webpage`;
  const breadcrumbId = `${currentUrl}#breadcrumb`;
  const imageUrl = absoluteHttpUrl(config.meta.ogImage, baseUrl);

  // 목적(meta.purposeId)이 엔티티 타입을 결정. 레거시는 섹션 휴리스틱으로 폴백한다.
  const spec = schemaSpecFor(config.meta.purposeId);
  const hasMenu = allSections(config).some((section) => section.type === 'menu');
  const orgType = organizationTypeFor(config, spec, hasMenu);
  const region = config.meta.region?.trim();

  const identity: JsonLdNode = {
    '@context': 'https://schema.org',
    '@id': identityId,
    '@type': orgType,
    name,
    url: baseUrl,
  };
  if (config.meta.description) identity.description = config.meta.description;
  if (imageUrl) identity.image = imageUrl;
  const sameAs = officialChannelUrls(config);
  if (sameAs.length > 0) identity.sameAs = sameAs;

  if (region) identity.areaServed = region;
  if (publicContact?.address || region) {
    const address: JsonLdNode = { '@type': 'PostalAddress', addressCountry: 'KR' };
    if (publicContact?.address) address.streetAddress = publicContact.address;
    if (region) address.addressLocality = region;
    identity.address = address;
  }
  if (info || publicContact) {
    if (publicContact?.phone) identity.telephone = publicContact.phone;
    if (info?.email) identity.email = info.email;
    if (info?.businessNumber) identity.taxID = info.businessNumber;
    if (publicContact?.phone || info?.email) {
      identity.contactPoint = {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        availableLanguage: ['ko'],
        ...(publicContact?.phone ? { telephone: publicContact.phone } : {}),
        ...(info?.email ? { email: info.email } : {}),
      };
    }
  }
  nodes.push(identity);

  // 목적별 부가 엔티티는 대표 페이지에서만 방출한다.
  if (currentPage.slug === '') {
    for (const kind of spec?.extra ?? []) {
      if (kind === 'Service') {
        nodes.push({
          '@context': 'https://schema.org',
          '@id': `${baseUrl}#service`,
          '@type': 'Service',
          name: `${name} 서비스`,
          url: baseUrl,
          provider: ref(identityId),
          ...(region ? { areaServed: region } : {}),
        });
      } else if (kind === 'Course') {
        nodes.push({
          '@context': 'https://schema.org',
          '@id': `${baseUrl}#course`,
          '@type': 'Course',
          name: `${name} 커리큘럼`,
          url: baseUrl,
          provider: ref(identityId),
        });
      } else if (kind === 'CreativeWork') {
        nodes.push({
          '@context': 'https://schema.org',
          '@id': `${baseUrl}#work`,
          '@type': 'CreativeWork',
          name: `${name} 작업`,
          url: baseUrl,
          creator: ref(identityId),
        });
      }
    }
  }

  nodes.push({
    '@context': 'https://schema.org',
    '@id': websiteId,
    '@type': 'WebSite',
    name,
    url: baseUrl,
    inLanguage: 'ko-KR',
    publisher: ref(identityId),
  });

  const webPageType =
    spec?.profilePage && currentPage.slug === '' ? ['WebPage', 'ProfilePage'] : 'WebPage';
  nodes.push({
    '@context': 'https://schema.org',
    '@id': webPageId,
    '@type': webPageType,
    name:
      currentPage.slug === ''
        ? config.meta.title
        : `${currentPage.title} · ${config.meta.title}`,
    url: currentUrl,
    inLanguage: 'ko-KR',
    isPartOf: ref(websiteId),
    about: ref(identityId),
    ...(spec?.profilePage && currentPage.slug === '' ? { mainEntity: ref(identityId) } : {}),
    ...(config.meta.description ? { description: config.meta.description } : {}),
    ...(imageUrl
      ? { primaryImageOfPage: { '@type': 'ImageObject', url: imageUrl } }
      : {}),
    ...(currentPage.slug ? { breadcrumb: ref(breadcrumbId) } : {}),
  });

  const navPages = config.pages.filter((page) => page.showInNav !== false);
  if (
    baseUrl &&
    currentPage.slug === '' &&
    config.nav?.enabled !== false &&
    navPages.length >= 2
  ) {
    nodes.push({
      '@context': 'https://schema.org',
      '@id': `${baseUrl}#navigation`,
      '@type': 'SiteNavigationElement',
      name: navPages.map((page) => page.navLabel ?? page.title),
      url: navPages.map((page) => pageUrlFor(baseUrl, page.slug)),
    });
  }

  if (currentPage.slug) {
    nodes.push({
      '@context': 'https://schema.org',
      '@id': breadcrumbId,
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: homePage(config).title || '홈',
          item: baseUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: currentPage.title,
          item: currentUrl,
        },
      ],
    });
  }

  // FAQ markup is emitted only on the page where the visible FAQ is rendered.
  const faqSection = currentPage.sections.find((section) => section.type === 'faq');
  if (faqSection) {
    const pairs = extractFaq(faqSection).filter((pair) => pair.a);
    if (pairs.length > 0) {
      nodes.push({
        '@context': 'https://schema.org',
        '@id': `${currentUrl}#faq`,
        '@type': 'FAQPage',
        url: currentUrl,
        isPartOf: ref(webPageId),
        mainEntity: pairs.map((pair) => ({
          '@type': 'Question',
          name: pair.q,
          acceptedAnswer: { '@type': 'Answer', text: pair.a },
        })),
      });
    }
  }

  return nodes;
}
