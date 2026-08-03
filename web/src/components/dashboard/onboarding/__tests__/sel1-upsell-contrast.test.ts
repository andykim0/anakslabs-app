import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { initialVideoPreference } from '@/components/dashboard/onboarding/motion-choice-step';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const choice = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
const preview = source('src/components/dashboard/onboarding/hero-motion-upsell-preview.tsx');

describe('SEL1 — 고객 선택 이미지의 정직한 정지→모션 대비', () => {
  test('첫 진입은 모션 선택이 기본이고 돌아온 사용자의 정지 선택은 복원한다', () => {
    assert.equal(initialVideoPreference(true, false), true);
    assert.equal(initialVideoPreference(true, false, { heroTechnique: 'ken-burns', intensity: 'subtle' }), false);
    assert.equal(initialVideoPreference(true, true, { heroTechnique: 'ken-burns', intensity: 'subtle' }), true);
    assert.equal(initialVideoPreference(false, false), false);
  });

  test('같은 선택 이미지 하나만 CSS transform으로 움직이며 2초 뒤 대비를 만든다', () => {
    assert.match(choice, /heroImageUrl=\{heroImageUrl\}/);
    assert.match(preview, /const STILL_HOLD_MS = 2_000/);
    assert.match(preview, /setMode\('motion'\)/);
    assert.match(preview, /scale: \[1, 1\.045, 1\.018\]/);
    assert.doesNotMatch(preview, /fetch\(|\/api\/|Veo|generate/i);
  });

  test('예시 라벨·정지 1클릭·reduced-motion 정지 경로가 명시돼 있다', () => {
    assert.match(preview, /Example · Comparing the same photo/);
    assert.match(choice, /Keep the approved image/);
    assert.match(preview, /useReducedMotion/);
    assert.match(preview, /disabled=\{reducedMotion\}/);
    assert.match(choice, /Generation starts once, only after administrator approval and all cost-cap and kill-switch checks pass/);
  });
});
