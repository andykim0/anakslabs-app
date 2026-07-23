import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { ProceduralBackground } from '@/components/site-renderer/ProceduralBackground';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { DESIGN_DNA_CATALOG } from '@/lib/design/dna/catalog';
import { contrastRatio, parseOklch } from '@/lib/design/dna/color';
import { expandTokens } from '@/lib/design/dna/expand-tokens';
import { tokenSetToSiteTheme } from '@/lib/design/dna/site-theme-adapter';
import {
  SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY,
  type SignatureBreakpointBand,
} from '@/lib/motion/signature-contract';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import {
  emptySiteConfig,
  type Section,
  type SiteConfig,
  type SiteTheme,
} from '@/lib/types/site';
import { applyProceduralBackgroundDefaults } from './application';
import { ABS_FAMILY_CATALOG } from './catalog';
import { generateAbsBackground } from './generator';
import {
  ABS_FAMILY_FALLBACK_ID,
  resolveAbsFamily,
  selectAbsFamilyFromPool,
} from './resolver';
import {
  fnv1a32,
  stableIndex,
  stableSeedHex,
  xorshift32,
} from './seed';
import {
  ABS_FAMILY_IDS,
  type AbsFamilyId,
  type ProceduralBackgroundSpec,
} from './types';

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const BANDS = ['wide', 'compact', 'mobile'] as const satisfies readonly SignatureBreakpointBand[];
const HUES = [28, 212, 334, 162, 244, 46, 198, 12] as const;

function spec(familyId: AbsFamilyId = ABS_FAMILY_FALLBACK_ID): ProceduralBackgroundSpec {
  return {
    version: 1,
    familyId,
    seed: '11492911',
    slotId: 'hero.fullbleed-centered',
    bands: {
      wide: {
        textSafeZoneId: 'start-middle',
        weightZone: 'end',
        scrim: 'subtle-scrim',
      },
      compact: {
        textSafeZoneId: 'center-middle',
        weightZone: 'balanced',
        scrim: 'subtle-scrim',
      },
      mobile: {
        textSafeZoneId: 'center-middle',
        weightZone: 'lower',
        scrim: 'subtle-scrim',
      },
    },
  };
}

function heroSection(): Section {
  return {
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: { color: '#f6f3ed' },
    elements: [
      {
        id: 'headline',
        kind: 'text',
        text: '매일의 한 장면을 차분하게',
        frame: { x: 132, y: 190, w: 720, h: 150 },
        z: 2,
        style: {
          fontSize: 64,
          fontFamily: 'heading',
          fontWeight: 700,
          color: '#171512',
          lineHeight: 1.2,
        },
      },
      {
        id: 'lead',
        kind: 'text',
        text: '고객이 직접 적은 이야기를 읽기 편한 흐름으로 전합니다.',
        frame: { x: 136, y: 380, w: 620, h: 72 },
        z: 2,
        style: {
          fontSize: 22,
          fontFamily: 'body',
          color: '#171512',
          lineHeight: 1.55,
        },
      },
    ],
  };
}

function dnaConfig(dnaIndex = 0): SiteConfig {
  const dna = DESIGN_DNA_CATALOG[dnaIndex]!;
  const tokens = expandTokens(dna.id, HUES[dnaIndex]!);
  const base = withSiteCinematicDefault(emptySiteConfig('절차적 배경 회귀'));
  return {
    ...base,
    theme: tokenSetToSiteTheme(tokens),
    designDna: {
      catalogVersion: 1,
      dnaId: dna.id,
      hueSeed: HUES[dnaIndex]!,
      overrides: {},
    },
    meta: {
      ...base.meta,
      purposeId: dna.id === 'academy-structured-friendly' ? 'edu_membership' : 'local_store',
      industryClass: dna.industryPrior[0],
    },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [heroSection()],
    }],
  };
}

function render(config: SiteConfig): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'desktop',
    interactive: false,
    animate: false,
  }));
}

describe('ABS A4 — 절차적 배경 카탈로그·결정성', () => {
  test('카탈로그는 승인된 5패밀리만 순서대로 소유한다', () => {
    assert.deepEqual(ABS_FAMILY_CATALOG.map((family) => family.id), [...ABS_FAMILY_IDS]);
    assert.equal(new Set(ABS_FAMILY_CATALOG.map((family) => family.id)).size, 5);
  });

  test('FNV-1a·xorshift32·stableIndex 기준 벡터를 영구 고정한다', () => {
    const canonicalSeed = 'site-42|hero|hero.fullbleed-centered';
    assert.equal(fnv1a32(canonicalSeed), 290_007_313);
    assert.equal(stableSeedHex(canonicalSeed), '11492911');
    assert.equal(xorshift32(fnv1a32(canonicalSeed)), 3_104_405_412);
    assert.equal(stableIndex(canonicalSeed, 5), 3);
  });

  test('C5 빈 결정표는 soft-gradient로 닫히고 같은 canonical seed는 같은 패밀리에 영구 고정된다', () => {
    assert.equal(selectAbsFamilyFromPool([], 'anything'), ABS_FAMILY_FALLBACK_ID);
    const candidates = [
      'abs.soft-gradient-field',
      'abs.paper-grain-wash',
      'abs.geometric-linework',
      'abs.duotone-depth-planes',
      'abs.micro-pattern-tile',
    ] as const;
    const canonicalSeed = 'site-42|hero|hero.fullbleed-centered';
    assert.equal(
      selectAbsFamilyFromPool(candidates, canonicalSeed),
      'abs.paper-grain-wash',
    );
    assert.equal(
      selectAbsFamilyFromPool([...candidates].reverse(), canonicalSeed),
      'abs.paper-grain-wash',
    );
    assert.equal(resolveAbsFamily({
      dnaId: 'academy-structured-friendly',
      industry: 'academy',
      siteSeed: 'site-42',
      sectionId: 'hero',
      slotId: 'hero.fullbleed-centered',
    }), resolveAbsFamily({
      dnaId: 'academy-structured-friendly',
      industry: 'academy',
      siteSeed: 'site-42',
      sectionId: 'hero',
      slotId: 'hero.fullbleed-centered',
    }));
  });

  test('5패밀리 × DNA 8 × 3밴드는 바이트 결정적이고 안전지대 원본을 직접 소비한다', () => {
    const snapshots: string[] = [];
    for (const [dnaIndex, dna] of DESIGN_DNA_CATALOG.entries()) {
      const tokens = expandTokens(dna.id, HUES[dnaIndex]!);
      const theme = tokenSetToSiteTheme(tokens);
      for (const familyId of ABS_FAMILY_IDS) {
        const contract = spec(familyId);
        for (const band of BANDS) {
          const first = generateAbsBackground({ spec: contract, theme, band });
          const second = generateAbsBackground({ spec: contract, theme, band });
          assert.deepEqual(first, second);
          assert.deepEqual(
            first.quietZone,
            SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[band][contract.bands[band].textSafeZoneId],
          );
          assert.equal(first.mode, 'authored');
          assert.ok(
            contrastRatio(
              parseOklch(tokens.color.semantic.text),
              parseOklch(first.quietWashColor),
            ) >= 4.5,
            `${dna.id}/${familyId}/${band} quiet-zone AA`,
          );
          snapshots.push(JSON.stringify(first));
        }
      }
    }
    assert.equal(snapshots.length, 120);
    assert.equal(
      sha(snapshots.join('\n')),
      '884257cfb6ab340f4706cecd54fd8e4ac8325ca55d1a195ff4a9e042435382e9',
    );
  });
});

describe('ABS A4 — fail-closed·렌더 경계·무회귀', () => {
  test('C2 ramps가 없으면 semantic 단색으로 fail-closed하고 SVG 장식을 만들지 않는다', () => {
    const fullTheme = tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 28));
    const legacyColorTokens = { ...fullTheme.tokens!.color };
    delete legacyColorTokens.ramps;
    const theme: SiteTheme = {
      ...fullTheme,
      tokens: {
        ...fullTheme.tokens!,
        color: {
          ...legacyColorTokens,
          backgroundSubtle: '#151515',
        },
      },
    };
    const projection = generateAbsBackground({ spec: spec(), theme, band: 'wide' });
    assert.equal(projection.mode, 'solid');
    assert.equal(projection.baseColor, '#151515');
    assert.deepEqual(projection.lowFrequencyPaths, []);
    assert.deepEqual(projection.highFrequencyPaths, []);
    assert.equal(projection.pattern, undefined);
    assert.equal(projection.noise, undefined);

    const html = renderToStaticMarkup(createElement(ProceduralBackground, {
      spec: spec(),
      theme,
      band: 'wide',
    }));
    assert.match(html, /data-abs-mode="solid"/u);
    assert.doesNotMatch(html, /<svg|<path|<filter|<pattern/u);
  });

  test('proceduralBackground 미지정 기존 theme은 JSON·HTML 핀과 동일하며 ABS DOM이 0이다', () => {
    const legacy = withSiteCinematicDefault(emptySiteConfig('기존 발행본'));
    legacy.pages[0]!.sections = [heroSection()];
    const json = JSON.stringify(legacy);
    const html = render(legacy);
    const root = parse(html);
    assert.equal(root.querySelectorAll('[data-abs-family]').length, 0);
    assert.equal(root.querySelectorAll('[data-site-cine-procedural-hero]').length, 1);
    assert.equal(sha(json), '7187e7f4cf49eebadef6e83c5c6341f681aa05db6cd3cb0fa6b24b7b80414029');
    assert.equal(sha(html), '7ac15d12262ae8f60a9ddcbb3d266a2790c84eae99f33db89d845d64aaf38f19');
  });

  test('신규 핀만 새 DOM으로 스위치되고 원·타원·구형 blob을 출력하지 않는다', () => {
    const next = applyProceduralBackgroundDefaults(dnaConfig());
    const html = render(next);
    const root = parse(html);
    assert.ok(root.querySelectorAll('[data-abs-family]').length > 0);
    assert.equal(root.querySelectorAll('[data-site-cine-procedural-hero]').length, 0);
    assert.doesNotMatch(html, /<(?:circle|ellipse)\b/u);
  });

  test('서버 application은 멱등이며 기존 핀·figure·gallery를 건드리지 않는다', () => {
    const config = dnaConfig();
    const hero = config.pages[0]!.sections[0]!;
    config.pages[0]!.sections = [
      {
        ...hero,
        proceduralBackground: spec('abs.paper-grain-wash'),
      },
      {
        ...hero,
        id: 'figure-hero',
        heroLayout: {
          resolvedId: 'hero.split-left',
          mediaSlotRole: 'referential-figure',
        } as Section['heroLayout'],
      },
      {
        ...hero,
        id: 'gallery',
        type: 'gallery',
        sectionLayout: {
          resolvedId: 'gallery.uniform-grid',
          mediaRole: 'referential-gallery',
        } as unknown as Section['sectionLayout'],
      },
    ];
    const first = applyProceduralBackgroundDefaults(config);
    const second = applyProceduralBackgroundDefaults(first);
    assert.equal(first, second);
    assert.equal(first.pages[0]!.sections[0]!.proceduralBackground?.familyId, 'abs.paper-grain-wash');
    assert.equal(first.pages[0]!.sections[1]!.proceduralBackground, undefined);
    assert.equal(first.pages[0]!.sections[2]!.proceduralBackground, undefined);
  });

  test('about.fullbleed-overlay는 배경형 슬롯으로 핀되고 video-scrim은 영상+poster가 모두 있어야 한다', () => {
    const config = dnaConfig(3);
    const base = config.pages[0]!.sections[0]!;
    const about = {
      ...base,
      id: 'about',
      type: 'about' as const,
      sectionLayout: {
        resolvedId: 'about.fullbleed-overlay',
        mediaRole: 'atmospheric-background',
      } as Section['sectionLayout'],
    };
    const invalidVideo = {
      ...base,
      id: 'video-invalid',
      heroLayout: {
        resolvedId: 'hero.video-scrim',
        mediaSlotRole: 'atmospheric-background',
      } as Section['heroLayout'],
      background: {
        ...base.background,
        video: { src: '/hero.mp4' },
      },
    };
    const validVideo = {
      ...invalidVideo,
      id: 'video-valid',
      background: {
        ...base.background,
        video: { src: '/hero.mp4', poster: '/hero.webp' },
      },
    };
    config.pages[0]!.sections = [about, invalidVideo, validVideo];
    const next = applyProceduralBackgroundDefaults(config);
    assert.equal(next.pages[0]!.sections[0]!.proceduralBackground?.slotId, 'about.fullbleed-overlay');
    assert.equal(next.pages[0]!.sections[1]!.proceduralBackground, undefined);
    assert.equal(next.pages[0]!.sections[2]!.proceduralBackground?.slotId, 'hero.video-scrim');
  });

  test('후보·모션·최종 생성은 같은 application seam을 소비하고 renderer는 DNA를 역확장하지 않는다', () => {
    const candidate = source('src/lib/onboarding/candidate-preview.ts');
    const motion = source('src/lib/motion/preview-config.ts');
    const generation = source('src/app/api/onboarding/generate/route.ts');
    const regeneration = source('src/app/api/onboarding/regenerate/route.ts');
    for (const value of [candidate, motion, generation, regeneration]) {
      assert.match(value, /applyProceduralBackgroundDefaults/u);
    }
    for (const file of [
      'src/components/site-renderer/ProceduralBackground.tsx',
      'src/components/site-renderer/SectionCanvas.tsx',
      'src/components/site-renderer/SectionStack.tsx',
      'src/components/site-renderer/SectionLayoutProjectionRenderer.tsx',
      'src/components/site-renderer/MotionSignatureRenderer.tsx',
    ]) {
      const value = source(file);
      assert.doesNotMatch(value, /expandTokens|designDna/u, file);
    }
  });

  test('생성기·컴포넌트는 외부 자산·랜덤·원·타원·FLOW CSS를 소유하지 않는다', () => {
    const generator = source('src/lib/abstract/generator.ts');
    const component = source('src/components/site-renderer/ProceduralBackground.tsx');
    const siteRenderer = source('src/components/site-renderer/SiteRenderer.tsx');
    for (const value of [generator, component]) {
      assert.doesNotMatch(value, /Math\.random|https?:\/\/|<circle\b|<ellipse\b/u);
    }
    assert.doesNotMatch(generator, /expandTokens/u);
    assert.match(siteRenderer, /CONTINUOUS_CANVAS_CSS/u);
    assert.doesNotMatch(generator + component, /CONTINUOUS_CANVAS_CSS/u);
  });
});
