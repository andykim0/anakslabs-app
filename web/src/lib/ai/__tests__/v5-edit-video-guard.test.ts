import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('V5 edit-request VIDEO_GEN 비용 안전 순서', () => {
  test('가드가 편집요청 생성과 크레딧 차감보다 먼저 실행된다', () => {
    const route = source('src/app/api/edit-requests/route.ts');
    const guard = route.indexOf('await assertVideoGenAllowed(siteId, client.tier)');
    const create = route.indexOf('await editRequests.create');
    const consume = route.indexOf('await credits.consume');

    assert.ok(guard >= 0, 'VIDEO_GEN 사전 가드 없음');
    assert.ok(guard < create, '가드보다 편집요청 생성이 먼저 실행됨');
    assert.ok(guard < consume, '가드보다 크레딧 차감이 먼저 실행됨');
  });

  test('허용된 영상 호출도 공용 guard → log → AI 순서를 통과한다', () => {
    const route = source('src/app/api/edit-requests/route.ts');
    const pipeline = source('src/lib/ai/video-pipeline.ts');
    assert.match(route, /case 'video':[\s\S]*await generateGuardedVideo\(/);
    assert.doesNotMatch(route, /case 'video':[\s\S]{0,180}ai\.generateVideo\(/);

    const guard = pipeline.indexOf('await assertVideoGenAllowed(input.siteId, input.tier)');
    const log = pipeline.indexOf('await videoGen.record({', guard);
    const generate = pipeline.indexOf('return ai.generateVideo(', log);
    assert.ok(guard >= 0 && guard < log && log < generate, 'guard → log → AI 순서가 깨짐');
  });

  test('기존 kill/addon/cap 뒤에 sync 가드를 평가하고 비용 로그 전 중단한다', () => {
    const pipeline = source('src/lib/ai/video-pipeline.ts');
    const assertStart = pipeline.indexOf('export async function assertVideoGenAllowed');
    const assertEnd = pipeline.indexOf('export interface HeroVideoResult', assertStart);
    const block = pipeline.slice(assertStart, assertEnd);
    const costGuard = block.indexOf('videoGuardError(');
    const costThrow = block.indexOf('if (err) throw new Error(err)', costGuard);
    const syncGuard = block.indexOf('synchronousVideoTransportError(', costThrow);

    assert.ok(costGuard >= 0 && costGuard < costThrow && costThrow < syncGuard, 'kill/addon/cap → sync 순서가 깨짐');

    const guarded = pipeline.indexOf('await assertVideoGenAllowed(input.siteId, input.tier)');
    const log = pipeline.indexOf('await videoGen.record({', guarded);
    const generate = pipeline.indexOf('return ai.generateVideo(', log);
    assert.ok(guarded >= 0 && guarded < log && log < generate, 'sync 가드가 log/AI보다 늦음');
  });

  test('edit-request는 VIDEO_GEN_SYNC_UNSAFE를 요청·크레딧 생성 전 503으로 반환한다', () => {
    const route = source('src/app/api/edit-requests/route.ts');
    const mapping = route.indexOf("code === 'VIDEO_GEN_SYNC_UNSAFE'");
    const guard = route.indexOf('await assertVideoGenAllowed(siteId, client.tier)');
    const create = route.indexOf('await editRequests.create');
    const consume = route.indexOf('await credits.consume');

    assert.ok(mapping >= 0, 'VIDEO_GEN_SYNC_UNSAFE 503 매핑 없음');
    assert.match(route.slice(mapping, mapping + 100), /apiError\(503/);
    assert.ok(guard >= 0 && guard < create && guard < consume, 'sync 가드가 요청 생성·크레딧 차감보다 늦음');
  });

  test('hero POST도 이미지 fetch·비용 로그·AI 전에 sync 가드를 503으로 매핑한다', () => {
    const route = source('src/app/api/sites/[siteId]/hero-video/route.ts');
    const mapping = route.indexOf("code === 'VIDEO_GEN_SYNC_UNSAFE'");
    const guard = route.indexOf('await assertVideoGenAllowed(siteId, client.tier)');
    const context = route.indexOf('const ctx = heroVideoContext', guard);
    const generate = route.indexOf('await generateHeroVideo({', guard);

    assert.ok(mapping >= 0, 'hero VIDEO_GEN_SYNC_UNSAFE 503 매핑 없음');
    assert.match(route.slice(mapping - 60, mapping + 140), /apiError\(503/);
    assert.ok(guard >= 0 && guard < context && context < generate, 'hero fail-fast guard가 source/generate보다 늦음');
  });

  test('800초 밴드에이드·ffmpeg-static·Queue를 V-batch에 넣지 않는다', () => {
    const heroRoute = source('src/app/api/sites/[siteId]/hero-video/route.ts');
    const packageJson = source('package.json');
    assert.doesNotMatch(heroRoute, /maxDuration\s*=\s*800/);
    assert.doesNotMatch(packageJson, /ffmpeg-static/);
    assert.doesNotMatch(source('src/app/api/edit-requests/route.ts'), /video_gen_jobs|Vercel Queues/i);
  });
});
