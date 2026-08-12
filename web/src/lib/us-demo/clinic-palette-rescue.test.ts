import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import { contrastRatio } from '@/lib/design/quality-standards';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  buildClinicPalette,
  CLINIC_PALETTE_FALLBACKS,
  hexToHsl,
} from './clinic-palette';
import { clinicSourceIsImageDense } from './source-images';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');
const SAMPLES = ['dental360', 'cameods', 'iddental'] as const;

function artifact(name: string): CrawlArtifactPayload {
  return JSON.parse(
    readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8'),
  ) as CrawlArtifactPayload;
}

function paletteFor(name: string) {
  const payload = artifact(name);
  return buildClinicPalette({
    candidates: payload.clinicPaletteProjection?.rawCandidates ?? [],
    specialty: 'dental',
    imageDense: clinicSourceIsImageDense(payload),
  });
}

/** The corpus family §2-3 names explicitly: the muddy mid blue that must not be shipped back. */
const MUDDY_MID_BLUE = '#2669AF';

describe('TEMPLATE-SYSTEM §2-5 — a gate failure darkens before it gives up', () => {
  test('명도만 낮춰 게이트를 통과시키고 색상·채도는 건드리지 않는다', () => {
    const palette = buildClinicPalette({
      candidates: [{ origin: 'logo', hex: '#FFD34D' }],
      specialty: 'dental',
      imageDense: false,
    });
    assert.equal(palette.meta.fallbackUsed, false);
    assert.equal(palette.meta.refinement, 'darken-to-gate');
    assert.equal(palette.slots['--brand'], '#947000');
    // The failure that triggered the rescue stays on the record even though it was cleared.
    assert.deepEqual(palette.meta.gateFailures, ['brand/surface 4.5:1']);

    const source = hexToHsl('#FFD34D')!;
    const rescued = hexToHsl(palette.slots['--brand'])!;
    assert.ok(Math.abs(rescued.h - source.h) < 2, `hue drifted: ${rescued.h} vs ${source.h}`);
    assert.ok(Math.abs(rescued.s - source.s) < 0.02, `saturation drifted: ${rescued.s}`);
    assert.ok(rescued.l < source.l);
    assert.ok(contrastRatio(palette.slots['--brand'], palette.slots['--surface']) >= 4.5);
  });

  test('§2-3의 재사상은 살아남는다 — 탁한 중간 블루는 되돌려 보내지 않는다', () => {
    const palette = buildClinicPalette({
      candidates: [{ origin: 'logo', hex: MUDDY_MID_BLUE }],
      specialty: 'dental',
      imageDense: false,
    });
    assert.notEqual(palette.slots['--brand'], MUDDY_MID_BLUE);
    assert.equal(palette.meta.fallbackUsed, false);
    assert.ok(
      hexToHsl(palette.slots['--brand'])!.s > hexToHsl(MUDDY_MID_BLUE)!.s,
      'the electrified chroma was undone by the rescue',
    );
  });

  test('색상이 없는 원본은 구조하지 않는다 — 회색 브랜드는 폴백보다 나쁘다', () => {
    const palette = buildClinicPalette({
      candidates: [{ origin: 'cta', hex: '#FDFDFD' }],
      specialty: 'dental',
      imageDense: false,
    });
    assert.equal(palette.meta.fallbackUsed, true);
    assert.equal(palette.slots['--brand'], CLINIC_PALETTE_FALLBACKS.dental.brand);
  });

  test('서로 다른 브랜드는 서로 다른 색으로 살아남는다', () => {
    const brands = ['#2F7A54', '#E8452C', '#FFD34D', '#8F5F3C', '#3A7BD5', '#7B2D8E'].map(
      (hex) => buildClinicPalette({
        candidates: [{ origin: 'logo', hex }],
        specialty: 'dental',
        imageDense: false,
      }),
    );
    assert.equal(brands.filter((p) => p.meta.fallbackUsed).length, 0);
    assert.equal(new Set(brands.map((p) => p.slots['--brand'])).size, brands.length);
  });
});

describe('TEMPLATE-SYSTEM §2 — 실제 크롤 3건의 추출 수율', () => {
  test('두 곳은 자기 색을 지키고, 한 곳은 근거가 없어 폴백을 쓴다고 말한다', () => {
    const measured = SAMPLES.map((name) => {
      const palette = paletteFor(name);
      return {
        name,
        candidates: (artifact(name).clinicPaletteProjection?.rawCandidates ?? []).length,
        brand: palette.slots['--brand'],
        origin: palette.meta.origin,
        refinement: palette.meta.refinement,
        fallbackUsed: palette.meta.fallbackUsed,
      };
    });

    assert.deepEqual(measured, [
      {
        name: 'dental360',
        candidates: 5,
        brand: '#003EDA',
        origin: 'cta',
        refinement: 'darken-to-gate',
        fallbackUsed: false,
      },
      {
        name: 'cameods',
        candidates: 8,
        brand: '#3C2029',
        origin: 'cta',
        refinement: 'deep-neutral',
        fallbackUsed: false,
      },
      {
        // Every colour on this site lives in external Next.js CSS chunks the crawl does not
        // fetch, so there is honestly nothing to extract. It says so rather than inventing one.
        name: 'iddental',
        candidates: 0,
        brand: CLINIC_PALETTE_FALLBACKS.dental.brand,
        origin: 'specialty-fallback',
        refinement: 'none',
        fallbackUsed: true,
      },
    ]);

    const nonFallback = measured.filter((entry) => !entry.fallbackUsed).length;
    assert.ok(nonFallback / measured.length > 1 / 3, `corpus yield ${nonFallback}/${measured.length}`);
  });

  test('추출에 성공한 두 곳은 서로 다른 브랜드로 렌더된다', () => {
    const brands = SAMPLES.map((name) => paletteFor(name))
      .filter((palette) => !palette.meta.fallbackUsed)
      .map((palette) => palette.slots['--brand']);
    assert.equal(new Set(brands).size, brands.length);
  });
});
