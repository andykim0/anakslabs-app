/**
 * [영상 생성] Veo 요청 바디 빌더 — resolution/aspectRatio가 parameters에 실리는지 검증.
 * (실제 Veo 호출 없음 — 순수 함수만)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { veoRequestBody } from '@/lib/ai/veo-request';

describe('veoRequestBody — parameters 배선', () => {
  test('resolution 1080p → parameters.resolution=1080p', () => {
    const b = veoRequestBody({ prompt: 'x', durationSeconds: 8, resolution: '1080p' });
    assert.equal(b.parameters.resolution, '1080p');
  });

  test('resolution 미지정 → 720p 기본 (테넌트 원가 불변)', () => {
    const b = veoRequestBody({ prompt: 'x', durationSeconds: 8 });
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
