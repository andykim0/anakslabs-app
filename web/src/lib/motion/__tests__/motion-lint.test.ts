import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActiveMotionSignatureId } from '@/lib/types/site';
import {
  ACTIVE_SIGNATURE_CONTRACTS,
  SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY,
} from '@/lib/motion/signature-contract';
import {
  lintMotionMeasurement,
  motionContrastRatio,
  runMotionLintContractMatrix,
} from '@/lib/motion/motion-lint';

const ACTIVE: readonly ActiveMotionSignatureId[] = [
  'cinematic-scrub',
  'scrollytelling-manifesto',
  'true-card-stack',
  'scroll-curtain',
  'path-journey',
];

describe('MotionLint 텍스트-모션 비충돌 게이트', () => {
  test('active 5종 × 4국면 × 3 breakpoint의 실 resolver 출력이 선언 안전지대와 AA를 통과한다', () => {
    let checked = 0;
    for (const signatureId of ACTIVE) {
      const result = runMotionLintContractMatrix({
        signatureId,
        palette: { text: '#f7fbff', background: '#07111f', surface: '#10233c' },
        representativeContent: '긴 한글 제목과 본문도 선언된 안전지대 안에서 정적으로 읽힙니다.',
      });
      checked += result.checked;
      assert.deepEqual(result.violations, [], signatureId);
    }
    assert.equal(checked, 60);
  });

  test('위반 fixture는 bbox·AA·잘림·overflow·CLS·no-JS 누락을 모두 검출한다', () => {
    const violations = lintMotionMeasurement({
      signatureId: 'cinematic-scrub',
      phase: 'hold',
      breakpoint: 'wide',
      textBox: { x: 0.88, y: 0.88, width: 0.3, height: 0.3 },
      allowedZones: ACTIVE_SIGNATURE_CONTRACTS['cinematic-scrub'].textSafeZones.hold.wide,
      contrastRatio: 2.1,
      clipped: true,
      horizontalOverflow: 0.08,
      cls: 0.12,
      noJsText: ' ',
    });
    assert.deepEqual(violations.map((item) => item.code), [
      'text-outside-safe-zone',
      'contrast-below-aa',
      'text-clipped',
      'horizontal-overflow',
      'cls-budget-exceeded',
      'no-js-content-missing',
    ]);
  });

  test('같은 fixture를 안전지대·AA·정적 콘텐츠로 교정하면 위반 0이다', () => {
    const zone = SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY.mobile['start-lower'];
    assert.deepEqual(lintMotionMeasurement({
      signatureId: 'cinematic-scrub',
      phase: 'settle',
      breakpoint: 'mobile',
      textBox: zone,
      allowedZones: ['start-lower'],
      contrastRatio: motionContrastRatio('#f7fbff', '#07111f'),
      clipped: false,
      horizontalOverflow: 0,
      cls: 0,
      noJsText: '포스터와 전체 문장이 자바스크립트 없이 보입니다.',
    }), []);
  });
});
