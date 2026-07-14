import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { heroImageGenConfig } from '@/lib/onboarding/hero-image-cost';

const routeSource = readFileSync(new URL('../route.ts', import.meta.url), 'utf8');
const ENV_KEYS = ['HERO_IMAGE_GEN_ENABLED', 'HERO_IMAGE_MAX_BATCHES_PER_CLIENT'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('heroImageGenConfig — W1 비용 가드 환경값', () => {
  test('기본값은 생성 enabled, 클라이언트당 10분 3배치다', () => {
    delete process.env.HERO_IMAGE_GEN_ENABLED;
    delete process.env.HERO_IMAGE_MAX_BATCHES_PER_CLIENT;
    assert.deepEqual(heroImageGenConfig(), { enabled: true, maxBatchesPerClient: 3 });
  });

  test("킬스위치는 정확히 '0'일 때만 꺼진다", () => {
    process.env.HERO_IMAGE_GEN_ENABLED = '0';
    assert.equal(heroImageGenConfig().enabled, false);
    process.env.HERO_IMAGE_GEN_ENABLED = 'false';
    assert.equal(heroImageGenConfig().enabled, true);
  });

  test('상한은 유한 정수를 사용하고 음수는 0, 잘못된 값은 3으로 폴백한다', () => {
    process.env.HERO_IMAGE_MAX_BATCHES_PER_CLIENT = '4.9';
    assert.equal(heroImageGenConfig().maxBatchesPerClient, 4);
    process.env.HERO_IMAGE_MAX_BATCHES_PER_CLIENT = '-2';
    assert.equal(heroImageGenConfig().maxBatchesPerClient, 0);
    process.env.HERO_IMAGE_MAX_BATCHES_PER_CLIENT = 'not-a-number';
    assert.equal(heroImageGenConfig().maxBatchesPerClient, 3);
  });
});

describe('candidates route — W1 비용·멱등 불변식', () => {
  test('requestKey는 선택이며 100자로 제한하고 응답은 로컬 상수로 최대 3안이다', () => {
    assert.match(routeSource, /requestKey:\s*z\.string\(\)\.min\(1\)\.max\(100\)\.optional\(\)/);
    assert.match(routeSource, /const HERO_CANDIDATE_LIMIT = 3/);
    assert.match(routeSource, /items\.slice\(0, HERO_CANDIDATE_LIMIT\)/);
  });

  test('대표 사진은 복사본에서 제거한 뒤 후보 AI에 전달한다', () => {
    const copyAt = routeSource.indexOf('const copy = { ...survey };');
    const stripAt = routeSource.indexOf('delete copy.heroPhotoUrl;');
    const callAt = routeSource.indexOf('ai.generateCandidates(survey)');
    assert.ok(copyAt >= 0 && stripAt > copyAt && callAt > stripAt);
    assert.doesNotMatch(routeSource, /delete\s+body\.data\.survey\.heroPhotoUrl/);
  });

  test('캐시 조회가 킬스위치·rate 차감보다 먼저이고 client+requestKey+survey 서명을 쓴다', () => {
    const cachedAt = routeSource.indexOf('const cached = dedupKey ? dedupStore.get(dedupKey)');
    const configAt = routeSource.indexOf('const cfg = heroImageGenConfig()');
    const rateAt = routeSource.indexOf('if (rateLimited(client.id, cfg.maxBatchesPerClient))');
    assert.ok(cachedAt >= 0 && configAt > cachedAt && rateAt > configAt);
    assert.match(routeSource, /`\$\{clientId\}:\$\{requestKey\}:\$\{surveySignature\(survey\)\}`/);
    assert.match(routeSource, /createHash\('sha256'\)/);
    assert.match(routeSource, /10 \* 60_000/);
  });

  test('진행 중 Promise와 완료 결과를 저장하며 실패 시 동일 캐시를 삭제한다', () => {
    assert.match(routeSource, /dedupStore\.set\(dedupKey, \{ at: Date\.now\(\), promise: generation \}\)/);
    assert.match(routeSource, /dedupStore\.set\(dedupKey, \{ at: Date\.now\(\), result: candidates \}\)/);
    assert.match(routeSource, /catch \(error\)[\s\S]*dedupStore\.delete\(dedupKey\)[\s\S]*throw error/);
  });

  test('킬스위치는 mock을 우회하고 globalThis rate cap과 실제 신규 호출 로그가 있다', () => {
    assert.match(routeSource, /if \(!cfg\.enabled && !isMockMode\(\)\)/);
    assert.match(routeSource, /__anaksHeroImageBatchRateLimit__/);
    assert.match(routeSource, /globalThis as GlobalWithCandidateGuards/);
    assert.match(routeSource, /console\.info\(`\[hero-image-candidates\]/);
  });
});
