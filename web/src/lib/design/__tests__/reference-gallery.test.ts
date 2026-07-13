/**
 * [R3] 레퍼런스 갤러리 불변식 — ≥24 · id 유일 · 전 참조(skeleton/palette/font/motion) 실재 자산 해결 ·
 * 6목적 커버 · previewImage 경로 형식 · generationParams 결정적.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_GALLERY, galleryForPurpose, galleryById, generationParamsFor } from '@/lib/design/reference-gallery';
import { skeletonById } from '@/lib/data/skeletons';
import { paletteEntryById } from '@/lib/design/palette-library';
import { FONT_PAIRINGS } from '@/lib/ai/design-knowledge-data';
import { MOTION_PRESETS } from '@/lib/motion/presets';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';

const fontIds = new Set(FONT_PAIRINGS.map((f) => f.id));
const motionIds = new Set(Object.keys(MOTION_PRESETS));

describe('R3 — 레퍼런스 갤러리', () => {
  test('≥24개(권장 36) + id 유일', () => {
    assert.ok(REFERENCE_GALLERY.length >= 24, `갤러리 ${REFERENCE_GALLERY.length}개 (<24)`);
    const ids = REFERENCE_GALLERY.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length, 'id 중복');
  });

  test('전 항목: skeleton/palette/font/motion 참조가 실재 자산으로 해결', () => {
    for (const d of REFERENCE_GALLERY) {
      assert.ok(skeletonById(d.skeletonId), `${d.id}: skeleton '${d.skeletonId}' 미해결`);
      assert.ok(paletteEntryById(d.paletteId), `${d.id}: palette '${d.paletteId}' 미해결`);
      assert.ok(fontIds.has(d.fontPairingId), `${d.id}: font '${d.fontPairingId}' 미해결`);
      assert.ok(motionIds.has(d.motionPresetId), `${d.id}: motion '${d.motionPresetId}' 미해결`);
      // 뼈대 목적과 항목 목적 일치
      assert.equal(skeletonById(d.skeletonId)!.purpose, d.purpose, `${d.id}: 목적 불일치`);
    }
  });

  test('6목적 전부 커버(각 ≥3)', () => {
    for (const p of LIVE_PURPOSE_IDS) {
      assert.ok(galleryForPurpose(p).length >= 3, `${p} 갤러리 ${galleryForPurpose(p).length}(<3)`);
    }
  });

  test('previewImage 경로 형식 + tone 보유', () => {
    for (const d of REFERENCE_GALLERY) {
      assert.equal(d.previewImage, `/reference/${d.id}.webp`, `${d.id} 프리뷰 경로 형식`);
      assert.ok(d.tone.length > 0, `${d.id} tone 없음`);
      assert.ok(d.label.includes('·'), `${d.id} 라벨 형식(뼈대·팔레트)`);
    }
  });

  test('generationParamsFor 결정적 — 팔레트 시드/dark 해결', () => {
    const d = REFERENCE_GALLERY[0];
    const params = generationParamsFor(d);
    assert.equal(params.skeletonId, d.skeletonId);
    assert.equal(params.paletteId, d.paletteId);
    assert.match(params.paletteSeed.primary, /^#[0-9a-fA-F]{6}$/);
    assert.equal(typeof params.dark, 'boolean');
    assert.equal(galleryById(d.id)?.id, d.id);
  });
});
