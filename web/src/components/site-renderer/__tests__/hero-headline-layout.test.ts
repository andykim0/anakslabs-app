import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import { tokenRemToPx } from '@/lib/design/site-theme-tokens';
import { mobileFontSize } from '@/components/site-renderer/scale';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { ButtonElement, Section, TextElement } from '@/lib/types/site';

const TITLES = {
  one: '오늘의 결을 만납니다',
  two: '원하는 모습을\n차분하게 고릅니다',
  three: '온결 살롱\n원하는 모습을 고르는 일부터',
} as const;

const VIEWPORTS = [
  { band: 'wide', width: 1440, mode: 'desktop' },
  { band: 'compact', width: 768, mode: 'mobile' },
  { band: 'mobile', width: 390, mode: 'mobile' },
] as const;

const theme = tokenSetToSiteTheme(expandTokens('dining-refined-contrast', 28));
const candidate: DesignCandidate = {
  id: 'hero-headline-matrix',
  label: '히어로 헤드라인 회귀',
  style: 'photo',
  heroImageUrl: '/mock/hero.svg',
  theme,
  description: '',
};

function survey(): SurveyInput {
  return {
    businessName: '온결 살롱',
    purposeId: 'booking_service',
    purpose: '예약·서비스업',
    industry: '미용실',
    tagline: '나에게 맞는 결을 차분하게 찾습니다',
    tone: ['차분한'],
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    templateId: 'booking_service.default',
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '', source: 'template', pageSlug: '' },
    ],
    highlights: ['결에 맞춘 상담', '예약 전에 확인하는 상세 안내', '차분한 관리 시간'],
  };
}

function configFor(title: string) {
  return buildSiteConfigFromSurvey(survey(), candidate, {
    heroImageUrl: '/mock/hero.svg',
    imagePool: [],
    heroVariant: 'fullbleed',
    copy: {
      heroKicker: '예약·서비스업',
      heroTitle: title,
      heroSub: '나에게 맞는 결을 차분하게 찾습니다',
    },
  });
}

function heroOf(title: string): Section {
  const hero = configFor(title).pages[0]?.sections.find((section) => section.type === 'hero');
  if (!hero) throw new Error('hero fixture missing');
  return hero;
}

function text(hero: Section, fragment: string): TextElement {
  const element = hero.elements.find((candidate) => (
    candidate.kind === 'text' && candidate.id.includes(fragment)
  ));
  if (element?.kind !== 'text') throw new Error(`${fragment} fixture missing`);
  return element;
}

function button(hero: Section, secondary = false): ButtonElement {
  const element = hero.elements.find((candidate) => (
    candidate.kind === 'button'
    && candidate.id.includes(secondary ? 'hero-cta2' : 'hero-cta')
    && (secondary || !candidate.id.includes('cta2'))
  ));
  if (element?.kind !== 'button') throw new Error('CTA fixture missing');
  return element;
}

function assertCanvasFlow(hero: Section, viewportWidth: number): void {
  const title = text(hero, 'hero-title');
  const lead = text(hero, 'hero-sub');
  const chips = hero.elements.filter((element) => element.id.includes('hero-chip-label'));
  const primary = button(hero);
  const secondary = button(hero, true);
  const scale = viewportWidth / 1440;
  const titleBottom = (title.frame.y + title.frame.h) * scale;
  const leadTop = lead.frame.y * scale;
  const leadBottom = (lead.frame.y + lead.frame.h) * scale;
  const firstChipTop = (chips[0]?.frame.y ?? primary.frame.y) * scale;
  const ctaTop = primary.frame.y * scale;

  assert.ok(titleBottom <= leadTop, 'headline must not overlap the lead');
  assert.ok(leadBottom <= firstChipTop, 'lead must not overlap chips/actions');
  assert.ok(chips.every((chip) => (chip.frame.y + chip.frame.h) * scale <= ctaTop));
  assert.equal(primary.frame.y, secondary.frame.y, 'CTA pair must share one baseline');
  assert.ok(primary.frame.y + primary.frame.h <= hero.height, 'primary CTA stays inside hero');
  assert.ok(secondary.frame.y + secondary.frame.h <= hero.height, 'secondary CTA stays inside hero');
  for (const element of [title, lead, primary, secondary]) {
    assert.ok(element.frame.x >= 0);
    assert.ok(element.frame.x + element.frame.w <= 1440, `${element.id} exceeds canvas width`);
  }
}

describe('FIXHERO2 헤드라인 길이 × 뷰포트 밴드', () => {
  for (const [length, titleValue] of Object.entries(TITLES)) {
    const config = configFor(titleValue);
    const hero = heroOf(titleValue);
    for (const viewport of VIEWPORTS) {
      test(`${length}행 / ${viewport.band}(${viewport.width}) — 겹침·오버플로 0, CTA 정상`, () => {
        if (viewport.mode === 'desktop') {
          assertCanvasFlow(hero, viewport.width);
          return;
        }

        const html = renderToStaticMarkup(createElement(SiteRenderer, {
          config,
          mode: viewport.mode,
          interactive: false,
          animate: false,
        }));
        const document = parse(html);
        const section = document.querySelector('section[data-section-type="hero"]');
        assert.ok(section);
        const paragraphs = [...section.querySelectorAll('p')];
        const titleNode = paragraphs.find((node) => node.textContent === titleValue);
        const leadNode = paragraphs.find((node) => node.textContent === survey().tagline);
        const primary = section.querySelector('.anaks-btn[data-variant="solid"]');
        const secondary = section.querySelector('.anaks-btn[data-variant="outline"]');
        assert.ok(titleNode && leadNode && primary && secondary);
        assert.ok(html.indexOf(titleValue) < html.indexOf(survey().tagline ?? ''));
        assert.ok(html.indexOf(survey().tagline ?? '') < html.indexOf('문의하기'));
        assert.match(primary.getAttribute('style') ?? '', /white-space:nowrap/);
        assert.match(secondary.getAttribute('style') ?? '', /white-space:nowrap/);

        if (length === 'three') {
          const safeWrapper = section.querySelector(
            '[data-hero-copy-safe-inline="dna-element-gap"]',
          );
          assert.ok(safeWrapper);
          const safeWrapperStyle = safeWrapper.getAttribute('style') ?? '';
          assert.match(
            safeWrapperStyle,
            new RegExp(`padding-inline:${theme.tokens!.spacing.elementGap}`),
          );
          assert.match(safeWrapperStyle, /box-sizing:border-box/);
          const wrapperStyle = [
            titleNode.parentNode?.getAttribute('style'),
            titleNode.parentNode?.parentNode?.getAttribute('style'),
          ].filter(Boolean).join(';');
          const expectedFont = mobileFontSize(Math.min(
            76,
            tokenRemToPx(theme.tokens!.typography.size.title),
          ));
          assert.match(wrapperStyle, /min-width:0/);
          assert.match(wrapperStyle, /max-width:100%/);
          assert.match(titleNode.getAttribute('style') ?? '', new RegExp(`font-size:${expectedFont}px`));
          assert.match(titleNode.getAttribute('style') ?? '', /word-break:keep-all/);
          assert.match(titleNode.getAttribute('style') ?? '', /overflow-wrap:anywhere/);
        }
      });
    }
  }
});

test('1~2행 생성 설정은 HERO2 분기를 타지 않고 기준 바이트를 유지한다', () => {
  const shortProjection = Object.fromEntries(
    (['one', 'two'] as const).map((length) => {
      const hero = heroOf(TITLES[length]);
      const title = text(hero, 'hero-title');
      const lead = text(hero, 'hero-sub');
      return [length, {
        heroHeight: hero.height,
        titleFrame: title.frame,
        titleGuard: title.style.readabilityGuard,
        leadFrame: lead.frame,
        ctaFrame: button(hero).frame,
      }];
    }),
  );
  assert.deepEqual(shortProjection, {
    one: {
      heroHeight: 840,
      titleFrame: { x: 116, y: 300, w: 880, h: 220 },
      titleGuard: undefined,
      leadFrame: { x: 122, y: 540, w: 620, h: 65 },
      ctaFrame: { x: 122, y: 694, w: 172, h: 54 },
    },
    two: {
      heroHeight: 840,
      titleFrame: { x: 116, y: 300, w: 880, h: 220 },
      titleGuard: undefined,
      leadFrame: { x: 122, y: 540, w: 620, h: 65 },
      ctaFrame: { x: 122, y: 694, w: 172, h: 54 },
    },
  });
  assert.equal(
    createHash('sha256').update(JSON.stringify(shortProjection)).digest('hex'),
    '0cd89deb668cce00a28f894c81fae4cacc7d559ab55e56c1b60f8aed863cab2c',
  );
});

test('증빙 캡처는 정확한 CSS 뷰포트와 8px 글리프 가장자리 밴드를 영구 검사한다', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'scripts/render-image-promotion-review.tsx'),
    'utf8',
  );
  assert.match(source, /const GLYPH_EDGE_BAND_PX = 8/);
  assert.match(source, /await page\.setViewport\(/);
  assert.match(source, /measured\.innerWidth !== size\.width/);
  assert.match(source, /measured\.clientWidth !== size\.width/);
  assert.match(source, /glyphEdgeMetrics\(textMask, GLYPH_EDGE_BAND_PX\)/);
  assert.match(source, /leftBandGlyphPixels > 0 \|\| glyphEdge\.rightBandGlyphPixels > 0/);
  assert.doesNotMatch(source, /--window-size=/);
  assert.doesNotMatch(source, /--screenshot=/);
});
