import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { emptySiteConfig } from '@/lib/types/site';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';

const candidate: DesignCandidate = {
  id: 'content-depth',
  label: '콘텐츠 깊이',
  style: 'photo',
  heroImageUrl: '/mock/hero.svg',
  theme: emptySiteConfig('콘텐츠 깊이').theme,
  description: '',
};
const opts = {
  heroImageUrl: '/mock/hero.svg',
  imagePool: ['/mock/generated-1.svg', '/mock/generated-2.svg'],
  copy: {
    heroTitle: '입력에 없는 15년 경력',
    heroSub: '주차 100대와 누적 고객 1만 명',
    aboutBody: '수상 경력과 검증된 후기',
  },
};

function plan(): SurveyInput['sectionPlan'] {
  return [
    { type: 'hero', name: '첫 화면', brief: '', source: 'template', pageSlug: '' },
    { type: 'about', name: '소개', brief: '', source: 'template', pageSlug: 'about' },
    { type: 'features', name: '강점', brief: '', source: 'template', pageSlug: '' },
    { type: 'menu', name: '메뉴', brief: '', source: 'template', pageSlug: 'menu' },
    { type: 'gallery', name: '갤러리', brief: '', source: 'template', pageSlug: 'gallery' },
    { type: 'testimonials', name: '후기', brief: '', source: 'template', pageSlug: 'reviews' },
    { type: 'team', name: '구성원', brief: '', source: 'template', pageSlug: 'about' },
    { type: 'cases', name: '성과', brief: '', source: 'template', pageSlug: 'work' },
    { type: 'pricing', name: '가격', brief: '', source: 'template', pageSlug: 'menu' },
    { type: 'faq', name: '자주 묻는 질문', brief: '', source: 'template', pageSlug: 'guide' },
    { type: 'contact', name: '문의', brief: '', source: 'template', pageSlug: 'contact' },
  ];
}

function richSurvey(): SurveyInput {
  return {
    businessName: '온담카페',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '카페·디저트',
    region: '서울 성수동',
    tone: ['차분한'],
    colorPreference: '브라운',
    referenceImageUrls: [],
    sectionPlan: plan(),
    pagePlan: [
      { slug: '', title: '홈' },
      { slug: 'about', title: '소개' },
      { slug: 'menu', title: '메뉴' },
      { slug: 'gallery', title: '갤러리' },
      { slug: 'guide', title: '안내' },
      { slug: 'contact', title: '문의' },
    ],
    templateId: 'local_store.default',
    tagline: '계절의 맛을 담은 커피와 디저트를 소개합니다.',
    providedContent: '[소개]\n커피와 디저트를 천천히 즐기는 시간을 생각합니다.\n메뉴의 재료와 맛을 알기 쉽게 안내합니다.',
    highlights: ['제철 재료로 만든 디저트', '원두별 맛 안내', '예약 가능한 단체석'],
    contentItems: [
      { name: '온담 라테', price: '6,500', description: '고객이 적은 고소한 라테 설명' },
      { name: '제철 과일 타르트', price: '8,000', description: '고객이 적은 계절 디저트 설명' },
      { name: '필터 커피', price: '7,000', description: '고객이 적은 원두 선택 안내' },
      { name: '홍차', price: '6,000', description: '고객이 적은 찻잎 안내' },
      { name: '쿠키', price: '3,500', description: '고객이 적은 구움과자 안내' },
    ],
    storePhotoUrls: ['/customer/a.webp', '/customer/b.webp', '/customer/c.webp', '/customer/d.webp'],
    storePhotoAssetRefs: [
      { assetId: 'upload-a', url: '/customer/a.webp' },
      { assetId: 'upload-b', url: '/customer/b.webp' },
      { assetId: 'upload-c', url: '/customer/c.webp' },
      { assetId: 'upload-d', url: '/customer/d.webp' },
    ],
    generalAssetAttestationId: 'attestation-content-depth',
    contentDepth: {
      version: 1,
      imports: [{
        url: 'https://customer.example.com',
        origin: 'customer_import',
        extractedAt: '2026-07-22T00:00:00.000Z',
        fields: ['description', 'phone', 'address', 'openingHours', 'contentItems'],
      }],
      facts: [
        { key: 'phone', value: '02-123-4567', source: 'customer_import' },
        { key: 'openingHours', value: '화–일 10:00–20:00, 월요일 휴무', source: 'customer' },
        { key: 'address', value: '서울 성동구 연무장길 12, 2층', source: 'customer_import' },
        { key: 'directions', value: '성수역 3번 출구에서 도보 5분', source: 'customer' },
        { key: 'parking', value: '건물 주차 1시간 가능', source: 'customer' },
        { key: 'accessibility', value: '2층, 엘리베이터 있음', source: 'customer' },
        { key: 'reservation', value: '전화로 단체석 예약 가능', source: 'customer' },
        { key: 'paymentMethods', value: '카드·현금·지역화폐', source: 'customer' },
        { key: 'wifi', value: '손님용 와이파이 제공', source: 'customer' },
      ],
      faqAnswers: [
        { questionId: 'hours', answer: '화요일부터 일요일까지 오전 10시부터 오후 8시까지 엽니다.' },
        { questionId: 'parking', answer: '건물 주차장을 한 시간 이용할 수 있습니다.' },
        { questionId: 'reservation', answer: '단체석은 전화로 예약해 주세요.' },
        { questionId: 'wifi', answer: '손님용 와이파이와 창가 콘센트를 이용할 수 있습니다.' },
      ],
    },
  };
}

function visibleText(config: ReturnType<typeof buildSiteConfigFromSurvey>): string {
  return config.pages.flatMap((page) => page.sections)
    .flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'text' ? [element.text] : element.kind === 'button' ? [element.label] : [])
    .join(' ');
}

test('신규 깊이 경로는 홈 하나에 소개→강점→메뉴→갤러리→FAQ→길→문의 순서를 만든다', () => {
  const config = buildSiteConfigFromSurvey(richSurvey(), candidate, opts);
  assert.deepEqual(config.pages.map((page) => page.slug), ['']);
  assert.deepEqual(config.pages[0].sections.map((section) => section.id), [
    'sec-hero',
    'sec-about',
    'sec-features',
    'sec-menu',
    'sec-gallery',
    'sec-faq',
    'sec-contact-directions',
    'sec-contact',
  ]);
});

test('고객이 입력한 메뉴 설명·사진·FAQ·방문 정보는 정적 HTML에 모두 존재한다', () => {
  const config = buildSiteConfigFromSurvey(richSurvey(), candidate, opts);
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config, mode: 'desktop', interactive: false, animate: false,
  }));
  for (const exact of [
    '고객이 적은 고소한 라테 설명',
    '서울 성동구 연무장길 12, 2층',
    '성수역 3번 출구에서 도보 5분',
    '건물 주차장을 한 시간 이용할 수 있습니다.',
    '02-123-4567',
  ]) assert.ok(html.includes(exact), exact);
  for (const src of ['/customer/a.webp', '/customer/b.webp', '/customer/c.webp', '/customer/d.webp']) {
    assert.ok(html.includes(src), src);
  }
});

test('LLM 카피와 레거시 샘플 후기·성과·경력은 CONTENT v1 출력에 섞이지 않는다', () => {
  const text = visibleText(buildSiteConfigFromSurvey(richSurvey(), candidate, opts));
  for (const forbidden of [
    '입력에 없는 15년 경력', '주차 100대', '수상 경력', '98%', '120+', '3배',
    '단골 고객', '방문 고객', '해당 분야 경력 다년', '주소를 입력해주세요',
  ]) assert.equal(text.includes(forbidden), false, forbidden);
});

test('답하지 않은 메뉴·사진·FAQ·길·연락 정보는 섹션과 빈 플레이스홀더를 만들지 않는다', () => {
  const input = richSurvey();
  input.contentItems = [];
  input.storePhotoUrls = [];
  input.contentDepth = { version: 1, imports: [], facts: [], faqAnswers: [] };
  const config = buildSiteConfigFromSurvey(input, candidate, opts);
  assert.deepEqual(config.pages[0].sections.map((section) => section.id), [
    'sec-hero', 'sec-about', 'sec-features',
  ]);
  const text = visibleText(config);
  assert.doesNotMatch(text, /입력해주세요|가격 문의|예상 답변/u);
  const ids = new Set(config.pages[0].sections.map((section) => section.id));
  const hrefs = config.pages[0].sections.flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'button' && element.href?.startsWith('#') ? [element.href.slice(1)] : []);
  assert.equal(hrefs.every((href) => ids.has(href)), true);
});

test('대표 카페 시드의 인덱싱 본문은 얇은 레거시 홈보다 최소 세 배 깊다', () => {
  const rich = visibleText(buildSiteConfigFromSurvey(richSurvey(), candidate, opts)).replace(/\s/gu, '');
  const legacy = richSurvey();
  delete legacy.contentDepth;
  legacy.pagePlan = undefined;
  legacy.sectionPlan = [
    { type: 'hero', name: '첫 화면', brief: '', source: 'template', pageSlug: '' },
    { type: 'menu', name: '메뉴', brief: '', source: 'template', pageSlug: '' },
    { type: 'contact', name: '문의', brief: '', source: 'template', pageSlug: '' },
  ];
  const shallow = visibleText(buildSiteConfigFromSurvey(legacy, candidate, {
    heroImageUrl: opts.heroImageUrl, imagePool: opts.imagePool,
  })).replace(/\s/gu, '');
  assert.ok(rich.length >= shallow.length * 3, `${shallow.length} → ${rich.length}`);
});

test('MAIN opt-in은 고객 실제 이야기를 중심으로 소개를 두껍게 하고 철학을 별도 흐름으로 잇는다', () => {
  const before = richSurvey();
  const after = richSurvey();
  after.contentDepth!.mainStorytelling = {
    version: 1,
    brandStory: '온담은 커피를 서두르지 않고 즐길 수 있는 자리를 만들고 싶다는 마음을 담았습니다.',
    origin: '동네에서 오래 머물 수 있는 작은 공간을 직접 꾸리고 싶어 시작했습니다.',
    philosophy: '메뉴를 고르는 순간부터 자리를 나설 때까지 편안한 결을 지키고 싶습니다.',
  };
  const beforeConfig = buildSiteConfigFromSurvey(before, candidate, opts);
  const afterConfig = buildSiteConfigFromSurvey(after, candidate, opts);
  const storyText = (config: typeof afterConfig) => config.pages[0].sections
    .filter((section) => section.id === 'sec-about' || section.id === 'sec-features')
    .flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'text' ? [element.text] : [])
    .join(' ');
  const afterText = storyText(afterConfig);
  assert.match(afterText, /온담은 커피를 서두르지 않고 즐길 수 있는 자리를 만들고 싶다는 마음/);
  assert.match(afterText, /동네에서 오래 머물 수 있는 작은 공간을 직접 꾸리고 싶어 시작/);
  assert.match(afterText, /메뉴를 고르는 순간부터 자리를 나설 때까지 편안한 결/);
  assert.ok(afterText.replace(/\s/gu, '').length > storyText(beforeConfig).replace(/\s/gu, '').length);
  assert.deepEqual(afterConfig.pages[0].sections.slice(0, 3).map((section) => section.id), [
    'sec-hero', 'sec-about', 'sec-features',
  ]);
});
