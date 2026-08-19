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
  ['The best clinic for implants', 'medical-superlative-absolute'],
  ['#1 provider', 'medical-superlative-absolute'],
  ['The only practice offering this treatment', 'medical-superlative-absolute'],
  ['We guarantee 100% results', 'medical-guarantee-safety'],
  ['A completely safe treatment', 'medical-guarantee-safety'],
  ['No side effects', 'medical-guarantee-safety'],
  ['Permanent results', 'medical-guarantee-safety'],
  ['Instant treatment results', 'medical-instant-effect'],
  ['Immediate relief after treatment', 'medical-instant-effect'],
  ['Results in one visit', 'medical-instant-effect'],
  ['Patient testimonial', 'medical-treatment-testimonial'],
  ['Before-and-after results', 'medical-treatment-testimonial'],
  ['My treatment completely healed the condition', 'medical-treatment-testimonial'],
  ['Safer than other clinics', 'medical-comparison'],
  ['More effective than other providers', 'medical-comparison'],
  ['A breakthrough treatment', 'medical-unassessed-technology'],
  ['Clinically proven technology', 'medical-unassessed-technology'],
  ['Award-winning specialist', 'medical-endorsement-puffery'],
] as const;

/**
 * Still detected, never a violation: the practice attests to the credential, so it is recorded for
 * review rather than screened out. Kept as a seed list so a rule that stops matching fails here.
 */
const ADVISORY_SEEDS = [
  ['Board-certified provider', 'medical-credential-claim'],
  ['A certified specialist on staff', 'medical-credential-claim'],
  ['An accredited practice', 'medical-credential-claim'],
  ['A fellowship-trained surgeon', 'medical-credential-claim'],
] as const;

const SAFE_SUBJECTS = [
  'First visit information',
  'Appointment options',
  'Parking information',
  'Office Wi-Fi',
  'Scheduling process',
  'Infection-control process',
  'Verified booking information',
  'Office hours',
  'Provider profile',
  'Accessibility information',
  'Preparation instructions',
  'Risk information',
] as const;

const SAFE_PREDICATES = [
  'is available on the website.',
  'is presented as a verified practice fact.',
  'can be reviewed before check-in.',
  'is explained in plain language.',
  'does not promise an individual outcome.',
  'is organized for patients before a visit.',
  'uses only customer-provided information.',
  'includes the process and relevant limitations.',
  'is available by phone or through the booking link.',
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
        label: 'Book appointment하기',
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
  test('the US federal baseline and counsel-review holdouts are explicit', () => {
    assert.equal(MEDICAL_AD_POLICY_VERSION, 'us-medical-ad-2026-08-v1');
    const byCategory = new Map(MEDICAL_AD_RULES.map((rule) => [rule.category, rule]));
    const refs = (category: MedicalAdRule['category']): readonly string[] =>
      byCategory.get(category)?.statuteRefs ?? [];
    assert.deepEqual(refs('comparison'), ['FTC Act Sections 5 and 12']);
    assert.ok(refs('treatment-testimonial').includes('FTC Endorsement Guides'));
    assert.ok(refs('unassessed-technology').includes('FTC Health Products Compliance Guidance'));
    for (const category of ['disparagement', 'patient-inducement', 'article-format'] as const) {
      assert.equal(byCategory.get(category)?.enabled, false);
      assert.equal(byCategory.get(category)?.usDisposition, 'inactive-review-required');
      assert.deepEqual(refs(category), ['US review required']);
    }
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

  test(`자격 advisory 씨앗 ${ADVISORY_SEEDS.length}건은 검출되되 위반이 아니다`, () => {
    for (const [copy, expectedRule] of ADVISORY_SEEDS) {
      const result = screenMedicalCopy(copy);
      assert.deepEqual(result.violations, [], copy);
      assert.ok(
        result.advisories.some((advisory) => advisory.ruleId === expectedRule),
        `${copy}: ${expectedRule}\n${JSON.stringify(result.advisories, null, 2)}`,
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
    assert.equal(normalizeMedicalCopy('  B\u200B.est   １００％  '), 'b est 100%');
    assert.equal(normalizeMedicalCopy('First visit booking'), 'first visit booking');
    assert.deepEqual(screenMedicalCopy('Book after reviewing the first-visit instructions.').violations, []);
    assert.deepEqual(screenMedicalCopy('Review the infection-control process.').violations, []);
    assert.deepEqual(screenMedicalCopy('Confirm the appointment details.').violations, []);
    assert.deepEqual(screenMedicalCopy('Free parking and Wi-Fi are available.').violations, []);
    assert.deepEqual(screenMedicalCopy('The scheduling process is explained here.').violations, []);
  });

  test('warn은 block과 구분돼 향후 사람 검토 seam이 triage할 수 있다', () => {
    const warning = screenMedicalCopy('An award-winning provider offers care.').violations;
    assert.equal(warning.length, 1);
    assert.equal(warning[0].severity, 'warn');
    const blocker = screenMedicalCopy('We guarantee a cure.').violations;
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
