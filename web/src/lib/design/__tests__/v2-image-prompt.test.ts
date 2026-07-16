import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildV2ImagePrompt, NO_TEXT_DIRECTIVE } from '@/lib/design/quality-standards';

describe('asset policy v2 image prompts', () => {
  test('all generative directions remain abstract/decorative and non-photographic', () => {
    const prompts = [
      buildV2ImagePrompt('editorial', 'hero', {
        imageDirectionId: '3d_brand_world',
        tone: ['모던'],
        palettePrimary: '#2d63f0',
      }),
      buildV2ImagePrompt('editorial', 'gallery', {
        imageDirectionId: 'illustration_collage',
        tone: ['따뜻한'],
      }),
      buildV2ImagePrompt('editorial', 'supporting', {
        imageDirectionId: 'abstract_editorial',
        tone: ['차분한'],
      }),
    ];

    for (const prompt of prompts) {
      assert.match(prompt, /atmospheric or decorative only/i);
      assert.match(prompt, /do NOT depict a specific finished dish, product, or service result/i);
      assert.ok(prompt.includes(NO_TEXT_DIRECTIVE));
      assert.doesNotMatch(prompt, /[가-힣ㄱ-ㅎㅏ-ㅣ]/);
      assert.doesNotMatch(prompt, /#[0-9a-f]{3,8}/i);
      assert.doesNotMatch(prompt, /Business-setting context|documentary-looking claims|photographic, art-directed/i);
    }
    assert.match(prompts[0], /clearly synthetic, non-photographic 3D brand world/i);
    assert.match(prompts[1], /intentionally non-photographic editorial illustration/i);
    assert.match(prompts[2], /abstract editorial composition/i);
  });

  test('free-form industry and requested factual scene have no input channel', () => {
    const prompt = buildV2ImagePrompt('editorial', 'create a real steak product closeup', {
      imageDirectionId: 'abstract_editorial',
      tone: 'restaurant product photo',
    });
    assert.doesNotMatch(prompt, /steak|restaurant|product photo|closeup/i);
    assert.match(prompt, /abstract editorial composition/i);
  });
});
