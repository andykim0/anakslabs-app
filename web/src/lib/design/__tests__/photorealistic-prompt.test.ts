import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildPhotorealisticPhotoPrompt } from '@/lib/design/photorealistic-prompt';

const base = {
  role: 'hero ambient backdrop',
  businessContext: 'restaurant dining',
  ambientSubject: 'quiet architectural shadows across stone, linen, and dark wood',
  mood: 'dark luxury mood with restrained warm highlights',
  moodId: 'elegant' as const,
  colorMood: 'accent tone amber, background tone near-black',
  seed: 'restaurant:hero:dark-luxury',
};

describe('Qwen-inspired photorealistic prompt expansion', () => {
  test('expands a safe subject into scene, light, camera, texture, and composition', () => {
    const prompt = buildPhotorealisticPhotoPrompt(base);

    assert.match(prompt, /^A photorealistic wide environmental commercial photograph/);
    assert.match(prompt, /Foreground: .+Midground: .+Background:/);
    assert.match(prompt, /Lighting: .+Camera:/);
    assert.match(prompt, /35mm prime lens at f\/4/);
    assert.match(prompt, /physically accurate perspective and scale/);
    assert.match(prompt, /material micro-texture/);
    assert.match(prompt, /copy space on the (left|right)/);
    assert.match(prompt, /captured on location by a professional photographer/);
  });

  test('is deterministic for the same seed and never injects an orderable subject', () => {
    const first = buildPhotorealisticPhotoPrompt(base);
    const second = buildPhotorealisticPhotoPrompt(base);

    assert.equal(first, second);
    assert.doesNotMatch(first, /steak|plated dish|menu item|treatment result|hairstyle|nail art/i);
  });

  test('uses a controlled industry environment and falls back safely', () => {
    const cafe = buildPhotorealisticPhotoPrompt({
      ...base,
      businessContext: 'cozy cafe and bakery',
      seed: 'cafe',
    });
    const unknown = buildPhotorealisticPhotoPrompt({
      ...base,
      businessContext: 'unknown external input',
      seed: 'unknown',
    });

    assert.match(cafe, /real neighborhood cafe interior/);
    assert.match(unknown, /believable independent local-business interior/);
    assert.doesNotMatch(cafe, /latte|croissant|finished drink/i);
  });
});
