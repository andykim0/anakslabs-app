import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  allPublishHumanChecksConfirmed,
  emptyPublishHumanChecks,
  missingPublishHumanChecks,
  PUBLISH_HUMAN_CHECKS,
} from '@/lib/publish/human-checks';
import { PUBLISH_PAYMENT_COPY } from '@/lib/pricing';

describe('발행 휴먼 3체크', () => {
  test('확정된 세 문구와 안정적인 id를 단일 레지스트리로 제공한다', () => {
    assert.deepEqual(PUBLISH_HUMAN_CHECKS, [
      { id: 'heroPhotoAuthentic', label: '대표 사진이 진짜인가' },
      { id: 'copyIsFactual', label: '문구가 사실인가' },
      {
        id: 'worthThePrice',
        label: `이 화면을 ${PUBLISH_PAYMENT_COPY.firstYear}에 발행할 만한가`,
      },
    ]);
  });

  test('정확한 boolean true 세 개가 모두 있어야 통과한다', () => {
    assert.equal(
      allPublishHumanChecksConfirmed({
        heroPhotoAuthentic: true,
        copyIsFactual: true,
        worthThePrice: true,
      }),
      true,
    );
    assert.equal(
      allPublishHumanChecksConfirmed({
        heroPhotoAuthentic: true,
        copyIsFactual: 'true',
        worthThePrice: 1,
      }),
      false,
    );
  });

  test('누락 id를 결정적인 레지스트리 순서로 반환하고 초기값은 전부 false다', () => {
    assert.deepEqual(emptyPublishHumanChecks(), {
      heroPhotoAuthentic: false,
      copyIsFactual: false,
      worthThePrice: false,
    });
    assert.deepEqual(missingPublishHumanChecks({ copyIsFactual: true }), [
      'heroPhotoAuthentic',
      'worthThePrice',
    ]);
    assert.deepEqual(missingPublishHumanChecks(null), [
      'heroPhotoAuthentic',
      'copyIsFactual',
      'worthThePrice',
    ]);
  });
});
