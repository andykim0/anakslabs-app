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
    const generate = pipeline.indexOf('return ai.generateVideo({', log);
    assert.ok(guard >= 0 && guard < log && log < generate, 'guard → log → AI 순서가 깨짐');
  });

  test('800초 밴드에이드·ffmpeg-static·Queue를 V-batch에 넣지 않는다', () => {
    const heroRoute = source('src/app/api/sites/[siteId]/hero-video/route.ts');
    const packageJson = source('package.json');
    assert.doesNotMatch(heroRoute, /maxDuration\s*=\s*800/);
    assert.doesNotMatch(packageJson, /ffmpeg-static/);
    assert.doesNotMatch(source('src/app/api/edit-requests/route.ts'), /video_gen_jobs|Vercel Queues/i);
  });
});
