import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildImagePrompt } from '@/lib/design/quality-standards';
import { PRODUCT_SAFETY_DIRECTIVE } from '@/lib/design/image-subjects';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('H3 — Supabase 이미지 생성 우회 방지', () => {
  test('mock 후보·최종 풀도 대표 사진을 명시 소스로 전달한다', () => {
    const mock = source('src/lib/data/mock/ai.ts');
    assert.match(mock, /heroImageUrl: survey\.heroPhotoUrl \?\? bp\.mockHeroUrl/);
    assert.match(mock, /heroPhoto: survey\.heroPhotoUrl/);
    assert.doesNotMatch(mock, /\/mock\/dish-/i, 'mock 기본 풀에도 가짜 완성 요리를 두지 않는다');
  });

  test('대표 사진 후보 경로는 Gemini 전에 즉시 반환하고 Claude 자유 heroImagePrompt를 받지 않는다', () => {
    const ai = source('src/lib/data/supabase/ai.ts');
    const candidates = ai.slice(
      ai.indexOf('async generateCandidates'),
      ai.indexOf('async generateSiteConfig'),
    );
    const heroGuard = candidates.indexOf('if (heroPhotoUrl)');
    const refine = candidates.indexOf('refineCandidateTexts');
    const gemini = candidates.indexOf('generateImageUrl');

    assert.ok(heroGuard >= 0 && heroGuard < refine && heroGuard < gemini, '대표 사진 가드가 AI 호출보다 늦음');
    assert.match(candidates, /heroImageUrl: heroPhotoUrl/);
    assert.doesNotMatch(ai, /text\?\.heroImagePrompt|record\.heroImagePrompt/);
    assert.match(ai, /heroPhoto: survey\.heroPhotoUrl/);
  });

  test('섹션 장면 레지스트리에 제품·서비스 결과 closeup 양의 피사체가 없다', () => {
    const ai = source('src/lib/data/supabase/ai.ts');
    assert.doesNotMatch(ai, /signature product\/service closeup/i);
    assert.doesNotMatch(ai, /finished (dish|product|service result)/i);
  });

  test('edit-request 원문은 tone 힌트로만 분류되고 안전 프롬프트에는 특정 제품이 남지 않는다', () => {
    const raw = 'hyperrealistic WAGYU-TOMAHAWK-AX77 steak on a ceramic plate';
    const safe = buildImagePrompt('editorial', 'local business', 'supporting image edit', {
      candidateStyle: 'photo',
      tone: raw,
    });
    assert.ok(safe.includes(PRODUCT_SAFETY_DIRECTIVE));
    assert.doesNotMatch(safe, /WAGYU-TOMAHAWK-AX77|steak|ceramic plate/i);

    const ai = source('src/lib/data/supabase/ai.ts');
    const edit = ai.slice(ai.indexOf('async generateImage('), ai.indexOf('async generateVideo('));
    assert.match(edit, /buildImagePrompt\(/);
    assert.match(edit, /tone: input\.prompt/);
    assert.doesNotMatch(edit, /`\$\{input\.prompt\}/);
  });
});
