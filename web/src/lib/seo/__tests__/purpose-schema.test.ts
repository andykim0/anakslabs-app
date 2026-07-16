/**
 * [제품 확정 — SEO/AEO 해자] 목적별 JSON-LD @type 매핑 + 지역 반영 + 레거시 폴백.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type SocialLinksElement } from '@/lib/types/site';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { PURPOSE_SCHEMA_MAP, buildJsonLd } from '@/lib/seo/jsonld';
import { jsonLdScriptContent } from '@/lib/seo/structured-data';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const candidate: DesignCandidate = {
  id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
  theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'] };

function build(purposeId: LivePurposeId, industry: string, region?: string) {
  const t = resolveTemplate(purposeId, industry);
  const survey = {
    businessName: '테스트', purposeId, purpose: '테스트', industry, tone: ['모던'],
    colorPreference: '#c98a5e', referenceImageUrls: [], region,
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  return buildSiteConfigFromSurvey(survey, candidate, opts);
}

/** node의 @type을 평탄화(문자열 또는 배열) */
function typeSet(node: { '@type': string | string[] }): Set<string> {
  return new Set(Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
}

interface TestJsonLdNode {
  '@id'?: string;
  '@type'?: string | string[];
  name?: string;
  url?: string;
  areaServed?: string;
  address?: { addressLocality?: string };
  sameAs?: string[];
  publisher?: { '@id'?: string };
  breadcrumb?: { '@id'?: string };
  itemListElement?: { item?: string }[];
}

describe('PURPOSE_SCHEMA_MAP — 6종 완전성', () => {
  test('LIVE_PURPOSE_IDS 6종 전부 매핑 존재', () => {
    for (const id of LIVE_PURPOSE_IDS) {
      assert.ok(PURPOSE_SCHEMA_MAP[id], `${id} 매핑 없음`);
    }
    assert.equal(Object.keys(PURPOSE_SCHEMA_MAP).length, 6);
  });
});

describe('목적 → JSON-LD @type', () => {
  const EXPECT: Record<LivePurposeId, { org: string[]; extraTypes: string[] }> = {
    local_store: { org: ['LocalBusiness'], extraTypes: [] },
    booking_service: { org: ['LocalBusiness'], extraTypes: ['Service'] },
    company_brand: { org: ['Organization'], extraTypes: [] },
    portfolio: { org: ['Person'], extraTypes: ['CreativeWork'] },
    edu_membership: { org: ['LocalBusiness', 'EducationalOrganization'], extraTypes: ['Course'] },
    one_page: { org: ['Person'], extraTypes: ['ProfilePage'] },
  };

  for (const id of LIVE_PURPOSE_IDS) {
    test(`${id} — 주 노드 + 부가 노드 타입 정확`, () => {
      const cfg = build(id, id === 'edu_membership' ? '입시학원' : '카페');
      const nodes = buildJsonLd(cfg, 'https://x.anakslabs.com') as { '@type': string | string[] }[];
      const org = nodes[0];
      for (const t of EXPECT[id].org) assert.ok(typeSet(org).has(t), `${id}: 주 노드 @type에 ${t} 없음`);
      const allTypes = new Set(nodes.flatMap((n) => Array.from(typeSet(n))));
      for (const t of EXPECT[id].extraTypes) assert.ok(allTypes.has(t), `${id}: 부가 노드 ${t} 없음`);
      // 항상 WebSite 포함
      assert.ok(allTypes.has('WebSite'));
    });
  }
});

describe('지역 반영 + 파싱 유효 + 레거시 폴백', () => {
  test('region 설정 시 addressLocality·areaServed 반영', () => {
    const cfg = build('local_store', '카페', '서울 연희동');
    assert.equal(cfg.meta.region, '서울 연희동');
    const nodes = buildJsonLd(cfg, 'https://x.anakslabs.com') as TestJsonLdNode[];
    assert.equal(nodes[0].areaServed, '서울 연희동');
    assert.equal(nodes[0].address?.addressLocality, '서울 연희동');
  });

  test('생성된 JSON-LD 스크립트 파싱 유효(6종)', () => {
    for (const id of LIVE_PURPOSE_IDS) {
      const cfg = build(id, '카페', '부산');
      const s = jsonLdScriptContent(cfg, 'https://x.anakslabs.com');
      assert.doesNotThrow(() => JSON.parse(s), `${id}: JSON 파싱 실패`);
      const parsed = JSON.parse(s);
      assert.ok(Array.isArray(parsed) && parsed.length >= 2);
    }
  });

  test('레거시 config(meta.purposeId 미설정) → 섹션 휴리스틱 폴백(무회귀)', () => {
    const cfg = build('local_store', '카페');
    delete (cfg.meta as { purposeId?: string }).purposeId;
    const nodes = buildJsonLd(cfg, 'https://x.anakslabs.com') as { '@type': string | string[] }[];
    // menu 섹션 보유 → LocalBusiness 휴리스틱
    assert.ok(typeSet(nodes[0]).has('LocalBusiness'));
  });
});

describe('페이지별 연결형 JSON-LD', () => {
  test('한국 업종 분류를 더 구체적인 LocalBusiness 하위 타입으로 표현', () => {
    const cafe = build('local_store', '카페');
    cafe.meta.industryClass = 'cafe';
    const cafeTypes = typeSet(
      buildJsonLd(cafe, 'https://cafe.example.kr')[0] as {
        '@type': string | string[];
      },
    );
    assert.ok(cafeTypes.has('CafeOrCoffeeShop'));
    assert.ok(cafeTypes.has('LocalBusiness'));

    const clinic = build('booking_service', '피부과');
    clinic.meta.industryClass = 'medical';
    const clinicTypes = typeSet(
      buildJsonLd(clinic, 'https://clinic.example.kr')[0] as {
        '@type': string | string[];
      },
    );
    assert.ok(clinicTypes.has('MedicalClinic'));
    assert.ok(clinicTypes.has('LocalBusiness'));
  });

  test('공식 네이버·카카오 채널을 운영 주체 sameAs에 연결', () => {
    const cfg = build('company_brand', '브랜드');
    const social: SocialLinksElement = {
      id: 'official-channels',
      kind: 'socialLinks',
      frame: { x: 0, y: 0, w: 200, h: 50 },
      z: 10,
      links: [
        { kind: 'naver_blog', url: 'https://blog.naver.com/anaks' },
        { kind: 'kakao_channel', url: 'https://pf.kakao.com/_anaks' },
      ],
      style: { direction: 'row' },
    };
    cfg.pages[0].sections[0].elements.push(social);

    const nodes = buildJsonLd(cfg, 'https://x.anakslabs.com') as TestJsonLdNode[];
    assert.deepEqual(nodes[0].sameAs, [
      'https://blog.naver.com/anaks',
      'https://pf.kakao.com/_anaks',
    ]);
    assert.equal(nodes[0]['@id'], 'https://x.anakslabs.com#identity');
    const website = nodes.find((node) => node['@type'] === 'WebSite');
    assert.equal(website?.publisher?.['@id'], nodes[0]['@id']);
  });

  test('서브페이지 WebPage URL과 BreadcrumbList가 현재 페이지에 맞음', () => {
    const cfg = build('company_brand', '브랜드');
    cfg.pages.push({
      id: 'about-page',
      title: '회사 소개',
      slug: 'company-info',
      sections: [],
    });

    const nodes = buildJsonLd(
      cfg,
      'https://x.anakslabs.com',
      'company-info',
    ) as TestJsonLdNode[];
    const webPage = nodes.find((node) => node['@type'] === 'WebPage');
    const breadcrumb = nodes.find((node) => node['@type'] === 'BreadcrumbList');

    assert.equal(webPage?.url, 'https://x.anakslabs.com/company-info');
    assert.equal(webPage?.name, `회사 소개 · ${cfg.meta.title}`);
    assert.equal(
      webPage?.breadcrumb?.['@id'],
      'https://x.anakslabs.com/company-info#breadcrumb',
    );
    assert.equal(
      breadcrumb?.itemListElement?.[1]?.item,
      'https://x.anakslabs.com/company-info',
    );
    assert.equal(
      nodes.some((node) => node['@type'] === 'SiteNavigationElement'),
      false,
      'site-wide navigation schema should not be duplicated on every subpage',
    );
  });
});
