/**
 * [온보딩] 생성 중복 발화 가드 — sharedGenerate가 같은 intent 동시 발화를 실제 실행 1회로 합치고,
 * 세틀 후 재실행을 허용하며, intent별 idempotencyKey가 안정적인지.
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sharedGenerate, genIdemKey, __resetGenerateDedup } from '@/lib/onboarding/generate-dedup';

beforeEach(() => __resetGenerateDedup());

describe('sharedGenerate — in-flight dedup', () => {
  test('같은 intent 동시 발화 → 실제 실행 1회, 둘 다 같은 결과', async () => {
    let resolve!: (v: string) => void;
    const shared = new Promise<string>((r) => (resolve = r));
    let calls = 0;
    const run = () => {
      calls += 1;
      return shared;
    };

    const a = sharedGenerate('new::cand-x', run);
    const b = sharedGenerate('new::cand-x', run); // StrictMode 재발화 시뮬 (in-flight)
    assert.equal(calls, 1, '실제 실행이 1회로 dedup되어야');

    resolve('SITE-1');
    assert.equal(await a, 'SITE-1');
    assert.equal(await b, 'SITE-1');
  });

  test('세틀 후 재진입은 재실행 허용', async () => {
    let calls = 0;
    await sharedGenerate('new::cand-x', () => {
      calls += 1;
      return Promise.resolve('A');
    });
    await Promise.resolve(); // finally(세틀 시 해제) 실행 대기
    await sharedGenerate('new::cand-x', () => {
      calls += 1;
      return Promise.resolve('B');
    });
    assert.equal(calls, 2, '세틀 후엔 재실행되어야');
  });

  test('다른 intent는 별도 실행', async () => {
    let calls = 0;
    const run = () => {
      calls += 1;
      return Promise.resolve('X');
    };
    await Promise.all([sharedGenerate('new::a', run), sharedGenerate('siteA::a', run)]);
    assert.equal(calls, 2);
  });

  test('실패(reject)도 공유 — 둘 다 같은 에러, 세틀 후 재시도 가능', async () => {
    let calls = 0;
    const run = () => {
      calls += 1;
      return Promise.reject(new Error('BOOM'));
    };
    const a = sharedGenerate('new::e', run);
    const b = sharedGenerate('new::e', run);
    await assert.rejects(a, /BOOM/);
    await assert.rejects(b, /BOOM/);
    assert.equal(calls, 1);
    await Promise.resolve();
    await assert.rejects(sharedGenerate('new::e', run), /BOOM/); // 재시도 재실행
    assert.equal(calls, 2);
  });
});

describe('genIdemKey — intent별 안정 키', () => {
  test('같은 intent → 동일 키 (재마운트 시 안정)', () => {
    const k1 = genIdemKey('new::cand-x');
    const k2 = genIdemKey('new::cand-x');
    assert.equal(k1, k2);
  });
  test('다른 intent → 다른 키', () => {
    assert.notEqual(genIdemKey('new::a'), genIdemKey('new::b'));
  });
});
