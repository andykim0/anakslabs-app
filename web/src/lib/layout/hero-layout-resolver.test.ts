import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, pagePlanFromTemplate, planFromTemplate } from '@/lib/data/site-blueprints';
import { tokenSetToSiteTheme } from '@/lib/design/dna/site-theme-adapter';
import { expandTokens } from '@/lib/design/dna/expand-tokens';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { HERO_LAYOUT_VARIANT_IDS } from './types';

function fixture() {
  const template = resolveTemplate('local_store', '카페');
  const survey = {
    businessName: '온결 살롱',
    purposeId: 'local_store',
    purpose: '가게 소개',
    industry: '카페',
    tone: ['따뜻한'],
    tagline: '원하는 모습을 고르는 일부터 차분하게 함께합니다.',
    colorPreference: '#76563d',
    referenceImageUrls: [],
    highlights: ['예약 상담', '차분한 안내', '매일의 기준'],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
  } as SurveyInput;
  const candidate = {
    id: 'candidate-layout',
    label: '레이아웃',
    style: 'photo',
    heroImageUrl: '/mock/hero.webp',
    theme: tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 34, {})),
    description: '',
  } satisfies DesignCandidate;
  return { survey, candidate };
}

function heroFor(
  id: (typeof HERO_LAYOUT_VARIANT_IDS)[number],
  media = true,
  video = false,
) {
  const { survey, candidate } = fixture();
  return buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl: media ? '/mock/hero.webp' : '',
    imagePool: ['/mock/card.webp'],
    heroLayoutVariantId: id,
    ...(video ? { heroVideo: { src: '/mock/hero.mp4', poster: '/mock/hero-poster.webp' } } : {}),
  }).pages[0].sections.find((section) => section.type === 'hero')!;
}

describe('LIB L2 — normalized recipe compiler', () => {
  test('8개 ID가 wide frame과 compact/mobile projection을 결정적으로 만든다', () => {
    for (const id of HERO_LAYOUT_VARIANT_IDS) {
      const first = heroFor(id, true, id === 'hero.video-scrim');
      const second = heroFor(id, true, id === 'hero.video-scrim');
      assert.equal(JSON.stringify(first), JSON.stringify(second), `${id}: non-deterministic`);
      assert.equal(first.heroLayout?.requestedId, id);
      assert.equal(first.height, first.heroLayout?.bands.wide.sectionHeight);
      assert.equal(first.heroLayout?.bands.compact.width, 768);
      assert.equal(first.heroLayout?.bands.mobile.width, 390);
      const title = first.elements.find((element) => element.id.includes('hero-title'));
      assert.deepEqual(title?.frame, first.heroLayout?.bands.wide.frames[title!.id]);
    }
  });

  test('필수 이미지 부재는 text-only로 재선택하고 빈 미디어를 남기지 않는다', () => {
    for (const id of ['hero.fullbleed-centered', 'hero.overlay-bottom-left'] as const) {
      const hero = heroFor(id, false);
      assert.equal(hero.heroLayout?.resolvedId, 'hero.text-only-bold');
      assert.equal(hero.heroLayout?.mediaKind, 'none');
      assert.equal(hero.background.image, undefined);
      for (const band of Object.values(hero.heroLayout!.bands)) {
        assert.equal(band.mediaFrame, undefined);
      }
    }
  });

  test('optional-image 변형은 이미지 없이 같은 ID의 전체 흐름으로 성립한다', () => {
    const hero = heroFor('hero.split-left', false);
    assert.equal(hero.heroLayout?.resolvedId, 'hero.split-left');
    assert.equal(hero.heroLayout?.mediaKind, 'none');
    assert.equal(hero.heroLayout?.bands.wide.mediaFrame, undefined);
    const title = hero.elements.find((element) => element.id.includes('hero-title'))!;
    assert.ok(hero.heroLayout!.bands.wide.frames[title.id].w > 700);
  });

  test('video-scrim은 영상과 poster가 모두 있을 때만 유지된다', () => {
    const accepted = heroFor('hero.video-scrim', false, true);
    assert.equal(accepted.heroLayout?.resolvedId, 'hero.video-scrim');
    assert.equal(accepted.heroLayout?.mediaKind, 'video');

    const rejected = heroFor('hero.video-scrim', false, false);
    assert.equal(rejected.heroLayout?.resolvedId, 'hero.text-only-bold');
    assert.equal(rejected.heroLayout?.mediaKind, 'none');
  });

  test('미지정 경로는 legacy HeroVariant 결과를 유지한다', () => {
    const { survey, candidate } = fixture();
    const legacy = buildSiteConfigFromSurvey(survey, candidate, {
      heroImageUrl: '/mock/hero.webp',
      imagePool: ['/mock/card.webp'],
      heroVariant: 'split',
    });
    const explicitUndefined = buildSiteConfigFromSurvey(survey, candidate, {
      heroImageUrl: '/mock/hero.webp',
      imagePool: ['/mock/card.webp'],
      heroVariant: 'split',
      heroLayoutVariantId: undefined,
    });
    assert.equal(JSON.stringify(explicitUndefined), JSON.stringify(legacy));
    assert.equal(legacy.pages[0].sections[0].heroLayout, undefined);
  });
});
