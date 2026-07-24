import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { emptySiteConfig } from '@/lib/types/site';
import {
  applyKoreanFontPairing,
  fontPairingResourcesForText,
  KOREAN_FONT_APPROVED_GATE_CHECKLIST,
  KOREAN_FONT_PERFORMANCE_BUDGETS,
  productionFontAssetManifest,
  type ProductionKoreanFontPairId,
} from '.';

const REPRESENTATIVE_TEXT = `
홈 첫 화면 소개 브랜드 스토리 가치 철학 메뉴 서비스 상품 가격 갤러리 자주 묻는 질문 답변
오시는 길 문의 예약 전화 주소 영업시간 주차 결제 접근성 반려동물 와이파이 대표 강점 과정
머무는 순간이 차분한 기억으로 이어지도록 처음 찾는 분도 필요한 내용을 한눈에 읽고 편안하게
다음 행동을 고를 수 있도록 안내합니다 방문 전에 확인하기 읽기 편한 순서로 필요한 안내를 전합니다
`;

const EXPECTED_COLD_FIRST_SCREEN = {
  'kr-pretendard-neutral': {
    before: 444_468,
    after: 97_396,
    faceIds: ['pretendard-variable'],
  },
  'kr-nanum-myeongjo-readable': {
    before: 810_012,
    after: 175_732,
    faceIds: ['pretendard-variable', 'nanum-myeongjo-700'],
  },
  'kr-gmarket-noto-structured': {
    before: 617_176,
    after: 142_444,
    faceIds: ['gmarket-sans-700', 'noto-sans-kr-variable'],
  },
  'kr-nanum-square-round-friendly': {
    before: 604_960,
    after: 153_628,
    faceIds: ['nanum-square-round-700', 'pretendard-variable'],
  },
} as const satisfies Record<
  ProductionKoreanFontPairId,
  { before: number; after: number; faceIds: readonly string[] }
>;

const EXPECTED_EXPORT_PAIR = {
  'kr-pretendard-neutral': { before: 444_468, after: 97_396 },
  'kr-nanum-myeongjo-readable': { before: 1_284_252, after: 263_428 },
  'kr-gmarket-noto-structured': { before: 863_496, after: 189_212 },
  'kr-nanum-square-round-friendly': { before: 760_376, after: 208_124 },
} as const satisfies Record<ProductionKoreanFontPairId, { before: number; after: number }>;

function firstCharacter(unicodeRange: string): string {
  const match = /^U\+([0-9a-f]+)/iu.exec(unicodeRange);
  assert.ok(match, unicodeRange);
  return String.fromCodePoint(Number.parseInt(match[1], 16));
}

describe('FNT R1 — 승인 성능 게이트', () => {
  test('콜드 첫 화면 실제 전송 face 조합은 전 세트 200KiB 이하로 고정된다', () => {
    const manifest = productionFontAssetManifest();
    assert.equal(manifest.chunks.length, 17);
    assert.equal(
      manifest.chunks.reduce((sum, chunk) => sum + chunk.codePoints, 0),
      manifest.characterSet.codePoints,
    );
    assert.equal(manifest.assets.length, 8 * manifest.chunks.length);
    for (const [id, expected] of Object.entries(EXPECTED_COLD_FIRST_SCREEN)) {
      const bytes = manifest.assets
        .filter((asset) => (
          asset.chunkId === 'common'
          && (expected.faceIds as readonly string[]).includes(asset.faceId)
        ))
        .reduce((sum, asset) => sum + asset.bytes, 0);
      assert.equal(bytes, expected.after, id);
      assert.ok(bytes < expected.before, `${id}: ${bytes} < ${expected.before}`);
      assert.ok(bytes <= KOREAN_FONT_PERFORMANCE_BUDGETS.firstScreenBytes, id);
    }
  });

  test('실제 문자 기반 export pair는 전 세트 600KiB 이하로 고정된다', () => {
    for (const [id, expected] of Object.entries(EXPECTED_EXPORT_PAIR)) {
      const config = emptySiteConfig('실제 문자 내보내기');
      config.theme = applyKoreanFontPairing(config.theme, id as ProductionKoreanFontPairId);
      const resources = fontPairingResourcesForText(config.theme, REPRESENTATIVE_TEXT);
      assert.ok(resources, id);
      assert.deepEqual(
        [...new Set(resources.assets.map((asset) => asset.chunkId))],
        ['common'],
      );
      assert.equal(resources.bytes, expected.after, id);
      assert.ok(resources.bytes < expected.before, `${id}: ${resources.bytes} < ${expected.before}`);
      assert.ok(resources.bytes <= KOREAN_FONT_PERFORMANCE_BUDGETS.exportPairBytes, id);
    }
  });

  test('희귀 문자는 해당 tail 청크만 export에 추가하고 전체 코어를 복사하지 않는다', () => {
    const manifest = productionFontAssetManifest();
    const tail = manifest.chunks.find((chunk) => chunk.id === 'tail-16');
    assert.ok(tail);
    const config = emptySiteConfig('청크 선택');
    config.theme = applyKoreanFontPairing(config.theme, 'kr-pretendard-neutral');
    const common = fontPairingResourcesForText(config.theme, REPRESENTATIVE_TEXT);
    const withTail = fontPairingResourcesForText(
      config.theme,
      `${REPRESENTATIVE_TEXT}${firstCharacter(tail.unicodeRange)}`,
    );
    assert.ok(common);
    assert.ok(withTail);
    assert.deepEqual(
      [...new Set(withTail.assets.map((asset) => asset.chunkId))],
      ['common', 'tail-16'],
    );
    assert.ok(withTail.bytes > common.bytes);
    assert.ok(withTail.chunkCount < manifest.chunks.length);
  });

  test('검수 harness는 캐시 무효 실제 body 바이트·3밴드·두 임계를 manifest에 기록한다', async () => {
    const [reviewScript, exportSource] = await Promise.all([
      readFile(
        new URL('../../../scripts/render-font-pairing-review.tsx', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../export/self-host-fonts.ts', import.meta.url), 'utf8'),
    ]);
    assert.match(reviewScript, /page\.setCacheEnabled\(false\)/u);
    assert.match(reviewScript, /response\.request\(\)\.resourceType\(\) === 'font'/u);
    assert.match(reviewScript, /response\.buffer\(\)/u);
    assert.match(reviewScript, /firstScreenFontBytes > KOREAN_FONT_PERFORMANCE_BUDGETS\.firstScreenBytes/u);
    assert.match(reviewScript, /exportResources\.bytes > KOREAN_FONT_PERFORMANCE_BUDGETS\.exportPairBytes/u);
    assert.match(reviewScript, /budgets: KOREAN_FONT_PERFORMANCE_BUDGETS/u);
    for (const width of [1440, 768, 390]) assert.match(reviewScript, new RegExp(`width: ${width}`, 'u'));
    assert.match(exportSource, /fontPairingResourcesForText\(config\.theme, JSON\.stringify\(config\)\)/u);
    assert.doesNotMatch(exportSource, /subset-font/u);
  });

  test('승인 게이트 체크리스트는 15개 항목을 누락 없이 단일 소스로 유지한다', () => {
    assert.deepEqual(KOREAN_FONT_APPROVED_GATE_CHECKLIST, [
      'legacy-json-sha',
      'legacy-html-sha',
      'flag-off-issuance-zero',
      'stored-pin-flag-independent',
      'editor-manual-change-clears-pin',
      'chunk-checksum-deterministic',
      'first-screen-transfer-max',
      'actual-character-export-max',
      'korean-family-max',
      'static-face-max',
      'blocking-font-css-zero',
      'font-preload-zero',
      'cls-zero',
      'horizontal-overflow-zero',
      's-core-exposure-zero',
    ]);
  });
});
