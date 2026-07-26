import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { SemanticOutline } from '@/components/site-renderer/SemanticOutline';
import {
  MEDICAL_AD_POLICY_VERSION,
  MEDICAL_AD_RULES,
  MEDICAL_COPY_FIELD_COVERAGE,
  collectMedicalPublicCopy,
  normalizeMedicalCopy,
  screenMedicalCopy,
  type MedicalAdRule,
} from '@/lib/content/medical-ad-policy';
import { buildJsonLd } from '@/lib/seo/jsonld';
import {
  emptySiteConfig,
  type CanvasElement,
  type CustomerCaseMedia,
  type MotionMedia,
  type MotionScene,
  type Section,
  type SiteConfig,
} from '@/lib/types/site';

const FORBIDDEN_SEEDS = [
  ['국내 유일의 치료', 'medical-superlative-absolute'],
  ['최.고 의료진', 'medical-superlative-absolute'],
  ['1 위 클리닉', 'medical-superlative-absolute'],
  ['No.1 병원', 'medical-superlative-absolute'],
  ['치료 효과 １００％', 'medical-guarantee-safety'],
  ['완 치를 약속합니다', 'medical-guarantee-safety'],
  ['부작용\u200B 없이 진행합니다', 'medical-guarantee-safety'],
  ['절대 안전한 치료입니다', 'medical-guarantee-safety'],
  ['재발 없는 결과', 'medical-guarantee-safety'],
  ['즉-시 효-과를 확인하세요', 'medical-instant-effect'],
  ['단 번에 개선됩니다', 'medical-instant-effect'],
  ['바로 낫는 치료', 'medical-instant-effect'],
  ['환자 치료 후기', 'medical-treatment-testimonial'],
  ['완치 체험담을 소개합니다', 'medical-treatment-testimonial'],
  ['제가 시술을 받고 좋아졌습니다', 'medical-treatment-testimonial'],
  ['타 병원보다 우수합니다', 'medical-comparison'],
  ['다른 의원과 비교해 뛰어납니다', 'medical-comparison'],
  ['다른 병원은 위험합니다', 'medical-disparagement'],
  ['저렴한 곳은 부실합니다', 'medical-disparagement'],
  ['비급여 진료비 할인', 'medical-patient-inducement'],
  ['시술 1 + 1 이벤트', 'medical-patient-inducement'],
  ['선착순 수술 특가', 'medical-patient-inducement'],
  ['미 검증 신 의료 기술', 'medical-unassessed-technology'],
  ['기적의 치료 효과', 'medical-unassessed-technology'],
  ['공식 인증 전문의', 'medical-qualification-endorsement'],
  ['국가 인증 병원', 'medical-qualification-endorsement'],
  ['전문가가 추천하는 병원', 'medical-article-format'],
  ['언론이 주목한 클리닉', 'medical-article-format'],
] as const;

const SAFE_SUBJECTS = [
  '첫 방문 안내',
  '바로 예약',
  '무료 주차',
  '무료 와이파이',
  '일반 예약 서비스 경험담',
  '감염 안전 관리',
  '확실히 확인한 예약 정보',
  '진료 시간 안내',
  '의료진 소개',
  '접근성 안내',
  '검사 전 준비 안내',
  '부작용 안내',
] as const;

const SAFE_PREDICATES = [
  '내용을 홈페이지에서 확인할 수 있습니다.',
  '정보를 사실대로 안내합니다.',
  '궁금한 점은 접수 전에 확인해 주세요.',
  '운영 기준을 차분하게 설명합니다.',
  '개인별 진료 결과를 단정하지 않습니다.',
  '방문 전에 필요한 정보를 정리했습니다.',
  '고객이 입력한 내용만 표시합니다.',
  '진료 과정과 주의사항을 함께 살펴보세요.',
  '전화나 예약 링크로 문의할 수 있습니다.',
] as const;

const SAFE_MEDICAL_COPY = SAFE_SUBJECTS.flatMap((subject) =>
  SAFE_PREDICATES.map((predicate) => `${subject}: ${predicate}`),
);

function text(id: string, value: string, heading = false): CanvasElement {
  return {
    id,
    kind: 'text',
    text: value,
    frame: { x: 20, y: 20, w: 500, h: 80 },
    z: 2,
    style: {
      fontSize: heading ? 44 : 18,
      fontFamily: heading ? 'heading' : 'body',
    },
  };
}

function motionMedia(id: string, alt = `${id} 대체 텍스트`): MotionMedia {
  return {
    id,
    kind: 'image',
    src: `/medical/${id}.webp`,
    alt,
    caption: `${id} 캡션`,
    width: 1600,
    height: 900,
    provenance: 'curated',
  };
}

function caseMedia(id: string): CustomerCaseMedia {
  return {
    ...motionMedia(id),
    kind: 'image',
    provenance: 'customer-provided',
    assetId: `asset-${id}`,
    caseId: 'case-1',
  };
}

function everyMotionScene(): MotionScene[] {
  return [
    {
      signatureId: 'cinematic-scrub',
      pageId: 'home',
      sectionId: 'sec-hero',
      heading: '시네마틱 제목',
      body: '시네마틱 본문',
      media: motionMedia('cinematic'),
    },
    {
      signatureId: 'scrollytelling-manifesto',
      pageId: 'home',
      sectionId: 'sec-faq',
      media: motionMedia('manifesto'),
      acts: [{ id: 'act-1', heading: '매니페스토 막 제목', body: '매니페스토 막 본문' }],
    },
    {
      signatureId: 'sticky-chapters',
      pageId: 'home',
      sectionId: 'sec-faq',
      chapters: [{
        id: 'chapter-1',
        sourceSectionId: 'sec-faq',
        heading: '챕터 제목',
        body: '챕터 본문',
        media: motionMedia('chapter'),
      }],
    },
    {
      signatureId: 'true-card-stack',
      pageId: 'home',
      sectionId: 'sec-faq',
      heading: '카드 스택 제목',
      cards: [{
        id: 'card-1',
        heading: '카드 제목',
        body: '카드 본문',
        caption: '카드 캡션',
        media: motionMedia('card'),
      }],
    },
    {
      signatureId: 'portal-zoom',
      pageId: 'home',
      sectionId: 'sec-faq',
      scenes: [{
        id: 'portal-1',
        sourceSectionId: 'sec-faq',
        heading: '포털 제목',
        body: '포털 본문',
        media: motionMedia('portal'),
      }],
    },
    {
      signatureId: 'scroll-curtain',
      pageId: 'home',
      sectionId: 'sec-faq',
      scenes: [{
        id: 'curtain-1',
        sourceSectionId: 'sec-faq',
        heading: '커튼 제목',
        body: '커튼 본문',
        media: motionMedia('curtain'),
      }],
    },
    {
      signatureId: 'mosaic-reveal',
      pageId: 'home',
      sectionId: 'sec-faq',
      heading: '모자이크 제목',
      images: [motionMedia('mosaic')],
    },
    {
      signatureId: 'path-journey',
      pageId: 'home',
      sectionId: 'sec-faq',
      heading: '여정 제목',
      milestones: [{
        id: 'milestone-1',
        heading: '이정표 제목',
        body: '이정표 본문',
        caption: '이정표 캡션',
      }],
    },
    {
      signatureId: 'before-after-scrub',
      pageId: 'home',
      sectionId: 'sec-faq',
      heading: '전후 비교 제목',
      caseId: 'case-1',
      before: caseMedia('before'),
      after: caseMedia('after'),
      sameCaseAttested: true,
      publicationRightsAttested: true,
    },
    {
      signatureId: 'horizontal-story',
      pageId: 'home',
      sectionId: 'sec-faq',
      heading: '가로 이야기 제목',
      panels: [{
        id: 'panel-1',
        sourceSectionId: 'sec-faq',
        heading: '패널 제목',
        body: '패널 본문',
        media: motionMedia('panel'),
      }],
    },
  ];
}

function coverageConfig(): SiteConfig {
  const config = emptySiteConfig('의료 수집기 메타 제목');
  const section: Section = {
    id: 'sec-faq',
    type: 'faq',
    name: '질문과 답변 섹션명',
    height: 900,
    background: { color: '#ffffff' },
    acts: [{ heading: '섹션 막 제목', body: '섹션 막 본문' }],
    elements: [
      text('question', '예약은 어떻게 하나요?', true),
      text('answer', '전화와 예약 링크로 신청할 수 있습니다.'),
      {
        id: 'image',
        kind: 'image',
        src: '/medical/clinic.webp',
        alt: '진료 공간 이미지 설명',
        frame: { x: 20, y: 160, w: 500, h: 300 },
        z: 1,
        style: {},
      },
      {
        id: 'button',
        kind: 'button',
        label: '예약 문의하기',
        href: '/contact',
        frame: { x: 20, y: 500, w: 180, h: 50 },
        z: 2,
        style: { variant: 'solid' },
      },
      {
        id: 'form',
        kind: 'form',
        formType: 'contact',
        fields: ['name', 'phone', 'message'],
        submitLabel: '문의 보내기',
        frame: { x: 20, y: 570, w: 500, h: 200 },
        z: 2,
        style: { variant: 'plain' },
      },
      {
        id: 'social',
        kind: 'socialLinks',
        links: [{ kind: 'instagram', url: 'https://instagram.com/clinic', label: '공식 소식 보기' }],
        frame: { x: 20, y: 800, w: 300, h: 50 },
        z: 2,
        style: { direction: 'row' },
      },
    ],
  };
  return {
    ...config,
    meta: {
      title: '의료 수집기 메타 제목',
      description: '의료 수집기 메타 설명',
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
      region: '서울',
    },
    pages: [{
      id: 'home',
      title: '홈페이지 제목',
      navLabel: '홈 내비 라벨',
      slug: '',
      sections: [section],
    }],
    businessInfo: {
      businessName: '수집의원',
      ownerName: '홍길동',
      businessNumber: '123-45-67890',
      address: '서울시 수집로 1',
      phone: '02-1234-5678',
      email: 'hello@example.com',
      mailOrderNumber: '제2026-서울-0001호',
    },
    publicContact: {
      version: 1,
      phone: '02-1234-5678',
      address: '서울시 수집로 1',
    },
    motion: {
      presetId: 'cinematic',
      intensity: 'normal',
      catalogVersion: 2,
      signatures: everyMotionScene(),
    },
  };
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap(stringLeaves);
}

describe('MEDLAW R1 — 법조문과 정밀도', () => {
  test('정책 버전과 현행 조·항·호 매핑을 고정하고 제56조 제3항을 오용하지 않는다', () => {
    assert.equal(MEDICAL_AD_POLICY_VERSION, 'medical-ad-2026-07-v1');
    const byCategory = new Map(MEDICAL_AD_RULES.map((rule) => [rule.category, rule]));
    const refs = (category: MedicalAdRule['category']) => byCategory.get(category)?.statuteRefs ?? [];
    assert.deepEqual(refs('comparison'), ['의료법 제56조 제2항 제4호']);
    assert.deepEqual(refs('disparagement'), ['의료법 제56조 제2항 제5호']);
    assert.deepEqual(refs('treatment-testimonial'), ['의료법 제56조 제2항 제2호']);
    assert.deepEqual(refs('patient-inducement'), [
      '의료법 제56조 제2항 제13호',
      '의료법 제27조 제3항',
    ]);
    assert.deepEqual(refs('unassessed-technology'), [
      '의료법 제56조 제2항 제1호',
      '의료법 제56조 제2항 제8호',
    ]);
    assert.deepEqual(refs('qualification-endorsement'), [
      '의료법 제56조 제2항 제9호',
      '의료법 제56조 제2항 제14호',
    ]);
    assert.deepEqual(refs('article-format'), ['의료법 제56조 제2항 제10호']);
    assert.deepEqual(refs('side-effect-omission'), ['의료법 제56조 제2항 제7호']);
    assert.equal(JSON.stringify(MEDICAL_AD_RULES).includes('제56조 제3항'), false);
  });

  test(`금지표현 씨앗 ${FORBIDDEN_SEEDS.length}건 recall 100%`, () => {
    for (const [copy, expectedRule] of FORBIDDEN_SEEDS) {
      const result = screenMedicalCopy(copy);
      assert.ok(
        result.violations.some((violation) => violation.ruleId === expectedRule),
        `${copy}: ${expectedRule}\n${JSON.stringify(result.violations, null, 2)}`,
      );
    }
  });

  test(`안전 의료 문장 ${SAFE_MEDICAL_COPY.length}건 false positive 0`, () => {
    assert.ok(SAFE_MEDICAL_COPY.length >= 100);
    for (const copy of SAFE_MEDICAL_COPY) {
      assert.deepEqual(screenMedicalCopy(copy).violations, [], copy);
    }
  });

  test('NFKC·제로폭·구두점·선택적 띄어쓰기만 정규화하고 전체 공백은 보존한다', () => {
    assert.equal(normalizeMedicalCopy('  최\u200B.고   １００％  '), '최 고 100%');
    assert.equal(normalizeMedicalCopy('첫 방문 바로 예약'), '첫 방문 바로 예약');
    assert.deepEqual(screenMedicalCopy('첫 방문 후 바로 예약하세요.').violations, []);
    assert.deepEqual(screenMedicalCopy('안전 관리와 감염 안전 기준을 안내합니다.').violations, []);
    assert.deepEqual(screenMedicalCopy('예약 정보를 확실히 확인해 드립니다.').violations, []);
    assert.deepEqual(screenMedicalCopy('무료 주차와 무료 와이파이를 제공합니다.').violations, []);
    assert.deepEqual(screenMedicalCopy('예약 서비스 이용 경험담을 정리했습니다.').violations, []);
  });

  test('warn은 block과 구분돼 향후 사람 검토 seam이 triage할 수 있다', () => {
    const warning = screenMedicalCopy('공식 인증 전문의가 진료합니다.').violations;
    assert.equal(warning.length, 1);
    assert.equal(warning[0].severity, 'warn');
    const blocker = screenMedicalCopy('완치를 약속합니다.').violations;
    assert.equal(blocker[0].severity, 'block');
  });
});

describe('MEDLAW R1 — 공개 카피 수집기와 타입 소진', () => {
  const config = coverageConfig();
  const copies = collectMedicalPublicCopy(config);
  const paths = new Set(copies.map((copy) => copy.path));

  test('meta·page·section·CTA·폼·alt·SNS·FAQ·identity를 수집한다', () => {
    for (const path of [
      'meta.title',
      'meta.description',
      'pages[0].title',
      'pages[0].navLabel',
      'pages[0].sections[0].name',
      'pages[0].sections[0].acts[0].heading',
      'pages[0].sections[0].acts[0].body',
      'pages[0].sections[0].elements[0].text',
      'pages[0].sections[0].elements[1].text',
      'pages[0].sections[0].elements[2].alt',
      'pages[0].sections[0].elements[3].label',
      'pages[0].sections[0].elements[4].submitLabel',
      'pages[0].sections[0].elements[5].links[0].label',
      'businessInfo.businessName',
      'businessInfo.ownerName',
      'businessInfo.businessNumber',
      'businessInfo.address',
      'businessInfo.phone',
      'businessInfo.email',
      'businessInfo.mailOrderNumber',
      'publicContact.phone',
      'publicContact.address',
    ]) {
      assert.ok(paths.has(path), path);
    }
    assert.equal(
      copies.find((copy) => copy.path === 'pages[0].sections[0].elements[0].text')?.scope,
      'faq',
    );
  });

  test('MotionScene 전 변형의 heading·body·caption·media alt를 수집한다', () => {
    const motionCopies = copies.filter((copy) => copy.path.startsWith('motion.signatures'));
    const joined = motionCopies.map((copy) => copy.text).join('\n');
    for (const sentinel of [
      '시네마틱 제목',
      '시네마틱 본문',
      '매니페스토 막 제목',
      '매니페스토 막 본문',
      '챕터 제목',
      '챕터 본문',
      '카드 제목',
      '카드 본문',
      '카드 캡션',
      '포털 제목',
      '커튼 제목',
      '모자이크 제목',
      '여정 제목',
      '이정표 캡션',
      '전후 비교 제목',
      '가로 이야기 제목',
      '패널 본문',
      'panel 대체 텍스트',
      'panel 캡션',
    ]) {
      assert.match(joined, new RegExp(sentinel, 'u'), sentinel);
    }
    assert.equal(new Set(everyMotionScene().map((scene) => scene.signatureId)).size, 10);
  });

  test('JSON-LD의 모든 문자열과 SemanticOutline의 텍스트가 수집 결과 안에 있다', () => {
    const jsonLdCopies = new Set(
      copies.filter((copy) => copy.sourceKind === 'derived-jsonld').map((copy) => copy.text),
    );
    for (const leaf of stringLeaves(buildJsonLd(config, 'https://medical-copy.invalid', ''))) {
      assert.ok(jsonLdCopies.has(leaf), `JSON-LD 누락: ${leaf}`);
    }

    const semanticCopies = new Set(
      copies
        .filter((copy) => copy.sourceKind === 'derived-semantic-outline')
        .map((copy) => copy.text),
    );
    const rendered = parse(
      renderToStaticMarkup(createElement(SemanticOutline, { config })),
    ).textContent;
    for (const sentinel of [
      '수집의원',
      '의료 수집기 메타 설명',
      '질문과 답변 섹션명',
      '섹션 막 제목',
      '섹션 막 본문',
    ]) {
      assert.match(rendered, new RegExp(sentinel, 'u'));
      assert.ok(semanticCopies.has(sentinel), `SemanticOutline 누락: ${sentinel}`);
    }
  });

  test('필드 소유권 표가 모든 공개 계약 타입을 포함하고 collect/derive/ignore만 사용한다', () => {
    const keys = Object.keys(MEDICAL_COPY_FIELD_COVERAGE);
    assert.ok(keys.length >= 25);
    const dispositions = JSON.stringify(MEDICAL_COPY_FIELD_COVERAGE);
    assert.doesNotMatch(dispositions, /undefined|null/u);
    for (const coverage of Object.values(MEDICAL_COPY_FIELD_COVERAGE)) {
      for (const disposition of Object.values(coverage)) {
        assert.ok(['collect', 'derive', 'ignore'].includes(disposition), disposition);
      }
    }
  });
});
