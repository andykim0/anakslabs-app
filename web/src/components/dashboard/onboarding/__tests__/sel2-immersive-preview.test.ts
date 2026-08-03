import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const choice = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
const overlay = source('src/components/dashboard/onboarding/motion-immersive-preview.tsx');

describe('SEL2 — production renderer 풀스크린 몰입 예시', () => {
  test('오버레이는 첫 open에만 lazy mount되고 body portal로 SitePreview transform 밖에 놓인다', () => {
    assert.match(choice, /const MotionImmersivePreview = dynamic/);
    assert.match(choice, /ssr: false/);
    assert.match(choice, /\{immersive \? \(/);
    assert.match(overlay, /createPortal\(/);
    assert.match(overlay, /document\.body/);
  });

  test('같은 config·signature id·production runtime으로 desktop/mobile을 체험한다', () => {
    assert.match(choice, /config=\{immersive\.preview\.config\}/);
    assert.match(choice, /spec=\{immersive\.spec\}/);
    assert.match(overlay, /key=\{`\$\{spec\.id\}:\$\{mode\}`\}/);
    assert.match(overlay, /mode=\{mode\}/);
    assert.match(overlay, /scroll/);
    assert.match(overlay, /motion=\{!reducedMotion\}/);
  });

  test('예시·모바일 fallback·대표 자산 고지와 키보드/cleanup 경계를 갖는다', () => {
    assert.match(overlay, /Example · actual production renderer/);
    assert.match(overlay, /spec\.mobileFallback/);
    assert.match(overlay, /not your final asset/);
    assert.match(overlay, /event\.key === 'Escape'/);
    assert.match(overlay, /document\.body\.style\.overflow = previousOverflow/);
    assert.match(overlay, /previousFocus\?\.focus\(\)/);
  });

  test('미리보기 open/close는 선택을 바꾸지 않고 confirm만 기존 선택 함수를 호출한다', () => {
    assert.match(choice, /onClick=\{\(\) => setPreviewingSignatureId/);
    assert.match(choice, /onConfirm=\{\(\) => \{[\s\S]*chooseSignature\(immersive\.spec\.id/);
    assert.doesNotMatch(overlay, /fetch\(|\/api\/|Veo|generateHeroVideo/);
  });

  test('영상 필수 연출도 정지 유지가 1클릭이고 제출 시 invalid signature를 저장하지 않는다', () => {
    assert.doesNotMatch(choice, /disabled=\{videoRequired\}/);
    assert.match(choice, /const submittedSignatureId = videoRequired && !video \? undefined : signatureId/);
    assert.match(choice, /Keep the approved image/);
  });
});
