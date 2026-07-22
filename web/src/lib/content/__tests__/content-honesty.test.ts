import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { BusinessFactKey, DesignCandidate, SurveyInput } from '@/lib/types/domain';
import {
  buildContentDepthHomeModel,
  honestBrandingForIndustry,
} from '@/lib/content/content-depth';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { emptySiteConfig } from '@/lib/types/site';

const candidate: DesignCandidate = {
  id: 'honesty', label: '정직성', style: 'photo', heroImageUrl: '/mock/hero.svg',
  theme: emptySiteConfig('정직성').theme, description: '',
};

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '정직상점',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '브라운',
    referenceImageUrls: [],
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '', source: 'template', pageSlug: '' },
      { type: 'about', name: '소개', brief: '', source: 'template', pageSlug: '' },
      { type: 'features', name: '강점', brief: '', source: 'template', pageSlug: '' },
      { type: 'menu', name: '메뉴', brief: '', source: 'template', pageSlug: '' },
      { type: 'testimonials', name: '후기', brief: '', source: 'template', pageSlug: '' },
      { type: 'cases', name: '실적', brief: '', source: 'template', pageSlug: '' },
      { type: 'contact', name: '문의', brief: '', source: 'template', pageSlug: '' },
    ],
    templateId: 'local_store.default',
    ...over,
  };
}

function allText(config: ReturnType<typeof buildSiteConfigFromSurvey>): string[] {
  return config.pages.flatMap((page) => page.sections)
    .flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'text' ? [element.text] : element.kind === 'button' ? [element.label] : []);
}

test('8개 업종 브랜딩 카탈로그에는 연혁·수치·시설·수상·후기·최상급 주장이 없다', () => {
  const industries = ['카페', '식당', '의원', '미용실', '도예 공방', '학원', '법률 사무소', '편집숍', '회사'];
  const factualClaimPattern = /(?:19|20)\d{2}|\d+\s*(?:년|명|대|개|회|%|평|석|시간|분)|수상|인증|후기|단골|재방문|누적|최고|최초|유일|1위|경력|보유|주차\s*(?:가능|완비)|엘리베이터\s*(?:있음|완비)/u;
  for (const industry of industries) {
    const copy = JSON.stringify(honestBrandingForIndustry(industry));
    assert.doesNotMatch(copy, factualClaimPattern, industry);
  }
});

test('factual 슬롯은 답한 값만 그룹에 투영하고 마지막 고객 확인값을 사용한다', () => {
  const facts: Array<{ key: BusinessFactKey; value: string; source: 'customer' | 'customer_import' }> = [
    { key: 'phone', value: '이전 연락처', source: 'customer_import' },
    { key: 'phone', value: '최종 연락처', source: 'customer' },
    { key: 'address', value: '확인 주소', source: 'customer_import' },
    { key: 'parking', value: ' ', source: 'customer' },
  ];
  const model = buildContentDepthHomeModel(survey({
    contentDepth: { version: 1, facts, faqAnswers: [], imports: [] },
  }));
  assert.deepEqual(model.contact, [{ label: '연락처', value: '최종 연락처' }]);
  assert.deepEqual(model.directions, [{ label: '주소', value: '확인 주소' }]);
  assert.equal(JSON.stringify(model).includes('이전 연락처'), false);
  assert.equal(JSON.stringify(model).includes('주차'), false);
});

test('factual 키를 모두 빼면 관련 문장·섹션·빈 플레이스홀더가 렌더되지 않는다', () => {
  const input = survey({
    contentDepth: { version: 1, facts: [], faqAnswers: [], imports: [] },
    contentItems: [], storePhotoUrls: [], highlights: [], providedContent: undefined, tagline: undefined,
  });
  const config = buildSiteConfigFromSurvey(input, candidate, {
    heroImageUrl: '/mock/hero.svg', imagePool: ['/mock/generated.svg'],
  });
  assert.deepEqual(config.pages[0].sections.map((section) => section.id), ['sec-hero', 'sec-about', 'sec-features']);
  const output = allText(config).join(' ');
  assert.doesNotMatch(output, /연락처를 입력|영업시간을 입력|주소를 입력|가격 문의|지도|후기|수상|경력/u);
});

test('갤러리 factual 슬롯은 고객 사진만 쓰고 생성 이미지 풀을 섞지 않는다', () => {
  const input = survey({
    generalAssetAttestationId: 'attestation-customer-photos',
    storePhotoUrls: ['/customer/upload.webp', '/customer/import.webp'],
    storePhotoAssetRefs: [{ assetId: 'upload-1', url: '/customer/upload.webp' }],
    importedPhotoAssetRefs: [{ assetId: 'import-1', url: '/customer/import.webp' }],
    contentItems: [{
      name: '메뉴', photoUrl: '/customer/item.webp',
      photoAssetRef: { assetId: 'item-1', url: '/customer/item.webp' },
    }],
    contentDepth: { version: 1, facts: [], faqAnswers: [], imports: [] },
  });
  const config = buildSiteConfigFromSurvey(input, candidate, {
    heroImageUrl: '/mock/hero.svg', imagePool: ['/mock/generated.svg'],
  });
  const gallery = config.pages[0].sections.find((section) => section.id === 'sec-gallery');
  const sources = gallery?.elements.flatMap((element) => element.kind === 'image' ? [element.src] : []) ?? [];
  assert.deepEqual(sources, ['/customer/upload.webp', '/customer/import.webp', '/customer/item.webp']);
  assert.equal(sources.includes('/mock/generated.svg'), false);
});

test('확약 ID나 URL-ref 쌍이 없는 고객 사진은 factual 갤러리에 배정하지 않는다', () => {
  const missingAttestation = buildSiteConfigFromSurvey(survey({
    storePhotoUrls: ['/customer/unattested.webp'],
    storePhotoAssetRefs: [{ assetId: 'upload-1', url: '/customer/unattested.webp' }],
    contentDepth: { version: 1, facts: [], faqAnswers: [], imports: [] },
  }), candidate, { heroImageUrl: '/mock/hero.svg', imagePool: [] });
  const missingPair = buildSiteConfigFromSurvey(survey({
    generalAssetAttestationId: 'attestation-without-pair',
    storePhotoUrls: ['/customer/url-only.webp'],
    importedPhotoAssetRefs: [{ assetId: 'import-other', url: '/customer/other.webp' }],
    contentDepth: { version: 1, facts: [], faqAnswers: [], imports: [] },
  }), candidate, { heroImageUrl: '/mock/hero.svg', imagePool: [] });
  for (const config of [missingAttestation, missingPair]) {
    assert.equal(config.pages[0].sections.some((section) => section.id === 'sec-gallery'), false);
  }
});

test('CONTENT v1은 자유 LLM 섹션 카피보다 먼저 결정적으로 종료한다', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/data/supabase/ai.ts'), 'utf8');
  const fn = source.slice(source.indexOf('async function generateSectionCopy'), source.indexOf('// ---------- AiService'));
  assert.ok(fn.indexOf('if (survey.contentDepth) return undefined;') > 0);
  assert.ok(fn.indexOf('if (survey.contentDepth) return undefined;') < fn.indexOf('generateClaudeText'));
});

test('contentDepth가 없는 레거시 생성 출력은 고정 해시를 유지한다', () => {
  const config = buildSiteConfigFromSurvey(survey(), candidate, {
    heroImageUrl: '/mock/hero.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'], heroVariant: 'fullbleed',
  });
  const normalized = JSON.stringify(config).replace(/© \d{4} /gu, '© YEAR ');
  const hash = createHash('sha256').update(normalized).digest('hex');
  assert.equal(hash, 'dcf04d5cca7b27d006db5cb67dc9a0368cca478e92956eafd83421b3e2fdd929');
});
