/**
 * [R4] 레퍼런스 미리보기 파일 존재 불변식 — 갤러리 전 항목이 실제 존재하는 프리뷰 파일을 가리킨다.
 * (충실 SiteRenderer 스크린샷은 헤드리스 부재로 무드카드 대체 — 파일 경로·개수 계약은 동일)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REFERENCE_GALLERY } from '@/lib/design/reference-gallery';

const PUBLIC = join(process.cwd(), 'public');

describe('R4 — 미리보기 파일 존재', () => {
  test('갤러리 전 항목의 previewImage 파일이 존재 + ≤150KB', () => {
    for (const d of REFERENCE_GALLERY) {
      const rel = d.previewImage.replace(/^\//, '');
      const abs = join(PUBLIC, rel);
      assert.ok(existsSync(abs), `프리뷰 파일 없음: ${d.previewImage} (${d.id})`);
      const kb = statSync(abs).size / 1024;
      assert.ok(kb <= 150, `${d.id} 프리뷰 ${kb.toFixed(1)}KB (>150)`);
    }
  });

  test('previewImage는 /reference/ 하위 webp', () => {
    for (const d of REFERENCE_GALLERY) {
      assert.match(d.previewImage, /^\/reference\/.+\.webp$/, `${d.id} 경로 형식`);
    }
  });
});
