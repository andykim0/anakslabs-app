import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { contrastRatio } from '@/lib/design/quality-standards';
import type { SurveyInput } from '@/lib/types/domain';
import {
  DESIGN_DNA_CATALOG,
  DNA_SITE_THEME_PROJECTION_REPORT,
  expandTokens,
  tokenSetToSiteTheme,
  type DesignDnaSelection,
} from '@/lib/design/dna';

function survey(): SurveyInput {
  return {
    businessName: '토큰 정합 상점',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '카페·베이커리',
    tone: ['따뜻한', '차분한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '대표 메뉴', required: true, source: 'template' },
    ],
    templateId: 'local_store.default',
    imageStyle: 'photo',
  } as SurveyInput;
}

const selection: DesignDnaSelection = {
  catalogVersion: 1,
  dnaId: 'cafe-warm-editorial',
  hueSeed: 31,
  overrides: { density: 'airy', radius: 'rounded' },
};

describe('DNA2 TokenSet → SiteTheme adapter', () => {
  test('8개 프리셋의 같은 입력은 기존 SiteTheme 계약으로 결정적으로 투영된다', () => {
    for (const dna of DESIGN_DNA_CATALOG) {
      for (const hue of [17, 223]) {
        const tokens = expandTokens(dna.id, hue);
        const first = tokenSetToSiteTheme(tokens);
        const second = tokenSetToSiteTheme(expandTokens(dna.id, hue));
        assert.deepEqual(first, second);
        assert.match(first.palette.background, /^#[0-9a-f]{6}$/u);
        assert.match(first.palette.primary, /^#[0-9a-f]{6}$/u);
        assert.ok(contrastRatio(first.palette.text, first.palette.background) >= 4.5);
        assert.ok(contrastRatio(first.palette.muted, first.palette.surface) >= 4.5);
      }
    }
  });

  test('지원 토큰과 투영 손실을 명시하고 임의 customCss 근사를 만들지 않는다', () => {
    assert.deepEqual(DNA_SITE_THEME_PROJECTION_REPORT.represented, [
      'typography.heading/body/googleFonts',
      'color.semantic.background/surface/text/textMuted/primary/accent',
      'radius.medium',
      'tokens.radius sharp/soft/pill',
      'tokens.spacing sectionBlock/sectionInline/elementGap',
      'tokens.typography ratio/sizes/line-heights',
      'tokens.color ramp-derived surface/border/muted',
      'tokens.color full 11-step neutral/primary/accent ramps',
      'tokens.shadow low/medium/high',
      'tokens.motion duration/easing',
    ]);
    assert.deepEqual(DNA_SITE_THEME_PROJECTION_REPORT.losses, [
      'color focus/link/on-colors: no component role consumes them yet',
      'motion signature id: motion selection remains the separate SiteConfig.motion contract',
      'OKLCH gamut precision: the existing renderer contract consumes 8-bit sRGB colors',
    ]);
    assert.equal(tokenSetToSiteTheme(expandTokens(selection.dnaId, selection.hueSeed)).customCss, undefined);
  });

  test('확장 토큰은 임의 단위 없이 결정적 SiteTheme 슬롯으로 투영된다', () => {
    const tokens = expandTokens(selection.dnaId, selection.hueSeed, selection.overrides);
    const theme = tokenSetToSiteTheme(tokens);
    assert.deepEqual(theme.tokens?.radius, {
      sharp: tokens.radius.small,
      soft: tokens.radius.large,
      pill: tokens.radius.pill,
    });
    assert.equal(theme.tokens?.typography.ratio, tokens.typography.ratio);
    assert.equal(theme.tokens?.color.surfaceStrong, tokens.color.ramps.neutral['200']);
    assert.deepEqual(theme.tokens?.color.ramps, tokens.color.ramps);
    assert.match(theme.tokens?.spacing.sectionBlock ?? '', /^\d+(?:\.\d+)?rem$/u);
    assert.equal(siteConfigSchema.safeParse({
      version: 2,
      theme,
      meta: { title: '토큰 저장 경계' },
      pages: [{ id: 'home', title: '홈', slug: '', sections: [] }],
    }).success, true);
  });

  test('ON 블루프린트는 어댑터 테마를 소비하고 선택 핀을 SiteConfig에 그대로 저장한다', () => {
    const input = survey();
    const blueprint = buildCandidateBlueprints(input, [selection])[0];
    const expectedTheme = tokenSetToSiteTheme(
      expandTokens(selection.dnaId, selection.hueSeed, selection.overrides),
    );
    assert.deepEqual(blueprint?.theme, expectedTheme);

    const candidate = {
      ...blueprint,
      heroImageUrl: '/mock/candidate-light.svg',
    };
    const config = buildSiteConfigFromSurvey(input, candidate, {
      heroImageUrl: candidate.heroImageUrl,
      imagePool: [candidate.heroImageUrl],
    });
    assert.deepEqual(config.designDna, selection);
    assert.deepEqual(config.theme, expectedTheme);
    assert.equal(siteConfigSchema.safeParse(config).success, true);
  });

  test('레거시 SiteConfig는 핀 없이 계속 유효하고 잘못된 핀은 저장 경계에서 거부된다', () => {
    const input = survey();
    const blueprint = buildCandidateBlueprints(input)[0];
    const config = buildSiteConfigFromSurvey(input, {
      ...blueprint,
      heroImageUrl: blueprint.mockHeroUrl,
    }, {
      heroImageUrl: blueprint.mockHeroUrl,
      imagePool: [blueprint.mockHeroUrl],
    });
    assert.equal(config.designDna, undefined);
    assert.equal(siteConfigSchema.safeParse(config).success, true);
    assert.equal(siteConfigSchema.safeParse({
      ...config,
      designDna: { ...selection, hueSeed: 361 },
    }).success, false);
  });
});
