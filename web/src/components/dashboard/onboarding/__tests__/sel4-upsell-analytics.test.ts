import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const choice = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
const upsell = source('src/components/dashboard/onboarding/hero-motion-upsell-preview.tsx');
const immersive = source('src/components/dashboard/onboarding/motion-immersive-preview.tsx');
const analytics = source('src/lib/analytics/motion-upsell-funnel.ts');

describe('SEL4 — motion upsell funnel wiring', () => {
  test('실제 업셀 노출과 정지/모션 전환을 같은 signature ID로 계측한다', () => {
    assert.match(upsell, /action: 'upsell_impression'[\s\S]*signatureId/);
    assert.match(upsell, /action: 'preview_mode_toggle'[\s\S]*trigger: 'auto'/);
    assert.match(upsell, /action: 'preview_mode_toggle'[\s\S]*trigger: 'user'/);
    assert.match(choice, /signatureId=\{selected\.spec\.id\}/);
  });

  test('몰입 preview가 실제 mount된 뒤 open 이벤트를 한 번만 보낸다', () => {
    assert.match(immersive, /const openTracked = useRef\(false\)/);
    assert.match(immersive, /if \(!mounted\) return;[\s\S]*action: 'immersive_preview_open'/);
    assert.match(immersive, /signatureId: spec\.id/);
  });

  test('AI 영상 선택과 거절은 버튼 의사 표현 시점에 각각 기록된다', () => {
    assert.match(choice, /action: next \? 'addon_select' : 'addon_decline'/);
    assert.match(choice, /onClick=\{\(\) => chooseVideoPreference\(false\)\}/);
    assert.match(choice, /onClick=\{\(\) => chooseVideoPreference\(true\)\}/);
  });

  test('브라우저 fail-open sink뿐이며 backend·Veo·asset provenance 의존을 만들지 않는다', () => {
    assert.match(analytics, /new CustomEvent\(MOTION_UPSELL_CUSTOM_EVENT/);
    assert.match(analytics, /target\.dataLayer\.push/);
    assert.doesNotMatch(analytics, /fetch\(|\/api\/|supabase|video-pipeline|asset-provenance|heroImageUrl|businessName/);
    assert.doesNotMatch(`${choice}\n${upsell}\n${immersive}`, /analytics[^'"\n]*\/api\/|recordHeroVideoSelection/);
  });

  test('compact·loading·full demo가 모두 화면에 보이는 예시 라벨을 가진다', () => {
    assert.match(choice, />\s*Example · Actual renderer teaser · Click to experience\s*</);
    assert.match(choice, /Review entry, transitions, and completion using the actual renderer/);
    assert.match(upsell, />\s*Example · Comparing the same photo\s*</);
    assert.match(immersive, />\s*Example · actual production renderer\s*</);
  });
});
