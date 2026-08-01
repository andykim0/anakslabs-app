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
    assert.match(motion, /실제 렌더러 티저/);
    assert.match(motion, /<SitePreview/);
    assert.doesNotMatch(motion, /boomerang-loop|slow-zoom|parallax-depth|@keyframes hvm-/);
  });

  test('대형 미리보기는 lazy overlay에서 실제 스크롤을 켜고 대표 영상의 출처를 표시한다', () => {
    assert.match(motion, /dynamic\([\s\S]*motion-immersive-preview[\s\S]*ssr: false/);
    assert.match(immersive, /<SitePreview[\s\S]*scroll[\s\S]*motion=\{!reducedMotion\}/);
    assert.match(immersive, /대표 데모 영상은 움직임 설명용이며 고객님의 최종 자산이 아닙니다/);
  });

  test('콘텐츠가 부족하면 복제·날조하지 않고 기본 모션을 권한다', () => {
    assert.match(motion, /부족한 카드·사진·과정을 임의로 복제하지 않습니다/);
    assert.match(motion, /현재 콘텐츠에는 기본 모션이 가장 완성도가 높아요/);
  });

  test('시그니처와 AI 영상 미디어를 분리하고 권한 우회를 약속하지 않는다', () => {
    assert.match(motion, /시그니처는 스크롤·레이아웃 경험이고, AI 영상은 별도 미디어/);
    assert.match(motion, /실제 생성은 관리자 승인·비용 상한·킬스위치 검사를 모두 통과한 뒤에만 1회 시작/);
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
