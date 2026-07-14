import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { VIDEO_CONCEPTS } from '@/lib/motion/video-concepts';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('H3 — Veo 피사체·출처 안전', () => {
  test('영상 컨셉 promptSeed는 상품·증기·사람을 새로 만들지 않는다', () => {
    for (const concept of Object.values(VIDEO_CONCEPTS).flat()) {
      assert.doesNotMatch(
        concept.promptSeed,
        /\b(?:product|item|steam|people|hands|faces?|crowds?|storefront|workspace)\b/i,
        `${concept.id}: ${concept.promptSeed}`,
      );
    }
  });

  test('시작 이미지 실패는 guard·log·AI 전에 HERO_SOURCE_UNAVAILABLE로 중단된다', () => {
    const pipeline = source('src/lib/ai/video-pipeline.ts');
    const start = pipeline.indexOf('export async function generateHeroVideo');
    const end = pipeline.indexOf('/** 선택된 시안 로그', start);
    const block = pipeline.slice(start, end);
    const fetchSource = block.indexOf('await fetchImageAsBase64');
    const unavailable = block.indexOf('HERO_SOURCE_UNAVAILABLE', fetchSource);
    const guarded = block.indexOf('await generateGuardedVideo', unavailable);

    assert.ok(fetchSource >= 0 && fetchSource < unavailable && unavailable < guarded, 'source fetch → typed 중단 → guarded 호출 순서가 깨짐');
    assert.doesNotMatch(block, /\.\.\.\(image\s*\?/, 'image 실패 시 text-to-video 폴백이 남아 있음');
  });

  test('공용 유료 진입점은 정제 prompt 하나를 log와 AI 모두에 전달한다', () => {
    const pipeline = source('src/lib/ai/video-pipeline.ts');
    const start = pipeline.indexOf('export async function generateGuardedVideo');
    const end = pipeline.indexOf('export async function generateHeroVideo', start);
    const block = pipeline.slice(start, end);

    const sanitize = block.indexOf("buildMotionPrompt(input.prompt, input.source ?? 'ambient-ai')");
    const guard = block.indexOf('await assertVideoGenAllowed');
    const log = block.indexOf('await videoGen.record');
    const generate = block.indexOf('return ai.generateVideo');
    assert.ok(sanitize >= 0 && sanitize < guard && guard < log && log < generate, 'sanitize → guard → log → AI 순서가 깨짐');
    assert.equal((block.match(/prompt: safePrompt/g) ?? []).length, 2, 'log와 AI가 동일 safePrompt를 쓰지 않음');
    assert.doesNotMatch(block, /prompt:\s*input\.prompt/, 'raw prompt가 유료 경로에 남아 있음');
  });

  test('hero-video route는 안전 hint와 request origin만 전달한다', () => {
    const route = source('src/app/api/sites/[siteId]/hero-video/route.ts');
    assert.match(route, /tone:\s*z\.array/);
    assert.match(route, /heroPhotoUrl:/);
    assert.match(route, /isSafeMediaSrc/);
    assert.match(route, /sourceOrigin:\s*request\.nextUrl\.origin/);
    assert.match(route, /HERO_SOURCE_UNAVAILABLE/);
    assert.doesNotMatch(route, /industryDescriptor|subject:/, '업종/콘텐츠가 양의 subject로 유입됨');
    assert.match(route, /maxDuration\s*=\s*300/, '기존 Vercel 요청 시간 한도가 변경됨');
  });

  test('mock data:image 시작 사진은 fetch 없이 bytes로 복원한다', () => {
    const pipeline = source('src/lib/ai/video-pipeline.ts');
    const start = pipeline.indexOf('async function fetchImageAsBase64');
    const block = pipeline.slice(start);
    const decode = block.indexOf('const dataImage = /^data:');
    const resolve = block.indexOf('resolveHeroSourceUrl');
    assert.ok(decode >= 0 && decode < resolve, 'data:image 디코딩이 URL fetch 판정보다 먼저여야 함');
    assert.match(block, /5 \* 1024 \* 1024/);
  });
});
