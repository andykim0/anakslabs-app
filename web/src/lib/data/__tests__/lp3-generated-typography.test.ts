import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { DESIGN_WIDTH, emptySiteConfig, type TextElement } from '@/lib/types/site';
import { generatedType, minTextFrameHeight } from '@/lib/design/typography-scale';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';

const candidate: DesignCandidate = {
  id: 'cand-warm-cozy',
  label: 'LP$ typography fixture',
  style: 'photo',
  heroImageUrl: '/mock/hero.webp',
  theme: emptySiteConfig('typography-fixture').theme,
  description: '',
};

const options = {
  heroImageUrl: '/mock/hero.webp',
  imagePool: Array.from({ length: 16 }, (_, index) => `/mock/image-${index}.webp`),
};

function survey(purposeId: SurveyInput['purposeId'], industry: string): SurveyInput {
  const template = resolveTemplate(purposeId, industry);
  return {
    businessName: '긴 한글 상호명을 가진 대표 매장',
    purposeId,
    purpose: '고객이 필요한 내용을 쉽게 찾는 홈페이지',
    industry,
    region: '서울특별시 마포구',
    tone: ['따뜻한', '단정한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    highlights: ['오래 지켜온 한결같은 기준', '처음 방문해도 이해하기 쉬운 안내', '필요한 내용을 숨김없이 설명'],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
  } as SurveyInput;
}

const fixtures = [
  ['local_store', '카페'],
  ['local_store', '파인다이닝'],
  ['company_brand', '법무법인'],
  ['portfolio', '사진 포트폴리오'],
  ['booking_service', '치과의원'],
  ['one_page', '작가'],
] as const satisfies readonly (readonly [SurveyInput['purposeId'], string])[];

function textById(
  config: ReturnType<typeof buildSiteConfigFromSurvey>,
  idFragment: string,
): TextElement {
  const element = config.pages
    .flatMap((page) => page.sections)
    .flatMap((section) => section.elements)
    .find((candidateElement) => candidateElement.kind === 'text' && candidateElement.id.includes(idFragment));
  assert.ok(element?.kind === 'text', `${idFragment} text fixture missing`);
  return element;
}

describe('LP$ L3 generated-site semantic typography', () => {
  test('generated frames use the central role scale while heading sizes stay authored', () => {
    const config = buildSiteConfigFromSurvey(survey('local_store', '카페'), candidate, options);
    const heroBody = textById(config, 'hero-sub');
    const intro = textById(config, 'subtitle');
    const longBody = textById(config, 'about-body');
    const cardBody = textById(config, 'menu-desc');
    const support = textById(config, 'menu-kicker');
    const heroHeading = textById(config, 'hero-title');

    assert.deepEqual(
      { fontSize: heroBody.style.fontSize, lineHeight: heroBody.style.lineHeight },
      generatedType('heroBody'),
    );
    assert.deepEqual(
      { fontSize: intro.style.fontSize, lineHeight: intro.style.lineHeight },
      generatedType('sectionIntro'),
    );
    assert.deepEqual(
      { fontSize: longBody.style.fontSize, lineHeight: longBody.style.lineHeight },
      generatedType('longBody'),
    );
    assert.deepEqual(
      { fontSize: cardBody.style.fontSize, lineHeight: cardBody.style.lineHeight },
      generatedType('cardBody'),
    );
    assert.deepEqual(
      { fontSize: support.style.fontSize, lineHeight: support.style.lineHeight },
      generatedType('support'),
    );
    assert.equal(heroHeading.style.fontSize, 76, 'generation typography pass must not rewrite headings');

    assert.ok(heroBody.frame.h >= minTextFrameHeight('heroBody', 2));
    assert.ok(intro.frame.h >= minTextFrameHeight('sectionIntro', 2));
    assert.ok(longBody.frame.h >= minTextFrameHeight('longBody', 4));
    assert.ok(cardBody.frame.h >= minTextFrameHeight('cardBody', 2));
  });

  test('representative generated configs reserve every element inside the fixed canvas section', () => {
    for (const [purposeId, industry] of fixtures) {
      const config = buildSiteConfigFromSurvey(survey(purposeId, industry), candidate, options);
      for (const page of config.pages) {
        for (const section of page.sections) {
          for (const element of section.elements) {
            const context = `${purposeId}/${industry}/${page.slug || 'home'}/${section.id}/${element.id}`;
            assert.ok(element.frame.x >= 0, `${context}: negative x`);
            assert.ok(element.frame.y >= 0, `${context}: negative y`);
            assert.ok(element.frame.w > 0 && element.frame.h > 0, `${context}: non-positive frame`);
            assert.ok(
              element.frame.x + element.frame.w <= DESIGN_WIDTH,
              `${context}: exceeds DESIGN_WIDTH`,
            );
            assert.ok(
              element.frame.y + element.frame.h <= section.height,
              `${context}: exceeds section height (${element.frame.y + element.frame.h} > ${section.height})`,
            );
            if (element.kind === 'text') {
              const oneLineHeight = element.style.fontSize * (element.style.lineHeight ?? 1.45);
              assert.ok(
                element.frame.h + 0.01 >= oneLineHeight,
                `${context}: frame cannot reserve one rendered line (${element.frame.h} < ${oneLineHeight})`,
              );
              if (element.id.includes('hero-chip-label') || element.id.includes('feat-title')) {
                assert.ok(
                  element.frame.h + 0.01 >= oneLineHeight * 2,
                  `${context}: long Korean label must reserve two lines`,
                );
              }
            }
          }

          const intro = section.elements.find(
            (element) => element.kind === 'text' && element.id.includes('subtitle'),
          );
          if (intro) {
            const precedingHeadingBottom = Math.max(
              0,
              ...section.elements
                .filter(
                  (element) =>
                    element.kind === 'text' &&
                    element.style.fontFamily === 'heading' &&
                    element.frame.y < intro.frame.y,
                )
                .map((element) => element.frame.y + element.frame.h),
            );
            const nextContentTop = Math.min(
              ...section.elements
                .filter(
                  (element) =>
                    element.id !== intro.id &&
                    element.frame.y > intro.frame.y,
                )
                .map((element) => element.frame.y),
            );
            assert.ok(
              intro.frame.y >= precedingHeadingBottom,
              `${purposeId}/${industry}/${section.id}: title overlaps section intro`,
            );
            assert.ok(
              nextContentTop >= intro.frame.y + intro.frame.h,
              `${purposeId}/${industry}/${section.id}: section intro overlaps content`,
            );
          }
        }
      }
    }
  });
});
