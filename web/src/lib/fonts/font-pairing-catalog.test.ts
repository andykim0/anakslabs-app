import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { siteThemeSchema } from '@/app/api/_lib/schemas';
import { FONT_PAIRINGS, LEGACY_FONT_PAIRINGS } from '@/lib/ai/design-knowledge-data';
import { DESIGN_DNA_IDS } from '@/lib/design/dna/types';
import { emptySiteConfig, normalizeSiteConfig, type SiteTheme } from '@/lib/types/site';
import {
  fontPairingsEnabled,
  KOREAN_FONT_PAIRING_CATALOG_VERSION,
  PRODUCTION_KOREAN_FONT_PAIR_IDS,
  PRODUCTION_KOREAN_FONT_PAIRINGS,
} from '.';

describe('FNT F2 — 한글 페어링 단일 카탈로그', () => {
  test('production-ready 카탈로그는 승인된 4종만 정확히 노출한다', () => {
    assert.deepEqual(
      PRODUCTION_KOREAN_FONT_PAIRINGS.map((pairing) => pairing.id),
      [...PRODUCTION_KOREAN_FONT_PAIR_IDS],
    );
    assert.equal(PRODUCTION_KOREAN_FONT_PAIRINGS.length, 4);
    assert.equal(
      FONT_PAIRINGS.filter((pairing) => pairing.availability === 'new-opt-in').length,
      4,
    );
    assert.equal(FONT_PAIRINGS.some((pairing) => /score|s-core|에스코어/iu.test(pairing.id)), false);
  });

  test('legacy 호환 view는 신규 독립 typography ID를 기존 생성 enum에 섞지 않는다', () => {
    const legacyIds = new Set(LEGACY_FONT_PAIRINGS.map((pairing) => pairing.id));
    for (const id of PRODUCTION_KOREAN_FONT_PAIR_IDS) assert.equal(legacyIds.has(id), false);
    assert.equal(
      LEGACY_FONT_PAIRINGS.every((pairing) => pairing.availability === undefined),
      true,
    );
  });

  test('4세트 모두 DNA 8종 궁합·조판·라이선스 manifest를 완결한다', () => {
    for (const pairing of PRODUCTION_KOREAN_FONT_PAIRINGS) {
      const manifest = pairing.productionManifest;
      assert.equal(manifest.catalogVersion, KOREAN_FONT_PAIRING_CATALOG_VERSION);
      assert.deepEqual(Object.keys(manifest.dnaAffinity), [...DESIGN_DNA_IDS]);
      assert.ok(manifest.licenseAssetIds.length > 0);
      assert.match(manifest.typography.display.tracking, /^tracking\./u);
      assert.match(manifest.typography.display.leading, /^leading\./u);
      assert.ok(manifest.heading.weights.length > 0);
      assert.ok(manifest.body.weights.length > 0);
      assert.ok(manifest.control.weights.length > 0);
    }
  });

  test('SiteTheme Zod 경계는 pin을 보존하고 미지정 legacy theme은 무손실 통과한다', () => {
    const legacyTheme: SiteTheme = {
      fonts: {
        heading: "'Noto Serif KR', serif",
        body: "'Pretendard', sans-serif",
        googleFonts: ['Noto Serif KR'],
      },
      palette: {
        background: '#ffffff',
        surface: '#f8f8f8',
        text: '#111111',
        muted: '#666666',
        primary: '#123456',
        accent: '#654321',
      },
      radius: 8,
    };
    assert.deepEqual(siteThemeSchema.parse(legacyTheme), legacyTheme);

    const pinned: SiteTheme = {
      ...legacyTheme,
      fontPairing: {
        catalogVersion: KOREAN_FONT_PAIRING_CATALOG_VERSION,
        id: 'kr-pretendard-neutral',
      },
    };
    assert.deepEqual(siteThemeSchema.parse(pinned), pinned);

    const v1 = {
      version: 1 as const,
      theme: pinned,
      meta: { title: '폰트 핀' },
      sections: [],
    };
    assert.deepEqual(normalizeSiteConfig(v1).theme, pinned);
    assert.deepEqual(normalizeSiteConfig(emptySiteConfig('기존')).theme, emptySiteConfig('기존').theme);
  });

  test('FONT_PAIRINGS_ENABLED는 정확히 1일 때만 신규 발급을 허용한다', () => {
    assert.equal(fontPairingsEnabled({}), false);
    assert.equal(fontPairingsEnabled({ FONT_PAIRINGS_ENABLED: '' }), false);
    assert.equal(fontPairingsEnabled({ FONT_PAIRINGS_ENABLED: 'true' }), false);
    assert.equal(fontPairingsEnabled({ FONT_PAIRINGS_ENABLED: '1' }), true);
  });
});
