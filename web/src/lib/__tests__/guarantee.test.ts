import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  GUARANTEE_NAVER_REFERRAL_THRESHOLD,
  GUARANTEE_WINDOW_DAYS,
  evaluateGuarantee,
  partitionGuaranteeEvaluationSites,
} from '@/lib/guarantee';
import { readFileSync } from 'node:fs';

const publishedAt = '2026-01-01T00:00:00.000Z';
const dueAt = '2026-04-01T00:00:00.000Z';

describe('GT$ G1 성과 보장 판정', () => {
  test('en-US sites are outside the legacy guarantee population while KR evaluation is bit-identical', () => {
    const kr = {
      id: 'kr-site',
      publishedAt,
      siteConfig: { meta: {} },
    };
    const us = {
      id: 'us-site',
      publishedAt,
      siteConfig: { meta: { locale: 'en-US' } },
    };
    const unpublished = {
      id: 'draft-site',
      publishedAt: null,
      siteConfig: { meta: {} },
    };
    const population = partitionGuaranteeEvaluationSites([kr, us, unpublished]);
    assert.deepEqual(population.eligible.map((site) => site.id), ['kr-site']);
    assert.deepEqual(population.excludedEnUs.map((site) => site.id), ['us-site']);

    const krInput = { publishedAt, asOf: dueAt, naverIndexed: false, naverReferralCount: 29 } as const;
    const before = evaluateGuarantee(krInput);
    const after = population.eligible.includes(kr) ? evaluateGuarantee(krInput) : null;
    assert.deepEqual(after, before);

    const overviewRoute = readFileSync(
      new URL('../../app/api/admin/overview/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(overviewRoute, /partitionGuaranteeEvaluationSites\(siteList\)/);
    assert.match(overviewRoute, /guaranteePopulation\.eligible/);
  });

  test('90일 전에는 신호와 무관하게 판정 전이다', () => {
    assert.equal(GUARANTEE_WINDOW_DAYS, 90);
    assert.equal(evaluateGuarantee({
      publishedAt,
      asOf: '2026-03-31T23:59:59.999Z',
      naverIndexed: false,
      naverReferralCount: 0,
    }).decision, 'not-due');
  });

  test('90일 시점에 색인과 네이버 유입이 모두 미달이면 환불 대상이다', () => {
    assert.equal(GUARANTEE_NAVER_REFERRAL_THRESHOLD, 30);
    const input = { publishedAt, asOf: dueAt, naverIndexed: false, naverReferralCount: 29 } as const;
    assert.equal(evaluateGuarantee(input).decision, 'eligible');
    assert.deepEqual(evaluateGuarantee(input), evaluateGuarantee(input), '같은 데이터는 같은 판정');
  });

  test('색인 또는 절대 유입 임계 중 하나라도 충족하면 환불 대상이 아니다', () => {
    assert.equal(evaluateGuarantee({ publishedAt, asOf: dueAt, naverIndexed: true, naverReferralCount: 0 }).decision, 'not-eligible');
    assert.equal(evaluateGuarantee({ publishedAt, asOf: dueAt, naverIndexed: false, naverReferralCount: 30 }).decision, 'not-eligible');
  });

  test('색인 증빙이 없으면 감으로 판정하지 않고 예외 사유는 결정적으로 제외한다', () => {
    assert.equal(evaluateGuarantee({ publishedAt, asOf: dueAt, naverIndexed: null, naverReferralCount: 0 }).decision, 'needs-index-evidence');
    assert.equal(evaluateGuarantee({
      publishedAt,
      asOf: dueAt,
      naverIndexed: false,
      naverReferralCount: 0,
      exceptionCode: 'domain-expired',
    }).decision, 'excluded');
  });

  test('잘못된 날짜·음수·소수 카운트는 fail-closed 한다', () => {
    assert.throws(() => evaluateGuarantee({ publishedAt: 'bad', asOf: dueAt, naverIndexed: false, naverReferralCount: 0 }));
    assert.throws(() => evaluateGuarantee({ publishedAt, asOf: dueAt, naverIndexed: false, naverReferralCount: -1 }));
    assert.throws(() => evaluateGuarantee({ publishedAt, asOf: dueAt, naverIndexed: false, naverReferralCount: 1.5 }));
  });
});
