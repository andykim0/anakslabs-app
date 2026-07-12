/**
 * [영상 생성] Veo 요청 바디 빌더 — resolution/aspectRatio가 parameters에 실리는지 검증.
 * (실제 Veo 호출 없음 — 순수 함수만)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { veoRequestBody } from '@/lib/ai/veo-request';

describe('veoRequestBody — parameters 배선', () => {
  test('resolution 미지정 → 1080p 기본 (테넌트 전면 1080p 전환)', () => {
    const b = veoRequestBody({ prompt: 'x', durationSeconds: 8 });
    assert.equal(b.parameters.resolution, '1080p');
  });

  test('resolution 720p 명시 → parameters.resolution=720p (옵션 강등)', () => {
    const b = veoRequestBody({ prompt: 'x', durationSeconds: 8, resolution: '720p' });
    assert.equal(b.parameters.resolution, '720p');
  });

  test('aspectRatio 기본 16:9 + durationSeconds 반영', () => {
    const b = veoRequestBody({ prompt: 'x', durationSeconds: 6 });
    assert.equal(b.parameters.aspectRatio, '16:9');
    assert.equal(b.parameters.durationSeconds, 6);
  });

  test('image 주면 image-to-video 인스턴스(bytesBase64Encoded)', () => {
    const b = veoRequestBody({ prompt: 'x', durationSeconds: 8, image: { base64: 'AAA', mimeType: 'image/png' } });
    assert.equal(b.instances[0].image?.bytesBase64Encoded, 'AAA');
    assert.equal(b.instances[0].image?.mimeType, 'image/png');
  });

  test('image 없으면 인스턴스에 image 필드 없음 (text-to-video)', () => {
    const b = veoRequestBody({ prompt: 'x', durationSeconds: 8 });
    assert.equal(b.instances[0].image, undefined);
    assert.equal(b.instances[0].prompt, 'x');
  });
});
