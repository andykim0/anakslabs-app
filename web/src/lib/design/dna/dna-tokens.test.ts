import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FONT_PAIRINGS } from '@/lib/ai/design-knowledge-data';
import { ACTIVE_MOTION_SIGNATURE_IDS } from '@/lib/motion/signatures';
import {
  DESIGN_DNA_CATALOG,
  DNA_REQUIRED_AA_PAIRS,
  expandTokens,
  oklchToSrgb,
  parseOklch,
  stableTokenJson,
  tokenContrastRatio,
  type DesignDnaOverrides,
} from '@/lib/design/dna';

type ForbiddenOverrideKey = Extract<
  keyof DesignDnaOverrides,
  | 'hex'
  | 'px'
  | `${string}Hex`
  | `${string}Px`
  | `${string}_hex`
  | `${string}_px`
>;

const NO_FORBIDDEN_OVERRIDE_KEY: [ForbiddenOverrideKey] extends [never] ? true : false = true;
const GOLDEN_HUES = [24, 180, 312] as const;
const GOLDEN_TOKEN_HASHES = {
  'cafe-warm-editorial@24': '799ed29c6515717666b33450327b507a8add8799e891eace81e6e158835b57ad',
  'cafe-warm-editorial@180': '274bf98016a23ca032e042fcb37073b4b5a0b14aff53031deb54019a6a87a5d1',
  'cafe-warm-editorial@312': 'bd34ed277b4f8e5642457b2794ba78013ad9f08072b57573893ae7702bc97fe4',
  'dining-refined-contrast@24': '39bba292f08a3314227a67998e3c5d356f6ec1c8e34e646cb8fa0f664e998694',
  'dining-refined-contrast@180': '1cab13719e29ca9cf12f0524b0108a98d735f79edaa887b9f0b2a2062777ada6',
  'dining-refined-contrast@312': 'de6f34992a6fb54ec30921bf03cf7730b33f43070ecf4a31e2a6a6b3c59fa6c9',
  'beauty-soft-wellness@24': '4ee53451f4dac87048c7e4b261f4e07a9c58d446aa00db02d907da7f0ba4a069',
  'beauty-soft-wellness@180': 'bd27cd33b5ead9bdfc02998d8a0a762d3fc18eb390a16e294e54b8d9d0a08297',
  'beauty-soft-wellness@312': '3e99f518730e2df0006abd1c169f4420012fcf4cddb9683b1bdfa7c95ed4c37d',
  'medical-clinical-clarity@24': '27f981be5b58ac6d064d0250451b7fadf6b5799a0314004713a3870931dd0f68',
  'medical-clinical-clarity@180': 'ddc213b086c10459e7383adaf9b796e7b99e6fb92b1a9e0938b7b9bf5274a007',
  'medical-clinical-clarity@312': '0a67b04aaff0b0a39a09dda226efb33446002dd377e31ad6323d934e3a81fa1b',
  'legal-authoritative-editorial@24': '3c41e70e536434bca0d9c7a45a74d18c06551a7f3650a0b710ae85a3eba26cf4',
  'legal-authoritative-editorial@180': '5c2e7df164b262f21662b4064c9a70310b3ce53734c6d4a9ff81ae6f56f16d79',
  'legal-authoritative-editorial@312': '2fc534a689f5c4bada3d00f9eed8c1899afc175e3a02ca2a95dcdb7aa3c382a2',
  'workshop-tactile-heritage@24': '30011d63f6cc5730e8aca93e6c202c4e6e45d2e64c53085da4e1829d61925ee6',
  'workshop-tactile-heritage@180': '46ebe5fa0d2e16a218820ecb7922bde999aa7ff4231cca60829b4b32163dc6b4',
  'workshop-tactile-heritage@312': 'e89e2886ae3deab70b53f3330acffabd80fa1b43564cbfc9a89c4b5fd68a9f9e',
  'academy-structured-friendly@24': '17f74977bf767a9171f09de0fa67e73d3e55027b4830961dfae864f6dad60cb2',
  'academy-structured-friendly@180': '2b67f39ac9bf8a997ddfc2c454ed9b4c84de24cf78a9a3dbaf645c189046b146',
  'academy-structured-friendly@312': 'eb62a9bde633a0619ff244ae7c18bac905f294bf219d4d6551ca9b257d71cb53',
  'retail-bold-geometric@24': '5e929e4d3f293a404841323280c973c408d794f039f38a5e97b1303ccdf221b2',
  'retail-bold-geometric@180': '7b18f6dc0353b3e133b875e3a9ea51febfc5c72d154b1b003f2335064c055d17',
  'retail-bold-geometric@312': '35b94185e6942fce3e186983c0752fc1008d1c83cf686cb629d1fab26b9e2285',
} as const;

describe('DesignDNA catalog', () => {
  test('8개 프리셋이 기존 폰트·active 모션 레지스트리만 참조한다', () => {
    assert.equal(DESIGN_DNA_CATALOG.length, 8);
    assert.equal(new Set(DESIGN_DNA_CATALOG.map((dna) => dna.id)).size, 8);

    const fontIds = new Set(FONT_PAIRINGS.map((pair) => pair.id));
    const motionIds = new Set<string>(ACTIVE_MOTION_SIGNATURE_IDS);
    for (const dna of DESIGN_DNA_CATALOG) {
      assert.ok(fontIds.has(dna.type.pair), `${dna.id}: 등록되지 않은 폰트 페어`);
      assert.ok(motionIds.has(dna.motionDefault), `${dna.id}: active가 아닌 모션 시그니처`);
      assert.deepEqual(dna.assetRecipe, { status: 'deferred' });
    }

    const coveredIndustries = new Set<string>(DESIGN_DNA_CATALOG.flatMap((dna) => [...dna.industryPrior]));
    for (const industry of ['cafe', 'fine_dining', 'beauty', 'medical', 'legal', 'workshop', 'other', 'retail']) {
      assert.ok(coveredIndustries.has(industry), `${industry}: 초기 카탈로그에서 누락`);
    }
  });
});

describe('expandTokens', () => {
  test('CSS Color 4 기준 OKLCH 원색 벡터를 sRGB로 변환한다', () => {
    const vectors = [
      [{ l: 0.6279553606, c: 0.2576833078, h: 29.2338852 }, { r: 1, g: 0, b: 0 }],
      [{ l: 0.8664396115, c: 0.2948272403, h: 142.4953389 }, { r: 0, g: 1, b: 0 }],
      [{ l: 0.4520137184, c: 0.3132143717, h: 264.0520206 }, { r: 0, g: 0, b: 1 }],
    ] as const;

    for (const [input, expected] of vectors) {
      const actual = oklchToSrgb(input);
      assert.ok(Math.abs(actual.r - expected.r) < 0.0001);
      assert.ok(Math.abs(actual.g - expected.g) < 0.0001);
      assert.ok(Math.abs(actual.b - expected.b) < 0.0001);
    }
  });

  test('8개 프리셋 × 대표 hueSeed 3개의 골든 TokenSet이 고정된다', () => {
    const actual: Record<string, string> = {};
    for (const dna of DESIGN_DNA_CATALOG) {
      for (const hue of GOLDEN_HUES) {
        const key = `${dna.id}@${hue}`;
        actual[key] = createHash('sha256')
          .update(stableTokenJson(expandTokens(dna.id, hue)))
          .digest('hex');
      }
    }

    assert.equal(Object.keys(actual).length, 24);
    assert.deepEqual(actual, GOLDEN_TOKEN_HASHES);
  });

  test('모든 프리셋과 hueSeed 0..360에서 필수 텍스트 쌍이 WCAG AA를 통과한다', () => {
    for (const dna of DESIGN_DNA_CATALOG) {
      for (let hue = 0; hue <= 360; hue += 1) {
        const tokens = expandTokens(dna.id, hue);
        for (const [foreground, background] of DNA_REQUIRED_AA_PAIRS) {
          const ratio = tokenContrastRatio(tokens, foreground, background);
          assert.ok(
            ratio >= tokens.accessibility.minimumTextContrast,
            `${dna.id}@${hue}: ${foreground}/${background}=${ratio}`,
          );
        }
      }
    }
  });

  test('AA 보정은 최근접 0.02 lightness 스텝에 스냅된다', () => {
    for (const dna of DESIGN_DNA_CATALOG) {
      for (const hue of GOLDEN_HUES) {
        const tokens = expandTokens(dna.id, hue);
        for (const correction of tokens.accessibility.corrections) {
          const before = parseOklch(correction.before);
          const after = parseOklch(correction.after);
          const steps = Math.abs(after.l - before.l) / 0.02;
          assert.ok(Math.abs(steps - Math.round(steps)) < 0.000001);
          assert.ok(correction.beforeRatio < 4.5);
          assert.ok(correction.afterRatio >= 4.5);
        }
      }
    }
  });

  test('같은 입력은 객체와 안정 JSON 모두 바이트 단위로 동일하다', () => {
    const overrides = {
      density: 'airy',
      radius: 'rounded',
      colorStrategy: 'duotone',
    } as const;
    const first = expandTokens('medical-clinical-clarity', 217.25, overrides);
    const second = expandTokens('medical-clinical-clarity', 217.25, overrides);
    assert.deepEqual(first, second);
    assert.equal(stableTokenJson(first), stableTokenJson(second));
    assert.deepEqual(expandTokens('medical-clinical-clarity', 0), expandTokens('medical-clinical-clarity', 360));
  });

  test('카탈로그 id·hue 범위·enum 외 오버라이드를 거부한다', () => {
    assert.throws(() => expandTokens('unknown' as never, 120), /Unknown DesignDNA id/u);
    assert.throws(() => expandTokens('cafe-warm-editorial', -1), /hue seed/u);
    assert.throws(() => expandTokens('cafe-warm-editorial', 361), /hue seed/u);
    assert.throws(
      () => expandTokens('cafe-warm-editorial', 120, { arbitraryColor: '#ffffff' } as never),
      /Unknown DNA override/u,
    );
  });
});

describe('DNA pipeline static invariants', () => {
  test('모델 입력 계약과 신규 모듈에 hex·px 필드나 색상 리터럴이 없다', () => {
    assert.equal(NO_FORBIDDEN_OVERRIDE_KEY, true);
    const dnaSources = ['catalog.ts', 'color.ts', 'expand-tokens.ts', 'index.ts', 'types.ts']
      .map((file) => readFileSync(resolve(process.cwd(), 'src/lib/design/dna', file), 'utf8'))
      .join('\n');

    assert.doesNotMatch(dnaSources, /#[\da-f]{3,8}\b/iu);
    assert.doesNotMatch(dnaSources, /\b[\w$]*(?:hex|px)[\w$]*\??\s*:/iu);
  });

  test('DNA1은 기존 후보 생성·SiteConfig 경로에 배선되지 않는다', () => {
    const legacySources = [
      'src/lib/data/design-candidates.ts',
      'src/lib/types/site.ts',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');

    assert.doesNotMatch(legacySources, /design\/dna/iu);
  });
});
