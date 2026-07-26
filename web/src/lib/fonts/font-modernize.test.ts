import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type { DesignDnaId } from '@/lib/design/dna/types';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import {
  applyModernKoreanFontPairing,
  fontPairingResourcesForText,
  KOREAN_FONT_PERFORMANCE_BUDGETS,
  MODERN_DNA_FONT_PAIRING_MAP,
  MODERN_KOREAN_FONT_SELECTION_POLICY,
} from '.';

const KOREAN_SERIF_PATTERN =
  /(?<!-)\bserif\b|noto serif|명조|myeongjo|바탕|batang|songmyung/iu;

function modernSurvey(): SurveyInput {
  const template = resolveTemplate('booking_service', '헤어 살롱');
  return {
    businessName: '온결 살롱',
    purposeId: 'booking_service',
    purpose: template.label,
    industry: '헤어 살롱',
    tone: ['차분한'],
    colorPreference: '#c98aa4',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    contentDepth: {
      version: 2,
      imports: [],
      facts: [
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
        { key: 'openingHours', value: '10:00–20:00', source: 'customer' },
      ],
      faqAnswers: [],
      mainStorytelling: {
        version: 1,
        brandStory: '원하는 모습을 함께 살피며 차분한 과정을 지향합니다.',
      },
      surveyBrief: {
        version: 1,
        targetCustomer: '나에게 맞는 스타일을 찾는 고객',
        visitorNeed: '서비스와 예약 방법 확인',
        valueProposition: '차분히 찾는 과정',
        conversionDestination: { kind: 'phone_fact' },
        proofs: [{
          kind: 'testimonial',
          content: '게시를 허락한 실제 고객 후기입니다. 과정과 설명이 차분했습니다.',
          sourceStatus: 'publication_permission',
          publisher: '고객 확인 출처',
        }],
      },
    },
  };
}

function candidate(modern: boolean): DesignCandidate {
  const theme = tokenSetToSiteTheme(expandTokens('beauty-soft-wellness', 346, {}));
  return {
    id: modern ? 'fontmod-modern' : 'fontmod-legacy',
    label: modern ? '현대 산세리프' : '기존 조판',
    style: '3d_render',
    imageDirectionId: 'abstract_editorial',
    heroImageUrl: '/mock/candidate-light.svg',
    theme: modern
      ? applyModernKoreanFontPairing(theme, 'kr-nanum-square-round-friendly')
      : theme,
    description: '폰트 현대화 회귀 시드',
    designDna: {
      catalogVersion: 1,
      dnaId: 'beauty-soft-wellness',
      hueSeed: 346,
      overrides: {},
    },
  };
}

function build(modern: boolean): SiteConfig {
  return buildSiteConfigFromSurvey(modernSurvey(), candidate(modern), {
    heroImageUrl: '/mock/candidate-light.svg',
    imagePool: [],
  });
}

function textElements(config: SiteConfig) {
  return config.pages.flatMap((page) =>
    page.sections.flatMap((section) =>
      section.elements.filter((element) => element.kind === 'text')));
}

describe('FONTMOD F3 — 신규 생성 산세리프 계약', () => {
  test('8 DNA 자동 매핑은 명조 없이 승인된 산세리프 3세트만 사용한다', () => {
    assert.equal(Object.keys(MODERN_DNA_FONT_PAIRING_MAP).length, 8);
    assert.deepEqual(
      [...new Set(Object.values(MODERN_DNA_FONT_PAIRING_MAP))].sort(),
      [
        'kr-gmarket-noto-structured',
        'kr-nanum-square-round-friendly',
        'kr-pretendard-neutral',
      ],
    );
    for (const id of Object.values(MODERN_DNA_FONT_PAIRING_MAP)) {
      assert.doesNotMatch(id, KOREAN_SERIF_PATTERN);
    }
  });

  test('후기 본문·가치 리드는 신규 pin에서 body 산세리프로 내려가고 OFF 역할은 보존된다', () => {
    const modern = build(true);
    const legacy = build(false);
    const selected = (config: SiteConfig) => textElements(config).filter((element) =>
      /el-main-values-lead|el-testimonial-quote/u.test(element.id));
    assert.ok(selected(modern).length >= 3);
    assert.ok(selected(modern).every((element) => element.style.fontFamily === 'body'));
    assert.ok(selected(legacy).every((element) => element.style.fontFamily === 'heading'));
    assert.equal(
      modern.theme.fontPairing?.selectionPolicy,
      MODERN_KOREAN_FONT_SELECTION_POLICY,
    );
  });

  test('신규 출력의 한글 heading·body와 긴 문장 렌더에 명조·세리프 스택이 없다', () => {
    const config = build(true);
    for (const element of textElements(config)) {
      if (!/[가-힣]/u.test(element.text)) continue;
      const role = element.style.fontFamily;
      const stack = role === 'heading'
        ? config.theme.fonts.heading
        : config.theme.fonts.body;
      assert.doesNotMatch(stack, KOREAN_SERIF_PATTERN, element.id);
    }
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config,
      mode: 'auto',
      interactive: false,
      animate: false,
      runtimeDelivery: 'client',
    }));
    assert.doesNotMatch(html, /Noto Serif|Nanum Myeongjo|SongMyung|바탕|명조/iu);
  });

  test('자동 매핑 3세트는 기존 FNT 첫화면·export 예산 안에 머문다', () => {
    const representativeText =
      '회사 소개 사업 분야 실적 문의 브랜드 스토리 가치 철학 검색 전환 월간 리포트';
    const measured = {
      'kr-pretendard-neutral': 97_396,
      'kr-nanum-square-round-friendly': 153_628,
      'kr-gmarket-noto-structured': 189_212,
    } as const;
    for (const id of new Set(Object.values(MODERN_DNA_FONT_PAIRING_MAP))) {
      const theme = applyModernKoreanFontPairing(
        tokenSetToSiteTheme(expandTokens(
          Object.entries(MODERN_DNA_FONT_PAIRING_MAP)
            .find(([, mapped]) => mapped === id)![0] as DesignDnaId,
          180,
          {},
        )),
        id,
      );
      const exported = fontPairingResourcesForText(theme, representativeText);
      assert.ok(exported, id);
      assert.ok(measured[id] <= KOREAN_FONT_PERFORMANCE_BUDGETS.firstScreenBytes);
      assert.ok(exported.bytes <= KOREAN_FONT_PERFORMANCE_BUDGETS.exportPairBytes);
    }
  });

  test('72렌더 harness가 실제 현대 폰트 안착 뒤 겹침·AA·nowrap·CLS를 강제한다', async () => {
    const source = await readFile(
      new URL('../../../scripts/render-template-gallery-review.tsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /applyModernKoreanFontPairing/u);
    assert.match(source, /document\.fonts\.ready/u);
    assert.match(source, /NAMED_TEMPLATE_CATALOG/u);
    for (const width of [1440, 768, 390]) {
      assert.match(source, new RegExp(`width: ${width}`, 'u'));
    }
    assert.match(source, /heroForegroundOverlaps/u);
    assert.match(source, /imageContrastMeasurements/u);
    assert.match(source, /applyCategoricalStockSupply/u);
    assert.match(source, /imageContrastSampleCount === 0/u);
    assert.match(source, /buttonNowrapViolations/u);
    assert.match(source, /record\.cls !== 0/u);
  });
});
