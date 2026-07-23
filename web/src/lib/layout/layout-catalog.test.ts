import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { DESIGN_DNA_IDS } from '@/lib/design/dna';
import {
  SIGNATURE_BREAKPOINT_BANDS,
  SIGNATURE_TEXT_SAFE_ZONE_IDS,
} from '@/lib/motion/signature-contract';
import {
  HERO_LAYOUT_AUTHORED_INDUSTRIES,
  HERO_LAYOUT_CATALOG,
  HERO_LAYOUT_SLOT_IDS,
  HERO_LAYOUT_VARIANT_IDS,
} from '@/lib/layout';

const EXPECTED_ZONES = {
  'hero.fullbleed-centered': ['center-middle', 'center-middle', 'center-middle'],
  'hero.split-left': ['start-middle', 'start-middle', 'flow-start'],
  'hero.split-right': ['end-middle', 'end-middle', 'flow-start'],
  'hero.overlay-bottom-left': ['start-lower', 'start-lower', 'start-lower'],
  'hero.video-scrim': ['start-middle', 'start-middle', 'start-lower'],
  'hero.text-only-bold': ['flow-full', 'flow-full', 'flow-full'],
  'hero.image-below': ['flow-start', 'flow-start', 'flow-start'],
  'hero.asymmetric-offset': ['end-middle', 'center-middle', 'flow-full'],
} as const;

const EXPECTED_MEDIA = {
  'hero.fullbleed-centered': ['required-image', 'hero.text-only-bold'],
  'hero.split-left': ['optional-image', 'self-without-media'],
  'hero.split-right': ['optional-image', 'self-without-media'],
  'hero.overlay-bottom-left': ['required-image', 'hero.text-only-bold'],
  'hero.video-scrim': ['required-video-poster', 'hero.text-only-bold'],
  'hero.text-only-bold': ['none', 'self-without-media'],
  'hero.image-below': ['optional-image', 'self-without-media'],
  'hero.asymmetric-offset': ['optional-image', 'self-without-media'],
} as const;

const EXPECTED_DISCOURAGED = {
  'hero.fullbleed-centered': ['medical', 'legal'],
  'hero.split-left': [],
  'hero.split-right': [],
  'hero.overlay-bottom-left': ['medical', 'legal', 'academy'],
  'hero.video-scrim': ['medical', 'legal', 'academy'],
  'hero.text-only-bold': [],
  'hero.image-below': [],
  'hero.asymmetric-offset': ['medical', 'legal'],
} as const;

describe('LayoutVariant hero catalog', () => {
  test('디자이너 스펙의 8개 id·밴드·SIG 안전지대를 그대로 보존한다', () => {
    assert.deepEqual(HERO_LAYOUT_CATALOG.map((variant) => variant.id), HERO_LAYOUT_VARIANT_IDS);
    assert.equal(new Set(HERO_LAYOUT_CATALOG.map((variant) => variant.id)).size, 8);

    const knownZones = new Set<string>(SIGNATURE_TEXT_SAFE_ZONE_IDS);
    for (const variant of HERO_LAYOUT_CATALOG) {
      const actual = SIGNATURE_BREAKPOINT_BANDS.map((band) => variant.bands[band].textZone);
      assert.deepEqual(actual, EXPECTED_ZONES[variant.id], variant.id);
      for (const zone of actual) assert.ok(knownZones.has(zone), `${variant.id}: unknown zone ${zone}`);
      assert.deepEqual(
        SIGNATURE_BREAKPOINT_BANDS.map((band) => variant.bands[band].gridColumns),
        [12, 8, 4],
      );
    }
  });

  test('필수 헤드라인·기본 CTA와 변형별 미디어 폴백을 고정한다', () => {
    const knownSlots = new Set<string>(HERO_LAYOUT_SLOT_IDS);
    for (const variant of HERO_LAYOUT_CATALOG) {
      assert.ok(variant.slots.some((slot) => slot.id === 'headline' && slot.requirement === 'required'));
      assert.ok(variant.slots.some((slot) => slot.id === 'primary-cta' && slot.requirement === 'required'));
      assert.ok(variant.slots.every((slot) => knownSlots.has(slot.id)));
      assert.deepEqual(
        [variant.mediaContract.requirement, variant.mediaContract.noMediaFallback],
        EXPECTED_MEDIA[variant.id],
      );
    }
    assert.equal(
      HERO_LAYOUT_CATALOG.find((variant) => variant.id === 'hero.video-scrim')
        ?.mediaContract.posterOnlyFallback,
      'hero.fullbleed-centered',
    );
  });

  test('업종 10열과 DNA 어울림·회피가 enum 단일 소스만 참조한다', () => {
    const knownDna = new Set<string>(DESIGN_DNA_IDS);
    for (const variant of HERO_LAYOUT_CATALOG) {
      assert.deepEqual(Object.keys(variant.compatibility.industry), [...HERO_LAYOUT_AUTHORED_INDUSTRIES]);
      const discouraged = HERO_LAYOUT_AUTHORED_INDUSTRIES.filter(
        (industry) => variant.compatibility.industry[industry] === 'discouraged',
      );
      assert.deepEqual(discouraged, EXPECTED_DISCOURAGED[variant.id]);
      for (const dnaId of [
        ...variant.compatibility.preferredDna,
        ...variant.compatibility.avoidedDna,
      ]) {
        assert.ok(knownDna.has(dnaId), `${variant.id}: unknown DNA ${dnaId}`);
      }
    }
  });

  test('카탈로그 정규화 좌표와 그리드 span은 유효 범위 안이다', () => {
    for (const variant of HERO_LAYOUT_CATALOG) {
      for (const band of SIGNATURE_BREAKPOINT_BANDS) {
        const recipe = variant.bands[band];
        const spans = [
          recipe.contentColumns,
          ...Object.values(recipe.slotColumns ?? {}),
          ...(recipe.media.columns ? [recipe.media.columns] : []),
        ];
        for (const [start, end] of spans) {
          assert.ok(start >= 1 && start <= end && end <= recipe.gridColumns, `${variant.id}/${band}`);
        }
        const mediaFrame = recipe.media.frame;
        if (recipe.media.placement === 'fixed') {
          assert.ok(
            mediaFrame || (recipe.flow === 'offset-surface' && recipe.media.columns),
            `${variant.id}/${band}: fixed media requires a frame or offset grid span`,
          );
        }
        if (mediaFrame) {
          assert.ok(mediaFrame.x >= 0 && mediaFrame.y >= 0);
          assert.ok(mediaFrame.width > 0 && mediaFrame.height > 0);
          assert.ok(mediaFrame.x + mediaFrame.width <= 1);
          assert.ok(mediaFrame.y + mediaFrame.height <= 1);
        }
      }
    }
  });

  test('신규 카탈로그에 색상·크기 리터럴이나 모델 입력용 hex/px 필드가 없다', () => {
    const source = ['types.ts', 'catalog.ts']
      .map((file) => readFileSync(resolve(process.cwd(), 'src/lib/layout', file), 'utf8'))
      .join('\n');
    assert.doesNotMatch(source, /#[\da-f]{3,8}\b/iu);
    assert.doesNotMatch(source, /\b[\w$]*(?:hex|px)[\w$]*\??\s*:/iu);
  });
});
