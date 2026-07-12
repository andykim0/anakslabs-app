/**
 * [이미지 생성] Gemini 요청 바디 빌더 — aspectRatio가 imageConfig로 실리는지 검증.
 * (프롬프트 문자열 비율은 무시되므로 imageConfig가 실제 비율의 유일한 권위)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { geminiImageBody } from '@/lib/ai/gemini-image-request';

describe('geminiImageBody — aspectRatio 배선', () => {
  test('aspectRatio 주면 generationConfig.imageConfig.aspectRatio에 실린다', () => {
    const body = geminiImageBody({ prompt: 'x', aspectRatio: '16:9' });
    assert.equal(body.generationConfig.imageConfig?.aspectRatio, '16:9');
  });

  test('aspectRatio 미지정이면 imageConfig 없음 (모델 기본=정사각)', () => {
    const body = geminiImageBody({ prompt: 'x' });
    assert.equal(body.generationConfig.imageConfig, undefined);
  });

  test('responseModalities는 항상 IMAGE + 프롬프트 반영', () => {
    const body = geminiImageBody({ prompt: 'hello prompt', aspectRatio: '4:3' });
    assert.deepEqual(body.generationConfig.responseModalities, ['IMAGE']);
    assert.equal(body.contents[0].parts[0].text, 'hello prompt');
  });
});
