import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SemanticOutline,
  SiteRenderer,
} from '@/components/site-renderer';
import {
  buildSitePlan,
} from '@/lib/content/site-plan';
import {
  permittedTestimonials,
  testimonialExposurePolicy,
} from '@/lib/content/testimonial-policy';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import {
  CTA_LAYOUT_VARIANT_IDS,
  DIRECTIONS_LAYOUT_VARIANT_IDS,
  TESTIMONIAL_LAYOUT_VARIANT_IDS,
  allowedSectionLayoutsForCandidate,
  recompileDirectionsSectionLayouts,
  resolveCtaLayoutVariant,
  resolveDirectionsLayoutVariant,
  resolveTestimonialLayoutVariant,
} from '@/lib/layout';
import type {
  CtaLayoutContent,
  DirectionsLayoutContent,
  SectionLayoutBreakpointBand,
  SectionLayoutCompiledFrame,
  SectionLayoutProjection,
  TestimonialLayoutContent,
} from '@/lib/layout';
import { checkPublish } from '@/lib/publish/preflight';
import type {
  SurveyInput,
  SurveyProofInput,
} from '@/lib/types/domain';
import {
  emptySiteConfig,
  type ButtonElement,
  type CanvasElement,
  type ImageElement,
  type MapElement,
  type Section,
  type SiteConfig,
  type TextElement,
} from '@/lib/types/site';

const ROOT = process.cwd();
const BANDS = ['wide', 'compact', 'mobile'] as const satisfies
  readonly SectionLayoutBreakpointBand[];
const EDGE_SAFE = 8;
const theme = tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 34));

function text(id: string, value: string, heading = false): TextElement {
  return {
    id,
    kind: 'text',
    text: value,
    frame: { x: 0, y: 0, w: 100, h: 30 },
    z: 2,
    style: {
      fontSize: heading ? 42 : 17,
      fontFamily: heading ? 'heading' : 'body',
      lineHeight: heading ? 1.3 : 1.65,
    },
  };
}

function button(id: string, label: string, href = '#contact'): ButtonElement {
  return {
    id,
    kind: 'button',
    label,
    href,
    frame: { x: 0, y: 0, w: 180, h: 48 },
    z: 3,
    style: { variant: 'solid' },
  };
}

function map(id: string): MapElement {
  return {
    id,
    kind: 'map',
    embedUrl: 'https://www.google.com/maps/embed?pb=customer-confirmed',
    frame: { x: 0, y: 0, w: 640, h: 400 },
    z: 1,
    style: {},
  };
}

function image(id: string): ImageElement {
  return {
    id,
    kind: 'image',
    src: '/mock/candidate-light.svg',
    alt: '고객이 게시를 허락한 인물 사진',
    frame: { x: 0, y: 0, w: 480, h: 600 },
    z: 1,
    style: { objectFit: 'cover' },
  };
}

function ctaFixture(): {
  elements: CanvasElement[];
  content: CtaLayoutContent;
} {
  return {
    elements: [
      text('cta-kicker', '다음 행동'),
      text('cta-title', '원하시는 일정을 확인하고 편하게 문의해 주세요', true),
      text('cta-lead', '고객이 직접 확인한 실제 문의 목적지로 연결합니다.'),
      button('cta-primary', '상담 가능한 시간을 확인하고 문의하기'),
      button('cta-secondary', '대표 전화로 문의하기'),
    ],
    content: {
      intro: {
        eyebrowId: 'cta-kicker',
        titleId: 'cta-title',
        leadId: 'cta-lead',
      },
      primaryActionId: 'cta-primary',
      secondaryActionId: 'cta-secondary',
    },
  };
}

function testimonialFixture(): {
  elements: CanvasElement[];
  content: TestimonialLayoutContent;
} {
  const quotes = [
    '상담 과정에서 필요한 내용을 차분하게 설명해 주셔서 선택 기준을 분명히 세울 수 있었습니다.',
    '예약 전에 궁금했던 내용을 홈페이지에서 확인하고 편하게 방문할 수 있었습니다.',
    '제 상황을 먼저 듣고 가능한 선택지를 알려 주셔서 준비 과정이 한결 수월했습니다.',
    '서비스를 받은 뒤에도 필요한 안내를 다시 확인할 수 있어 좋았습니다.',
    '처음 문의할 때부터 마무리까지 같은 기준으로 안내받았습니다.',
  ];
  const elements: CanvasElement[] = [
    text('testimonial-kicker', '고객의 이야기'),
    text('testimonial-title', '게시를 허락받은 실제 고객의 문장', true),
    text('testimonial-lead', '고객이 확인한 원문과 출처를 함께 보여드립니다.'),
    image('testimonial-photo-1'),
  ];
  quotes.forEach((quote, index) => {
    const number = index + 1;
    elements.push(
      text(`testimonial-quote-${number}`, quote),
      text(`testimonial-source-${number}`, `고객 제공 후기 · 2026-07-${number + 10}`),
      button(
        `testimonial-source-link-${number}`,
        '확인된 출처 보기',
        `https://example.com/review/${number}`,
      ),
    );
  });
  return {
    elements,
    content: {
      intro: {
        eyebrowId: 'testimonial-kicker',
        titleId: 'testimonial-title',
        leadId: 'testimonial-lead',
      },
      items: quotes.map((_, index) => {
        const number = index + 1;
        return {
          id: `testimonial-${number}`,
          quoteId: `testimonial-quote-${number}`,
          sourceId: `testimonial-source-${number}`,
          sourceLinkId: `testimonial-source-link-${number}`,
          ...(index === 0
            ? {
                photoId: 'testimonial-photo-1',
                photoConsentBound: true,
              }
            : {}),
        };
      }),
    },
  };
}

function directionsFixture(
  rowCount: number,
  withMap: boolean,
): {
  elements: CanvasElement[];
  content: DirectionsLayoutContent;
} {
  const rows = [
    ['주소', '서울시 고객 확인 주소 12'],
    ['전화', '02-1234-5678'],
    ['영업시간', '월요일부터 금요일 오전 10시부터 오후 7시까지'],
    ['찾아오는 길', '고객이 직접 입력한 지하철역 출구와 건물 안내'],
  ].slice(0, rowCount);
  const elements: CanvasElement[] = [
    text('directions-kicker', '방문 안내'),
    text('directions-title', '오시는 길과 이용 정보를 확인해 주세요', true),
    text('directions-lead', '고객이 직접 확인한 정보만 안내합니다.'),
    button('directions-place-link', '고객이 확인한 지도에서 보기', 'https://example.com/place'),
    button('directions-detail-link', '방문 안내 자세히 보기', '/directions'),
  ];
  rows.forEach(([label, value], index) => {
    const number = index + 1;
    elements.push(
      text(`directions-label-${number}`, label),
      text(`directions-value-${number}`, value),
    );
  });
  if (withMap) elements.push(map('directions-map'));
  return {
    elements,
    content: {
      intro: {
        eyebrowId: 'directions-kicker',
        titleId: 'directions-title',
        leadId: 'directions-lead',
      },
      mode: 'full',
      rows: rows.map((_, index) => ({
        id: `direction-${index + 1}`,
        labelId: `directions-label-${index + 1}`,
        valueId: `directions-value-${index + 1}`,
      })),
      mapId: 'directions-map',
      placeLinkId: 'directions-place-link',
      detailLinkId: 'directions-detail-link',
    },
  };
}

function overlap(
  left: SectionLayoutCompiledFrame,
  right: SectionLayoutCompiledFrame,
): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y),
  );
  return width * height;
}

function containsFrame(
  outer: SectionLayoutCompiledFrame,
  inner: SectionLayoutCompiledFrame,
): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h;
}

function assertProjectionGeometry(
  label: string,
  projection: SectionLayoutProjection,
): void {
  for (const band of BANDS) {
    const compiled = projection.bands[band];
    const frames = Object.entries(compiled.frames);
    assert.ok(frames.length > 0, `${label}/${band}: frames missing`);
    for (const [id, frame] of frames) {
      const isFullBleedMap = id === 'directions-map'
        && projection.resolvedId === 'directions.full-map-overlay';
      assert.ok(
        frame.x >= (isFullBleedMap ? 0 : EDGE_SAFE),
        `${label}/${band}/${id}: left overflow`,
      );
      assert.ok(
        frame.x + frame.w <= compiled.width - (isFullBleedMap ? 0 : EDGE_SAFE),
        `${label}/${band}/${id}: right overflow`,
      );
      assert.ok(frame.y >= 0, `${label}/${band}/${id}: top overflow`);
      assert.ok(
        frame.y + frame.h <= compiled.sectionHeight,
        `${label}/${band}/${id}: bottom overflow`,
      );
    }
    const flowFrames = frames.filter(([id]) => (
      !(id === 'directions-map' && projection.resolvedId === 'directions.full-map-overlay')
    ));
    for (let left = 0; left < flowFrames.length; left += 1) {
      for (let right = left + 1; right < flowFrames.length; right += 1) {
        assert.equal(
          overlap(flowFrames[left][1], flowFrames[right][1]),
          0,
          `${label}/${band}: ${flowFrames[left][0]} overlaps ${flowFrames[right][0]}`,
        );
      }
    }
  }
}

function testimonialProof(
  content = '게시를 허락받은 실제 고객 후기 문장',
): SurveyProofInput {
  return {
    kind: 'testimonial',
    content,
    sourceStatus: 'publication_permission',
    sourceUrl: 'https://example.com/customer-review',
    publisher: '고객 확인 출처',
    asOfDate: '2026-07-24',
  };
}

function surveyFor(
  industry: string,
  purposeId: SurveyInput['purposeId'] = 'booking_service',
): SurveyInput {
  const template = resolveTemplate(purposeId, industry);
  return {
    businessName: `${industry} 고객 사업`,
    purposeId,
    purpose: template.label,
    industry,
    tone: ['차분한'],
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    contentDepth: {
      version: 2,
      imports: [],
      facts: [
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
        { key: 'openingHours', value: '평일 10:00–19:00', source: 'customer' },
        { key: 'address', value: '서울시 고객 확인 주소', source: 'customer' },
      ],
      faqAnswers: [],
      surveyBrief: {
        version: 1,
        conversionDestination: { kind: 'phone_fact' },
        proofs: [
          testimonialProof(),
          testimonialProof('길이가 다른 두 번째 고객 후기 문장입니다.'),
        ],
      },
    },
  };
}

function testimonialSection(sentinel: string): Section {
  return {
    id: 'sec-testimonials-forged',
    type: 'testimonials',
    name: '고객 후기',
    height: 560,
    background: { color: theme.palette.background },
    elements: [
      text('testimonial-title-forged', '고객 후기', true),
      text('testimonial-quote-forged', sentinel),
    ],
  };
}

function safeSection(): Section {
  return {
    id: 'sec-about-safe',
    type: 'about',
    name: '소개',
    height: 420,
    background: { color: theme.palette.background },
    elements: [
      text('safe-title', '고객이 입력한 소개', true),
      text('safe-body', '이 문장은 차단 대상이 아닌 정상 콘텐츠입니다.'),
    ],
  };
}

function classifiedConfig(
  industryClass: 'medical' | 'legal',
  sentinel: string,
): SiteConfig {
  const config = emptySiteConfig(`${industryClass} guard`);
  config.theme = theme;
  config.meta.industryClass = industryClass;
  config.pages[0].sections = [safeSection(), testimonialSection(sentinel)];
  return config;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) && !/\.test\.(?:ts|tsx)$/u.test(entry.name)
      ? [path]
      : [];
  });
}

describe('LIB3 L3 — 9종 × 3밴드 콘텐츠 가변 회귀', () => {
  test('CTA 3종은 장문 라벨에서도 겹침·오버플로 없이 컴파일된다', () => {
    const fixture = ctaFixture();
    for (const requestedId of CTA_LAYOUT_VARIANT_IDS) {
      const projection = resolveCtaLayoutVariant({
        requestedId,
        ...fixture,
        theme,
      });
      assert.ok(projection);
      assertProjectionGeometry(requestedId, projection);
      const compactPrimary = projection.bands.compact.frames['cta-primary'];
      assert.ok(
        compactPrimary.w >= 300,
        `${requestedId}: compact long label must leave the narrow action column`,
      );
    }
  });

  test('후기 3종은 불균등 원문·출처·홀수 카드에서도 안전하게 컴파일된다', () => {
    const fixture = testimonialFixture();
    for (const requestedId of TESTIMONIAL_LAYOUT_VARIANT_IDS) {
      const projection = resolveTestimonialLayoutVariant({
        requestedId,
        ...fixture,
        theme,
      });
      assert.ok(projection);
      assert.equal(projection.requestedId, requestedId);
      assertProjectionGeometry(requestedId, projection);
    }
  });

  test('오시는 길 3종은 사실 1~4개와 지도 유무를 결정적으로 처리한다', () => {
    const rowCounts = [4, 1, 3] as const;
    DIRECTIONS_LAYOUT_VARIANT_IDS.forEach((requestedId, index) => {
      const fixture = directionsFixture(
        rowCounts[index],
        requestedId !== 'directions.info-card-stack',
      );
      const first = resolveDirectionsLayoutVariant({
        requestedId,
        ...fixture,
        theme,
      });
      const second = resolveDirectionsLayoutVariant({
        requestedId,
        ...fixture,
        theme,
      });
      assert.ok(first);
      assert.deepEqual(first, second);
      assert.equal(first.requestedId, requestedId);
      assertProjectionGeometry(requestedId, first);
      if (requestedId === 'directions.full-map-overlay') {
        for (const band of BANDS) {
          const compiled = first.bands[band];
          const surface = compiled.groupFrames?.['directions-map-surface'];
          const mapFrame = compiled.frames['directions-map'];
          assert.ok(surface, `${band}: overlay surface missing`);
          assert.ok(mapFrame, `${band}: map frame missing`);
          const foreground = Object.entries(compiled.frames)
            .filter(([elementId]) => elementId !== 'directions-map');
          assert.ok(foreground.length > 0);
          for (const [elementId, frame] of foreground) {
            assert.ok(
              containsFrame(surface, frame),
              `${band}/${elementId}: text bbox crosses the surface background boundary`,
            );
          }
          const mapBoundary = mapFrame.y + mapFrame.h;
          const boundaryCrossers = foreground.filter(([, frame]) => (
            frame.y < mapBoundary && frame.y + frame.h > mapBoundary
          ));
          for (const [elementId, frame] of boundaryCrossers) {
            assert.ok(
              surface.y <= frame.y && surface.y + surface.h >= frame.y + frame.h,
              `${band}/${elementId}: map boundary is not masked by one continuous surface`,
            );
          }
        }

        const config = emptySiteConfig('full map overlay stacking');
        config.theme = theme;
        config.pages[0].sections = [{
          id: 'sec-directions-full-map-overlay',
          type: 'contact',
          name: '오시는 길',
          height: first.bands.wide.sectionHeight,
          background: { color: theme.palette.background },
          elements: fixture.elements,
          sectionLayout: first,
        }];
        const html = renderToStaticMarkup(createElement(SiteRenderer, {
          config,
          mode: 'auto',
          interactive: false,
          animate: false,
        }));
        const surfaceIndex = html.indexOf(
          'data-section-layout-group="directions-map-surface"',
        );
        const backdropIndex = html.indexOf('z-index:0');
        assert.ok(surfaceIndex >= 0, 'map surface must render');
        assert.ok(backdropIndex > surfaceIndex, 'map backdrop must render behind the surface');
        assert.match(
          html,
          /\[data-section-layout-group\]\{[^}]*z-index:1/u,
          'surface layer must stay above the map backdrop',
        );
      }
    });
  });
});

describe('LIB3 C1 — permittedTestimonials 유일 경로', () => {
  test('presence·빌더·선택은 유일 projection을 소비하고 직접 후기 필터 우회가 없다', () => {
    const policyPath = join(ROOT, 'src/lib/content/testimonial-policy.ts');
    const directFilters = sourceFiles(join(ROOT, 'src')).filter((path) => (
      /proof\.kind\s*===\s*['"]testimonial['"]/u.test(readFileSync(path, 'utf8'))
    ));
    assert.deepEqual(directFilters, [policyPath]);

    for (const relative of [
      'src/lib/content/site-plan.ts',
      'src/lib/data/site-templates.ts',
      'src/lib/layout/selection.ts',
    ]) {
      const source = readFileSync(join(ROOT, relative), 'utf8');
      assert.match(source, /permittedTestimonials/u, `${relative}: projection not consumed`);
    }

    const survey = surveyFor('미용실');
    survey.contentDepth!.surveyBrief!.proofs!.push({
      ...testimonialProof('게시 허락이 없는 문장'),
      sourceStatus: 'customer_confirmed',
    });
    assert.equal(permittedTestimonials(survey).length, 2);
  });
});

describe('LIB3 C2·C3 — 의료 4계층·법률 단일 정책', () => {
  test('1차 선택 allowlist: 조작된 후기 availability도 의료 변형을 한 건도 허용하지 않는다', () => {
    const survey = surveyFor('의원');
    const allowed = allowedSectionLayoutsForCandidate(survey, {
      designDnaId: 'medical-clinical-clarity',
      availability: {
        features: 3,
        about: true,
        gallery: 0,
        cta: true,
        testimonials: 99,
        directions: 3,
      },
    });
    assert.deepEqual(allowed.testimonial, []);
  });

  test('2차 SitePlan: 승인 목록에 후기 요청을 주입해도 의료 계획에는 섹션·입력 넛지가 없다', () => {
    const survey = surveyFor('의원');
    survey.sectionPlan.push({
      type: 'testimonials',
      name: '조작된 후기 요청',
      brief: '앞단 선택을 우회한 요청',
      source: 'user',
    });
    const plan = buildSitePlan(survey);
    assert.equal(plan.sections.some((section) => section.type === 'testimonials'), false);
    assert.equal(plan.absentSections.some((section) => section.type === 'testimonials'), false);
  });

  test('3차 렌더 경계: 저장 config에 후기를 직접 주입해도 화면·시맨틱 출력에서 제외한다', () => {
    const sentinel = '의료 후기 렌더 우회 감시 문장';
    const config = classifiedConfig('medical', sentinel);
    const visual = renderToStaticMarkup(createElement(SiteRenderer, {
      config,
      mode: 'auto',
      interactive: false,
      animate: false,
    }));
    const semantic = renderToStaticMarkup(createElement(SemanticOutline, { config }));
    assert.doesNotMatch(visual, new RegExp(sentinel, 'u'));
    assert.doesNotMatch(semantic, new RegExp(sentinel, 'u'));
    assert.match(visual, /고객이 입력한 소개/u);
  });

  test('4차 발행 preflight: 렌더 가드를 우회한 오염 config도 발행을 차단한다', () => {
    const config = classifiedConfig('medical', '발행 차단 우회 감시 문장');
    const result = checkPublish(config, 'basic');
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((message) => message.includes('testimonial sections')));
  });

  test('법률과 의료는 조건문 난립 없이 같은 업종 정책 함수에서 fail-closed한다', () => {
    assert.deepEqual(testimonialExposurePolicy('medical'), {
      allowed: false,
      reason: 'medical-advertising-policy',
    });
    assert.deepEqual(testimonialExposurePolicy('legal'), {
      allowed: false,
      reason: 'legal-review-state-unavailable',
    });

    const legalSentinel = '법률 후기 자동 노출 감시 문장';
    const legalConfig = classifiedConfig('legal', legalSentinel);
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: legalConfig,
      mode: 'auto',
      interactive: false,
      animate: false,
    }));
    assert.doesNotMatch(html, new RegExp(legalSentinel, 'u'));
    assert.equal(checkPublish(legalConfig, 'basic').ok, false);

    const policyConsumers = [
      'src/lib/layout/selection.ts',
      'src/lib/content/site-plan.ts',
      'src/components/site-renderer/SiteRenderer.tsx',
      'src/lib/publish/preflight.ts',
    ];
    for (const relative of policyConsumers) {
      const source = readFileSync(join(ROOT, relative), 'utf8');
      assert.doesNotMatch(
        source,
        /industryClass\s*===\s*['"](?:medical|legal)['"]/u,
        `${relative}: testimonial industry policy bypass`,
      );
    }
  });
});

describe('LIB3 C4 — extras 후 directions 재컴파일', () => {
  test('extras 유·무 모두 결정적이고 requested ID는 절대 바뀌지 않는다', () => {
    const fixture = directionsFixture(3, false);
    const initial = resolveDirectionsLayoutVariant({
      requestedId: 'directions.map-info-split',
      ...fixture,
      theme,
    });
    assert.ok(initial);
    assert.equal(initial.requestedId, 'directions.map-info-split');
    assert.equal(initial.resolvedId, 'directions.info-card-stack');

    const config = emptySiteConfig('directions recompile');
    config.theme = theme;
    config.pages[0].sections = [{
      id: 'sec-directions',
      type: 'contact',
      name: '오시는 길',
      height: initial.bands.wide.sectionHeight,
      background: { color: theme.palette.background },
      elements: fixture.elements,
      sectionLayout: initial,
    }];

    const absentFirst = recompileDirectionsSectionLayouts(config);
    const absentSecond = recompileDirectionsSectionLayouts(config);
    assert.deepEqual(absentFirst, absentSecond);
    const absentProjection = absentFirst.pages[0].sections[0].sectionLayout;
    assert.equal(absentProjection?.requestedId, 'directions.map-info-split');
    assert.equal(absentProjection?.resolvedId, 'directions.info-card-stack');

    const withMap = structuredClone(config);
    withMap.pages[0].sections[0].elements.push(map('directions-map'));
    const presentFirst = recompileDirectionsSectionLayouts(withMap);
    const presentSecond = recompileDirectionsSectionLayouts(withMap);
    assert.deepEqual(presentFirst, presentSecond);
    const presentProjection = presentFirst.pages[0].sections[0].sectionLayout;
    assert.equal(presentProjection?.requestedId, 'directions.map-info-split');
    assert.equal(presentProjection?.resolvedId, 'directions.map-info-split');
  });
});

describe('LIB3 마케팅·저장 호환 불변식', () => {
  test('신규 카탈로그·렌더·선택 소스에 금지 문구가 없고 기존 projection은 additive다', () => {
    const files = [
      'src/lib/layout/cta-catalog.ts',
      'src/lib/layout/testimonial-catalog.ts',
      'src/lib/layout/directions-catalog.ts',
      'src/lib/layout/cta-layout-resolver.ts',
      'src/lib/layout/testimonial-layout-resolver.ts',
      'src/lib/layout/directions-layout-resolver.ts',
      'src/lib/layout/selection.ts',
    ];
    for (const relative of files) {
      assert.doesNotMatch(readFileSync(join(ROOT, relative), 'utf8'), /슬라이드/u);
    }

    const base = emptySiteConfig('legacy section projection');
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: base,
      mode: 'auto',
      interactive: false,
      animate: false,
    }));
    assert.doesNotMatch(html, /data-section-layout-group/u);
  });
});
