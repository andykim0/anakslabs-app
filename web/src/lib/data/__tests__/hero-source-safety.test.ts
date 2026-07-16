import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildV2ImagePrompt } from '@/lib/design/quality-standards';
import { PRODUCT_SAFETY_DIRECTIVE } from '@/lib/design/image-subjects';
import {
  AssetTruthGenerationError,
  assertSafeAiImageRequest,
} from '@/lib/ai/image-generation-policy';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('H3 — Supabase 이미지 생성 우회 방지', () => {
  test('mock 후보·최종 풀도 대표 사진을 명시 소스로 전달한다', () => {
    const mock = source('src/lib/data/mock/ai.ts');
    assert.match(mock, /if \(v2Plan\?\.kind === 'reuse_customer_upload'\)/);
    assert.match(mock, /heroAssetRef: \{ assetId: v2Plan\.asset\.id, url: v2Plan\.asset\.canonicalUrl \}/);
    assert.match(mock, /selectedHeroPhotoUrl\(survey\)/, 'legacy upload path remains read-compatible');
    assert.match(
      mock,
      /const hero = selectedUpload[\s\S]*?\? \{ url: selectedUpload \}[\s\S]*?: await stampMockAiAsset\(bp\.mockHeroUrl, owner, 'candidate'\)/,
    );
    assert.match(mock, /heroImageUrl: hero\.url/);
    assert.match(mock, /heroPhoto: selectedUpload/);
    assert.doesNotMatch(mock, /\/mock\/dish-/i, 'mock 기본 풀에도 가짜 완성 요리를 두지 않는다');
  });

  test('대표 사진 후보 경로는 Gemini 전에 즉시 반환하고 Claude 자유 heroImagePrompt를 받지 않는다', () => {
    const ai = source('src/lib/data/supabase/ai.ts');
    const candidates = ai.slice(
      ai.indexOf('async generateCandidates'),
      ai.indexOf('async generateSiteConfig'),
    );
    const truthGuard = candidates.indexOf("if (v2Plan?.kind === 'reuse_customer_upload')");
    const legacyGuard = candidates.indexOf('if (heroPhotoUrl)');
    const refine = candidates.indexOf('refineCandidateTexts');
    const gemini = candidates.indexOf('generateImageAsset');

    assert.ok(truthGuard >= 0 && truthGuard < refine && truthGuard < gemini, '검증 실사 가드가 AI 호출보다 늦음');
    assert.ok(legacyGuard >= 0 && legacyGuard < refine && legacyGuard < gemini, '레거시 대표 사진 가드가 AI 호출보다 늦음');
    assert.match(candidates, /heroAssetRef: \{ assetId: v2Plan\.asset\.id, url: v2Plan\.asset\.canonicalUrl \}/);
    assert.match(candidates, /heroImageUrl: heroPhotoUrl/);
    assert.doesNotMatch(ai, /text\?\.heroImagePrompt|record\.heroImagePrompt/);
    assert.match(ai, /selectedHeroPhotoUrl\(survey\)/);
    assert.match(ai, /heroPhoto: selectedUpload/);
  });

  test('섹션 장면 레지스트리에 제품·서비스 결과 closeup 양의 피사체가 없다', () => {
    const ai = source('src/lib/data/supabase/ai.ts');
    assert.doesNotMatch(ai, /signature product\/service closeup/i);
    assert.doesNotMatch(ai, /finished (dish|product|service result)/i);
  });

  test('edit-request 명시 제품·하이퍼리얼 요청은 차단하고 tone-only는 추상 프롬프트로 재조립한다', () => {
    const raw = 'hyperrealistic WAGYU-TOMAHAWK-AX77 steak on a ceramic plate';
    assert.throws(
      () => assertSafeAiImageRequest(raw),
      (error) => error instanceof AssetTruthGenerationError
        && error.code === 'AI_HYPERREAL_REQUEST_FORBIDDEN',
    );
    const safe = buildV2ImagePrompt('editorial', 'supporting image edit', {
      imageDirectionId: 'abstract_editorial',
      tone: '더 차분하고 미니멀하게',
    });
    assert.ok(safe.includes(PRODUCT_SAFETY_DIRECTIVE));
    assert.doesNotMatch(safe, /WAGYU-TOMAHAWK-AX77|steak|ceramic plate/i);

    const ai = source('src/lib/data/supabase/ai.ts');
    const edit = ai.slice(ai.indexOf('async generateImage('), ai.indexOf('async generateVideo('));
    assert.match(edit, /assertAiImageGenerationPolicy\(/);
    assert.match(edit, /buildV2ImagePrompt\(/);
    assert.match(edit, /tone: input\.prompt/);
    assert.doesNotMatch(edit, /`\$\{input\.prompt\}/);
  });
});
