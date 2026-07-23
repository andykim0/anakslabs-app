import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import type { DesignCandidate } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import {
  REFERENTIAL_IMAGE_POLICY_COPY,
  imageDirectionToLegacyCandidateStyle,
  recommendedImageDirection,
} from '@/lib/assets/image-directions';
import {
  DEFAULT_V2_IMAGE_DIRECTION,
  resolveV2ImageGenerationPlan,
} from '@/lib/ai/image-generation-policy';
import {
  buildHeroImageOptions,
  mockHeroImageUrl,
} from '@/lib/onboarding/hero-image-options';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import {
  STEP_REQUIRED_FIELDS,
  toFormDefaults,
} from '@/components/dashboard/onboarding/steps/shared';
import { surveyForEarlySitePlan } from '@/components/dashboard/onboarding/survey-step';

const source = (path: string) => readFileSync(path, 'utf8');

describe('SURVEY 이미지 수집 정책', () => {
  test('업로드 요청은 실제 제품·공간·인물·로고로 한정하고 무대 비주얼은 다보임 책임으로 고지한다', () => {
    assert.match(REFERENTIAL_IMAGE_POLICY_COPY.intro, /제품·공간·인물·로고/u);
    assert.match(REFERENTIAL_IMAGE_POLICY_COPY.intro, /배경·무드·애니메이션용 비주얼은 다보임이 준비/u);
    assert.match(REFERENTIAL_IMAGE_POLICY_COPY.intro, /업로드가 0장이어도 생성을 막지 않아요/u);

    const photos = source('src/components/dashboard/onboarding/steps/step04-photos.tsx');
    const imageStyle = source('src/components/dashboard/onboarding/steps/step05-image-style.tsx');
    const review = source('src/components/dashboard/onboarding/steps/step08-review.tsx');
    const hero = source('src/components/dashboard/onboarding/hero-image-step.tsx');
    for (const consumer of [photos, imageStyle, review]) {
      assert.match(consumer, /REFERENTIAL_IMAGE_POLICY_COPY/u);
    }
    assert.match(photos, /대표 실제 사진/u);
    assert.match(photos, /제품·공간·인물 사진/u);
    assert.match(hero, /사진을 요구하지 않아요/u);
    assert.match(hero, /다보임 준비/u);
    assert.doesNotMatch([photos, imageStyle, review, hero].join('\n'), /\b(?:fal|pexels)\b/iu);
  });

  test('gallery·team의 부재 안내는 referential 사진 경계를 분명히 한다', () => {
    const sitePlan = source('src/lib/content/site-plan.ts');
    const deepening = source('src/components/dashboard/onboarding/steps/step-conditional-deepening.tsx');
    assert.match(sitePlan, /gallery: '사용 권리를 확인한 실제 제품·공간·작업 사진/u);
    assert.match(sitePlan, /team: '구성원 경력·자격[\s\S]*실제 인물 사진만 사용/u);
    assert.match(deepening, /실제 인물 사진 올리기\(선택\)/u);
    assert.match(deepening, /사진이 없어도 경력·자격 정보 중심으로 구성/u);
  });

  test('업로드 0장 제출은 추상 무대로 결정적 완주하고 실사 주장 자산을 만들지 않는다', () => {
    const form = toFormDefaults(null, '무업로드 스튜디오');
    Object.assign(form, {
      purposeId: 'portfolio',
      industry: '디자인 포트폴리오',
      region: '서울',
      tone: ['차분한'],
      siteGoal: 'trust',
      targetCustomer: '작업 방향을 확인하려는 의뢰인',
      visitorNeed: '작업 방식과 문의 방법',
      valueProposition: '과장하지 않고 작업의 방향을 차분히 설명합니다.',
    });
    const survey = surveyForEarlySitePlan(form);
    assert.equal(survey.heroPhotoUrl, undefined);
    assert.deepEqual(survey.storePhotoUrls, []);
    assert.deepEqual(STEP_REQUIRED_FIELDS[6], [], '사진 단계는 제출 게이트가 아니다');

    const direction = recommendedImageDirection({ industry: survey.industry, tone: survey.tone });
    assert.equal(direction, DEFAULT_V2_IMAGE_DIRECTION);
    const visualPlan = resolveV2ImageGenerationPlan({
      direction,
      clientId: 'survey-zero-upload',
    });
    assert.deepEqual(visualPlan, {
      kind: 'generate_atmospheric_ai',
      direction: 'abstract_editorial',
      usesAi: true,
      role: 'atmospheric',
      subject: 'abstract',
    });

    const options = buildHeroImageOptions([], undefined, undefined, direction);
    assert.deepEqual(options.map((option) => option.url), [
      mockHeroImageUrl(0),
      mockHeroImageUrl(1),
      mockHeroImageUrl(2),
    ]);
    assert.ok(options.every((option) => option.source === 'ai'));

    const selected = options[0]!;
    const candidate: DesignCandidate = {
      id: 'zero-upload-candidate',
      label: '다보임 공급 추상 무대',
      description: '실제 제품·공간·인물을 주장하지 않는 추상 비주얼',
      style: imageDirectionToLegacyCandidateStyle(direction),
      imageDirectionId: direction,
      heroImageUrl: selected.url,
      theme: emptySiteConfig('무업로드 스튜디오').theme,
    };
    const config = buildSiteConfigFromSurvey(
      { ...survey, imageDirectionId: direction, imageStyle: candidate.style },
      candidate,
      { heroImageUrl: selected.url, imagePool: options.slice(1).map((option) => option.url) },
    );
    assert.ok(config.pages.some((page) => page.sections.some((section) => section.type === 'hero')));
    const sections = config.pages.flatMap((page) => page.sections);
    const renderedAssets = [
      ...sections.flatMap((section) => section.background.image?.src ? [section.background.image.src] : []),
      ...sections.flatMap((section) => section.elements)
        .flatMap((element) => element.kind === 'image' ? [element.src] : []),
    ];
    assert.ok(renderedAssets.length > 0);
    assert.equal(renderedAssets.some((url) => /interior-hwarodam|customer|upload/iu.test(url)), false);
  });
});
