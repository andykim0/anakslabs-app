import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  buildCandidateBlueprints,
  buildCandidateBlueprintsForPipeline,
} from '@/lib/data/design-candidates';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import { REFERENCE_GALLERY } from '@/lib/design/reference-gallery';
import { scrimPassesAA } from '@/lib/design/scrim';
import { skeletonById } from '@/lib/data/skeletons';
import {
  lintMotionMeasurement,
  motionContrastRatio,
} from '@/lib/motion/motion-lint';
import { heroLayoutById } from './catalog';
import {
  estimatedHeroHeadlineLines,
} from './hero-layout-resolver';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type {
  CanvasElement,
  Section,
  SiteConfig,
  TextElement,
} from '@/lib/types/site';
import {
  HERO_LAYOUT_VARIANT_IDS,
  type HeroLayoutBreakpointBand,
  type HeroLayoutCompiledFrame,
  type HeroLayoutBandProjection,
  type HeroLayoutProjection,
  type HeroLayoutVariantId,
} from './types';

const TITLES = {
  one: '기준',
  two: '매일의 기준\n차분한 안내',
  three: '오늘의 가게\n필요한 정보\n분명한 안내',
} as const;

const BANDS = ['wide', 'compact', 'mobile'] as const satisfies readonly HeroLayoutBreakpointBand[];
const EDGE_SAFE_PX = 8;

const theme = tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 34));

function survey(): SurveyInput {
  const template = resolveTemplate('local_store', '카페');
  return {
    businessName: '온결 살롱',
    purposeId: 'local_store',
    purpose: '가게 소개',
    industry: '카페',
    tone: ['따뜻한'],
    tagline: '찾는 내용을 차분하게 안내합니다.',
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    highlights: ['예약 상담', '차분한 안내', '매일의 기준'],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageStyle: 'photo',
  } as SurveyInput;
}

function candidate(media: boolean): DesignCandidate {
  return {
    id: 'candidate-layout-regression',
    label: '레이아웃 회귀',
    style: 'photo',
    heroImageUrl: media ? '/mock/candidate-light.svg' : '',
    theme,
    description: '',
  };
}

function configFor({
  id,
  title,
  media,
}: {
  id?: HeroLayoutVariantId;
  title: string;
  media: boolean;
}): SiteConfig {
  const video = id === 'hero.video-scrim' && media;
  return buildSiteConfigFromSurvey(survey(), candidate(media), {
    heroImageUrl: media ? '/mock/candidate-light.svg' : '',
    imagePool: media ? ['/mock/candidate-dark.svg'] : [],
    ...(id ? { heroLayoutVariantId: id } : { heroVariant: 'split' as const }),
    ...(video
      ? {
          heroVideo: {
            src: '/mock/clip-ember.mp4',
            poster: '/mock/candidate-dark.svg',
          },
        }
      : {}),
    copy: {
      heroKicker: '가게 소개',
      heroTitle: title,
      heroSub: '찾는 내용을 차분하게 안내합니다.',
    },
  });
}

function heroOf(config: SiteConfig): Section {
  const hero = config.pages[0]?.sections.find((section) => section.type === 'hero');
  if (!hero) throw new Error('hero fixture missing');
  return hero;
}

function titleOf(hero: Section): TextElement {
  const title = hero.elements.find((element) => (
    element.kind === 'text' && element.id.includes('hero-title')
  ));
  if (title?.kind !== 'text') throw new Error('hero title fixture missing');
  return title;
}

function sha(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function normalizedPublishedHtml(config: SiteConfig): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: false,
    animate: false,
  })).replace(/© \d{4}/gu, '© YEAR');
}

function frameOverlap(
  left: HeroLayoutCompiledFrame,
  right: HeroLayoutCompiledFrame,
): number {
  const width = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  return width * height;
}

function visibleFlowElements(hero: Section): CanvasElement[] {
  return hero.elements.filter((element) => (
    element.id.includes('hero-logo')
    || element.id.includes('hero-kicker')
    || element.id.includes('hero-title')
    || element.id.includes('hero-sub')
    || element.id.includes('hero-chip-label')
    || element.id.includes('hero-cta')
  ));
}

describe('LIB L4 — 승인 조건 C1·C2 SHA 회귀', () => {
  test('C1-1 플래그 OFF 후보는 신규 heroLayout ID를 한 건도 발급하지 않는다', async () => {
    const legacy = buildCandidateBlueprints(survey());
    const off = await buildCandidateBlueprintsForPipeline(survey(), {
      enabled: false,
      layoutEnabled: false,
    });
    assert.equal(JSON.stringify(off), JSON.stringify(legacy));
    assert.equal(off.filter((item) => item.heroLayoutVariantId).length, 0);
  });

  test('C1-2 저장된 heroLayout은 플래그 OFF에서도 동일한 HTML SHA로 렌더된다', () => {
    const config = configFor({
      id: 'hero.asymmetric-offset',
      title: TITLES.three,
      media: true,
    });
    const previous = process.env.LAYOUT_VARIANTS_ENABLED;
    try {
      process.env.LAYOUT_VARIANTS_ENABLED = '1';
      const on = normalizedPublishedHtml(config);
      process.env.LAYOUT_VARIANTS_ENABLED = '0';
      const off = normalizedPublishedHtml(config);
      assert.equal(sha(off), sha(on));
      assert.match(off, /data-hero-layout-stack="hero\.asymmetric-offset"/u);
    } finally {
      if (previous === undefined) delete process.env.LAYOUT_VARIANTS_ENABLED;
      else process.env.LAYOUT_VARIANTS_ENABLED = previous;
    }
  });

  test('C2-1 FIXHERO2 1~2행 short projection SHA를 그대로 보존한다', () => {
    const shortProjection = Object.fromEntries(
      (['one', 'two'] as const).map((length) => {
        const hero = heroOf(configFor({ title: TITLES[length], media: true }));
        const title = titleOf(hero);
        const lead = hero.elements.find((element) => element.id.includes('hero-sub'))!;
        const cta = hero.elements.find((element) => (
          element.id.includes('hero-cta') && !element.id.includes('cta2')
        ))!;
        return [length, {
          heroHeight: hero.height,
          titleFrame: title.frame,
          titleGuard: title.style.readabilityGuard,
          leadFrame: lead.frame,
          ctaFrame: cta.frame,
        }];
      }),
    );
    assert.equal(
      sha(shortProjection),
      '1b7441c819e58c1f3e8d6b67baaa7ac178a361d61829def25d6351c9d8130deb',
    );
  });

  test('C2-2 레거시 HeroVariant 3종 hero JSON SHA를 고정한다', () => {
    const legacy = (['fullbleed', 'centered', 'split'] as const).map((heroVariant) => {
      const config = buildSiteConfigFromSurvey(survey(), candidate(true), {
        heroImageUrl: '/mock/candidate-light.svg',
        imagePool: [],
        heroVariant,
        copy: {
          heroKicker: '가게 소개',
          heroTitle: TITLES.two,
          heroSub: '찾는 내용을 차분하게 안내합니다.',
        },
      });
      return heroOf(config);
    });
    assert.equal(sha(legacy), 'a78ab8fb2e50b8f12e1b423e03481504c7df13b325dfc315231ea316c1a261f3');
    assert.ok(legacy.every((hero) => hero.heroLayout === undefined));
  });

  test('C2-3 플래그 OFF 파이프라인은 레거시 후보 출력 SHA를 고정한다', async () => {
    const legacy = buildCandidateBlueprints(survey());
    const off = await buildCandidateBlueprintsForPipeline(survey(), {
      enabled: false,
      layoutEnabled: false,
    });
    assert.equal(sha(off), sha(legacy));
    assert.equal(sha(off), 'bdce58ab2f5d8060c943f78a7899f0f2c5f7e319dd5b16edb61ea6be68cf9f21');
  });

  test('C2-4 heroLayout 미지정 SiteRenderer HTML SHA를 고정한다', () => {
    const config = configFor({ title: TITLES.two, media: true });
    assert.equal(heroOf(config).heroLayout, undefined);
    assert.equal(
      sha(normalizedPublishedHtml(config)),
      'dfa70e4d46c886123fac14db558afee7492f5970eb5f8250503d06d0d8452c90',
    );
  });

  test('C2-5 레퍼런스 갤러리 36개 ID·legacy heroVariant SHA를 고정한다', () => {
    const projection = REFERENCE_GALLERY.map((entry) => ({
      id: entry.id,
      heroVariant: skeletonById(entry.skeletonId)?.heroVariant,
    }));
    assert.equal(projection.length, 36);
    assert.ok(projection.every((entry) => entry.heroVariant));
    assert.equal(sha(projection), '5fb7adf73723bd632c4dfc1712019c250c3736c7cada7bee524cdf80e5d62ea1');
  });
});

describe('LIB L4 — 8변형 × 3밴드 × 1~3행 × 미디어 유무 매트릭스', () => {
  let checked = 0;

  for (const id of HERO_LAYOUT_VARIANT_IDS) {
    for (const [lineCount, title] of Object.entries(TITLES)) {
      for (const media of [true, false] as const) {
        const label = `${id}/${lineCount}/${media ? 'media' : 'no-media'}`;
        test(`${label}: 3밴드 겹침·오버플로·AA·MotionLint`, () => {
          const hero = heroOf(configFor({ id, title, media }));
          const projection: HeroLayoutProjection | undefined = hero.heroLayout;
          assert.ok(projection);
          const resolved = heroLayoutById(projection.resolvedId);
          assert.ok(resolved);
          const flow = visibleFlowElements(hero);

          for (const band of BANDS) {
            const projected: HeroLayoutBandProjection = projection.bands[band];
            const frames: Array<{ element: CanvasElement; frame: HeroLayoutCompiledFrame }> = flow
              .map((element): {
                element: CanvasElement;
                frame: HeroLayoutCompiledFrame | undefined;
              } => ({ element, frame: projected.frames[element.id] }))
              .filter((item): item is { element: CanvasElement; frame: HeroLayoutCompiledFrame } => (
                Boolean(item.frame)
              ));
            assert.equal(frames.length, flow.length, `${label}/${band}: missing frame`);

            for (const { element, frame } of frames) {
              assert.ok(frame.x >= EDGE_SAFE_PX, `${label}/${band}/${element.id}: left edge`);
              assert.ok(
                frame.x + frame.w <= projected.width - EDGE_SAFE_PX,
                `${label}/${band}/${element.id}: right edge`,
              );
              assert.ok(frame.y >= 0, `${label}/${band}/${element.id}: top overflow`);
              assert.ok(
                frame.y + frame.h <= projected.sectionHeight,
                `${label}/${band}/${element.id}: bottom overflow`,
              );
            }

            for (let left = 0; left < frames.length; left += 1) {
              for (let right = left + 1; right < frames.length; right += 1) {
                assert.equal(
                  frameOverlap(frames[left].frame, frames[right].frame),
                  0,
                  `${label}/${band}: ${frames[left].element.id} overlaps ${frames[right].element.id}`,
                );
              }
            }

            const titleElement = titleOf(hero);
            const titleFrame = projected.frames[titleElement.id];
            const fontSize = projected.fontSizes[titleElement.id];
            const expectedLines = estimatedHeroHeadlineLines(title, titleFrame.w, fontSize);
            assert.equal(
              expectedLines,
              lineCount === 'one' ? 1 : lineCount === 'two' ? 2 : 3,
              `${label}/${band}: headline fixture did not stay at the intended line count`,
            );
            assert.ok(
              titleFrame.h >= expectedLines * fontSize * Math.max(
                theme.tokens?.typography.lineHeight.heading ?? 1.3,
                titleElement.style.lineHeight ?? 1.3,
              ),
              `${label}/${band}: title frame cannot hold ${expectedLines} lines`,
            );

            const zone = resolved.bands[band].textZone;
            const textBox = {
              x: titleFrame.x / projected.width,
              y: titleFrame.y / projected.sectionHeight,
              width: titleFrame.w / projected.width,
              height: titleFrame.h / projected.sectionHeight,
            };
            const titleColor = titleElement.style.color ?? theme.palette.text;
            const contrast = projection.scrim === 'subtle-scrim'
              ? 4.5
              : motionContrastRatio(titleColor, theme.palette.background);
            const lint = lintMotionMeasurement({
              signatureId: 'cinematic-scrub',
              phase: 'hold',
              breakpoint: band,
              textBox,
              allowedZones: [zone, 'flow-start'],
              contrastRatio: contrast,
              clipped: false,
              horizontalOverflow: 0,
              cls: 0,
              noJsText: title,
            });
            assert.deepEqual(lint, [], `${label}/${band}: ${JSON.stringify(lint)}`);
            checked += 1;
          }

          if (projection.scrim === 'subtle-scrim') {
            const image = hero.background.image;
            assert.ok(image?.overlayColor);
            assert.equal(
              scrimPassesAA(
                image.overlayColor,
                image.overlayOpacity ?? 0,
                titleOf(hero).style.color ?? theme.palette.text,
              ),
              true,
              `${label}: scrim AA`,
            );
          }

          if (!media) {
            assert.equal(projection.mediaKind, 'none');
            assert.ok(Object.values(projection.bands).every((band) => !band.mediaFrame));
          }
        });
      }
    }
  }

  test('매트릭스는 승인된 144개 밴드 조합을 빠짐없이 검사한다', () => {
    assert.equal(checked, 8 * 3 * 2 * 3);
  });
});
