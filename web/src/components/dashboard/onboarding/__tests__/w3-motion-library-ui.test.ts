import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { motionChoiceForVideoPreference } from '@/components/dashboard/onboarding/motion-choice-step';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const motion = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
const immersive = source('src/components/dashboard/onboarding/motion-immersive-preview.tsx');
const api = source('src/components/dashboard/api.ts');
const generate = source('src/components/dashboard/onboarding/generate-step.tsx');

describe('W3/v2 — 시그니처 production 라이브러리 UI', () => {
  test('중앙 정책이 2~4개를 추천하고 승격된 production ID만 실제 config로 렌더한다', () => {
    assert.match(motion, /motionSignaturesForContext\(demoContext, \{ includeCandidates: false \}\)/);
    assert.match(motion, /isProductionMotionSignatureId\(spec\.id\)/);
    assert.match(motion, /buildMotionSignaturePreviewConfig/);
    assert.match(motion, /preview\.contentFit/);
  });

  test('모든 카드는 production SitePreview이며 레거시 약한 ID·CSS keyframe을 나열하지 않는다', () => {
    assert.match(motion, /Actual renderer teaser/);
    assert.match(motion, /<SitePreview/);
    assert.doesNotMatch(motion, /boomerang-loop|slow-zoom|parallax-depth|@keyframes hvm-/);
  });

  test('대형 미리보기는 lazy overlay에서 실제 스크롤을 켜고 대표 영상의 출처를 표시한다', () => {
    assert.match(motion, /dynamic\([\s\S]*motion-immersive-preview[\s\S]*ssr: false/);
    assert.match(immersive, /<SitePreview[\s\S]*scroll[\s\S]*motion=\{!reducedMotion\}/);
    assert.match(immersive, /Representative demo videos are for movement illustrative purposes only and are not your final assets/);
  });

  test('콘텐츠가 부족하면 복제·날조하지 않고 기본 모션을 권한다', () => {
    assert.match(motion, /do not duplicate or invent missing cards, photos, or process steps/);
    assert.match(motion, /Basic motion is the strongest fit for the available content/);
  });

  test('시그니처와 AI 영상 미디어를 분리하고 권한 우회를 약속하지 않는다', () => {
    assert.match(motion, /motion signature is a layout experience; AI video is separate media/);
    assert.match(motion, /Generation starts once, only after administrator approval and all cost-cap and kill-switch checks pass/);
  });

  test('예 경로만 등록된 heroMotionId를 저장하고 스킵은 이를 버린다', () => {
    assert.deepEqual(
      motionChoiceForVideoPreference(true, 'space-mood', 'parallax-depth'),
      {
        heroTechnique: 'video-hero',
        intensity: 'normal',
        videoConceptId: 'space-mood',
        heroMotionId: 'parallax-depth',
      },
    );
    assert.deepEqual(motionChoiceForVideoPreference(false, 'space-mood', 'parallax-depth'), {
      heroTechnique: 'ken-burns',
      intensity: 'subtle',
    });
  });

  test('DTO와 생성 idempotency intent가 signatureId·assetId를 분리한다', () => {
    assert.match(api, /heroMotionId\?: HeroVideoMotionId/);
    assert.match(generate, /motionChoice\?\.heroMotionId \?\? ''/);
    assert.match(api, /signatureId\?: ProductionMotionSignatureId/);
    assert.match(api, /beforeAfterSelection\?: BeforeAfterAssetSelection/);
    assert.match(generate, /motionChoice\?\.signatureId \?\? ''/);
  });

  test('라이브 프리뷰 컴포넌트는 AI·영상 API를 호출하지 않는다', () => {
    for (const banned of ['fetch(', '/api/sites/', 'generateVeoVideo', 'generateHeroVideo']) {
      assert.ok(!motion.includes(banned), `프리뷰에 금지된 호출: ${banned}`);
    }
  });
});
