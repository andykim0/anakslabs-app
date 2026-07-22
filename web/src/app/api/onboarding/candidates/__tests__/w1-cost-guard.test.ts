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
    assert.match(routeSource, /siteId:\s*z\.string\(\)\.min\(1\)\.optional\(\)/);
    assert.match(routeSource, /const HERO_CANDIDATE_LIMIT = 3/);
    assert.match(routeSource, /items\.slice\(0, HERO_CANDIDATE_LIMIT\)/);
  });

  test('검증 실사는 보존하고 예술 방향만 후보용 복사본에서 대표 사진을 제외한다', () => {
    const truthAt = routeSource.indexOf('verifySurveyAssetTruth({');
    const branchAt = routeSource.indexOf("verified.direction === 'real_photo'");
    const stripAt = routeSource.indexOf('surveyForHeroCandidates(verified.survey)');
    const callAt = routeSource.indexOf('ai.generateCandidates(');
    const trustedOwnerAt = routeSource.indexOf('{ clientId: client.id, ...(targetSiteId ? { siteId: targetSiteId } : {}) }', callAt);
    assert.ok(truthAt >= 0 && branchAt > truthAt && stripAt > branchAt && callAt > stripAt);
    assert.ok(trustedOwnerAt > callAt, '후보 AI에는 인증된 서버 clientId를 별도 소유자 컨텍스트로 전달한다');
    assert.doesNotMatch(routeSource, /delete\s+(?:body\.data\.)?survey\.heroPhotoUrl/);
  });

  test('캐시 조회가 킬스위치·rate 차감보다 먼저이고 client+pipeline+requestKey+survey 서명을 쓴다', () => {
    const cachedAt = routeSource.indexOf('const cached = dedupKey ? dedupStore.get(dedupKey)');
    const configAt = routeSource.indexOf('const cfg = heroImageGenConfig()');
    const rateAt = routeSource.indexOf('if (requiresAiMedia && rateLimited(client.id, cfg.maxBatchesPerClient))');
    assert.ok(cachedAt >= 0 && configAt > cachedAt && rateAt > configAt);
    assert.match(routeSource, /const designPipeline = dnaPipelineEnabled\(\) \? 'dna' : 'legacy'/);
    assert.match(routeSource, /`\$\{clientId\}:\$\{siteId \?\? 'new'\}:\$\{designPipeline\}:\$\{requestKey\}:\$\{surveySignature\(survey\)\}`/);
    assert.match(routeSource, /createHash\('sha256'\)/);
    assert.match(routeSource, /10 \* 60_000/);
  });

  test('진행 중 Promise와 완료 결과를 저장하며 실패 시 동일 캐시를 삭제한다', () => {
    assert.match(routeSource, /dedupStore\.set\(dedupKey, \{ at: Date\.now\(\), promise: generation \}\)/);
    assert.match(routeSource, /dedupStore\.set\(dedupKey, \{ at: Date\.now\(\), result: candidates \}\)/);
    assert.match(routeSource, /catch \(error\)[\s\S]*dedupStore\.delete\(dedupKey\)[\s\S]*throw error/);
  });

  test('진행 중 중복 요청도 자산 정책 실패를 동일한 422로 매핑한다', () => {
    const cachedAt = routeSource.indexOf('if (cached) {');
    const generationAt = routeSource.indexOf('const generation = getDataServices()');
    const cachedBlock = routeSource.slice(cachedAt, generationAt);
    assert.match(cachedBlock, /try\s*\{/);
    assert.match(cachedBlock, /dedupStore\.delete\(dedupKey\)/);
    assert.match(cachedBlock, /isAssetTruthGenerationError\(error\)/);
    assert.match(cachedBlock, /apiError\(error\.status, error\.code, error\.message/);
    assert.match(cachedBlock, /error instanceof CandidateAssetTruthError/);
  });

  test('v2 후보는 선택 전에 owner·canonical·direction을 서버 registry로 재검증한다', () => {
    const providerAt = routeSource.indexOf('ai.generateCandidates(');
    const validateAt = routeSource.indexOf('validateCandidateAssetRef({', providerAt);
    const responseAt = routeSource.indexOf('return NextResponse.json({ candidates })', validateAt);
    assert.ok(providerAt >= 0 && validateAt > providerAt && responseAt > validateAt);
    assert.match(routeSource, /const verifiedDirection = verified\.direction/);
    assert.match(routeSource, /if \(!verifiedDirection\) return limited/);
    assert.match(routeSource, /expectedImageDirectionId: verifiedDirection/);
    assert.match(routeSource, /allowedCustomerUploadAssetIds: verified\.directUploadAssetRefs\.map/);
    assert.match(routeSource, /error instanceof CandidateAssetTruthError/);
  });

  test('ASSIGN 전에는 모든 명시 v2 방향을 후보·rate·provider 전에 안정적으로 차단한다', () => {
    const truthAt = routeSource.indexOf('verifySurveyAssetTruth({');
    const rolloutAt = routeSource.indexOf("'ASSET_POLICY_V2_NOT_ACTIVE'");
    const cacheAt = routeSource.indexOf('const cached = dedupKey ?');
    const rateAt = routeSource.indexOf('rateLimited(client.id');
    const providerAt = routeSource.indexOf('ai.generateCandidates(');
    assert.ok(rolloutAt >= 0 && truthAt > rolloutAt);
    assert.ok(rolloutAt < cacheAt && rolloutAt < rateAt && rolloutAt < providerAt);
    assert.match(routeSource, /submittedSurvey\.imageDirectionId && !provenance\.assign/);
  });

  test('ASSIGN cohort는 누락 direction을 서버 기본 추상 방향으로 보정하고 site scope를 인증·dedup한다', () => {
    assert.match(routeSource, /provenance\.assign && !submittedSurvey\.imageDirectionId/);
    assert.match(routeSource, /imageDirectionId: DEFAULT_V2_IMAGE_DIRECTION/);
    assert.match(routeSource, /await getOwnedSite\(targetSiteId, client\.id\)/);
    assert.match(routeSource, /targetSiteId \? \{ targetSiteId \} : \{\}/);
    assert.match(routeSource, /candidateDedupKey\(client\.id, body\.data\.requestKey, survey, targetSiteId\)/);
  });

  test('킬스위치는 mock을 우회하고 globalThis rate cap과 실제 신규 호출 로그가 있다', () => {
    assert.match(routeSource, /if \(requiresAiMedia && !cfg\.enabled && !isMockMode\(\)\)/);
    assert.match(routeSource, /__anaksHeroImageBatchRateLimit__/);
    assert.match(routeSource, /globalThis as GlobalWithCandidateGuards/);
    assert.match(routeSource, /console\.info\(`\[hero-image-candidates\]/);
  });
});
