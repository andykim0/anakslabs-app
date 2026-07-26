import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildCandidateBlueprints,
  buildCandidateBlueprintsForPipeline,
} from '@/lib/data/design-candidates';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import {
  NAMED_TEMPLATE_CATALOG,
  NAMED_TEMPLATE_NO_UPLOAD_MIN,
  NAMED_TEMPLATE_RECOMMENDATION_MAX,
  candidateMatchesNamedTemplate,
  fingerprintDistance,
  namedTemplatesForSurvey,
  resolveNamedTemplate,
  templateGalleryEnabled,
} from '.';

function interiorSurvey(
  overrides: Partial<SurveyInput> = {},
): SurveyInput {
  const template = resolveTemplate('company_brand', '건설·인테리어 시공');
  return {
    businessName: '다온 공간',
    purposeId: 'company_brand',
    purpose: template.label,
    industry: '건설·인테리어 시공',
    tone: ['신뢰감 있는', '차분한'],
    colorPreference: '#7b6952',
    referenceImageUrls: [],
    referenceStyleIds: ['organic-natural'],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageDirectionId: 'abstract_editorial',
    highlights: [
      '공간의 목적을 먼저 듣습니다',
      '재료의 결을 차분히 살핍니다',
      '과정을 분명하게 안내합니다',
    ],
    contentItems: [
      { name: '주거 공간 설계', description: '고객이 입력한 실제 업무', photoUrl: '/fixtures/project-1.webp' },
      { name: '상업 공간 설계', description: '고객이 입력한 실제 업무', photoUrl: '/fixtures/project-2.webp' },
      { name: '현장 관리', description: '고객이 입력한 실제 업무', photoUrl: '/fixtures/project-3.webp' },
    ],
    contentDepth: {
      version: 2,
      facts: [{ key: 'phone', value: '02-1234-5678', source: 'customer' }],
      faqAnswers: [],
      imports: [],
      mainStorytelling: {
        version: 1,
        brandStory: '공간의 목적을 듣고 재료와 동선을 함께 살핍니다.',
      },
      surveyBrief: {
        version: 1,
        targetAudience: '새 공간을 준비하는 사업자',
        visitorIntent: '사업 분야와 진행 방식을 확인',
        valueProposition: '쓰임을 중심에 둔 공간',
        conversionDestination: { kind: 'phone_fact' },
      },
    },
    ...overrides,
  } as SurveyInput;
}

function verifiedPhotoSurvey(): SurveyInput {
  return interiorSurvey({
    imageDirectionId: 'real_photo',
    generalAssetAttestationId: 'attestation-template-gallery',
    heroPhotoUrl: '/fixtures/project-hero.webp',
    heroPhotoAssetRef: {
      assetId: 'asset-project-hero',
      url: '/fixtures/project-hero.webp',
    },
  });
}

describe('TPL T1 — 인테리어 명명 템플릿 카탈로그', () => {
  test('플래그는 정확히 1일 때만 신규 공급원을 연다', () => {
    assert.equal(templateGalleryEnabled({}), false);
    assert.equal(templateGalleryEnabled({ TEMPLATE_GALLERY_ENABLED: '' }), false);
    assert.equal(templateGalleryEnabled({ TEMPLATE_GALLERY_ENABLED: 'true' }), false);
    assert.equal(templateGalleryEnabled({ TEMPLATE_GALLERY_ENABLED: '1' }), true);
  });

  test('카탈로그는 자동 곱집합이 아닌 고유한 인테리어 24종만 보유한다', () => {
    assert.equal(NAMED_TEMPLATE_CATALOG.length, 24);
    assert.equal(new Set(NAMED_TEMPLATE_CATALOG.map(({ id }) => id)).size, 24);
    assert.equal(new Set(NAMED_TEMPLATE_CATALOG.map(({ name }) => name)).size, 24);
    for (const [index, template] of NAMED_TEMPLATE_CATALOG.entries()) {
      assert.equal(template.route.purposeId, 'company_brand');
      assert.deepEqual(template.route.exactIndustryIds, ['건설·인테리어 시공']);
      assert.equal(template.route.recommendationRank, index + 1);
      assert.match(template.previewImage, /^\/templates\/interior\/[a-z0-9-]+\.webp$/u);
    }
  });

  test('같은 추천 풀의 모든 전쌍은 구조 축이 둘 이상 달라 색만 다른 중복이 없다', () => {
    for (let left = 0; left < NAMED_TEMPLATE_CATALOG.length; left += 1) {
      for (let right = left + 1; right < NAMED_TEMPLATE_CATALOG.length; right += 1) {
        assert.ok(
          fingerprintDistance(
            NAMED_TEMPLATE_CATALOG[left],
            NAMED_TEMPLATE_CATALOG[right],
          ) >= 2,
          `${NAMED_TEMPLATE_CATALOG[left].id} and ${NAMED_TEMPLATE_CATALOG[right].id}`,
        );
      }
    }
  });

  test('무업로드 방향은 최소 3안, 실제 사진 방향은 검증된 업로드에서만 최대 6안을 낸다', () => {
    const abstract = namedTemplatesForSurvey(interiorSurvey());
    const threeDimensional = namedTemplatesForSurvey(
      interiorSurvey({ imageDirectionId: '3d_brand_world' }),
    );
    const unverifiedPhoto = namedTemplatesForSurvey(
      interiorSurvey({ imageDirectionId: 'real_photo' }),
    );
    const verifiedPhoto = namedTemplatesForSurvey(verifiedPhotoSurvey());

    assert.ok(abstract.length >= NAMED_TEMPLATE_NO_UPLOAD_MIN);
    assert.ok(threeDimensional.length >= NAMED_TEMPLATE_NO_UPLOAD_MIN);
    assert.ok(abstract.length <= NAMED_TEMPLATE_RECOMMENDATION_MAX);
    assert.ok(threeDimensional.length <= NAMED_TEMPLATE_RECOMMENDATION_MAX);
    assert.deepEqual(unverifiedPhoto, []);
    assert.equal(verifiedPhoto.length, NAMED_TEMPLATE_RECOMMENDATION_MAX);
  });

  test('정확한 목적·업종만 추천하고 레거시 36장 ID는 TPL 랭킹을 고정하지 않는다', () => {
    assert.deepEqual(
      namedTemplatesForSurvey(interiorSurvey({ industry: 'B2B 제조업' })),
      [],
    );
    const baseline = namedTemplatesForSurvey(interiorSurvey()).map(({ id }) => id);
    const withLegacyReference = namedTemplatesForSurvey(
      interiorSurvey({ referenceDesignId: 'local_store-01' }),
    ).map(({ id }) => id);
    assert.deepEqual(withLegacyReference, baseline);
  });

  test('무드는 추천 순서에, 고객·참고 사이트 색은 정규화 hue pin에만 반영된다', () => {
    const organic = namedTemplatesForSurvey(
      interiorSurvey({ referenceStyleIds: ['organic-natural'] }),
    ).map(({ id }) => id);
    const minimal = namedTemplatesForSurvey(
      interiorSurvey({ referenceStyleIds: ['minimal-swiss'] }),
    ).map(({ id }) => id);
    assert.notDeepEqual(minimal, organic);

    const template = NAMED_TEMPLATE_CATALOG[0];
    assert.equal(
      resolveNamedTemplate(template, interiorSurvey({ colorPreference: '#ff0000' }))
        ?.designDna.hueSeed,
      0,
    );
    assert.equal(
      resolveNamedTemplate(template, interiorSurvey({ colorPreference: '#00ff00' }))
        ?.designDna.hueSeed,
      120,
    );
  });

  test('OFF는 기존 blueprint와 바이트 동일하고 ON만 최대 6개 실제 핀을 발급한다', async () => {
    const survey = interiorSurvey();
    const legacy = buildCandidateBlueprints(survey);
    const off = await buildCandidateBlueprintsForPipeline(survey, {
      enabled: false,
      layoutEnabled: false,
      fontPairingEnabled: false,
      templateGalleryEnabled: false,
    });
    assert.equal(JSON.stringify(off), JSON.stringify(legacy));
    assert.ok(off.every((candidate) => candidate.namedTemplate === undefined));

    const on = await buildCandidateBlueprintsForPipeline(survey, {
      fontPairingEnabled: false,
      templateGalleryEnabled: true,
    });
    assert.equal(on.length, NAMED_TEMPLATE_RECOMMENDATION_MAX);
    assert.ok(on.every((candidate) => (
      candidate.namedTemplate
      && candidate.designDna
      && candidate.heroLayoutVariantId
      && candidate.recommendedMotionSignatureId
    )));
  });

  test('생성 경계는 templateId뿐 아니라 DNA·배열·모션 실제 핀을 서버 카탈로그와 재대조한다', async () => {
    const survey = interiorSurvey();
    const [blueprint] = await buildCandidateBlueprintsForPipeline(survey, {
      fontPairingEnabled: false,
      templateGalleryEnabled: true,
    });
    const candidate = {
      id: blueprint.id,
      label: blueprint.label,
      style: blueprint.style,
      imageDirectionId: blueprint.imageDirectionId,
      heroImageUrl: blueprint.mockHeroUrl,
      theme: blueprint.theme,
      description: blueprint.description,
      designDna: blueprint.designDna,
      heroLayoutVariantId: blueprint.heroLayoutVariantId,
      sectionLayoutVariantIds: blueprint.sectionLayoutVariantIds,
      namedTemplate: blueprint.namedTemplate,
      recommendedMotionSignatureId: blueprint.recommendedMotionSignatureId,
    } satisfies DesignCandidate;

    assert.equal(candidateMatchesNamedTemplate(candidate, survey), true);
    assert.equal(candidateMatchesNamedTemplate({
      ...candidate,
      recommendedMotionSignatureId: 'true-card-stack',
    }, survey), false);
    assert.equal(candidateMatchesNamedTemplate({
      ...candidate,
      namedTemplate: { catalogVersion: 1, templateId: 'unknown-template' },
    }, survey), false);
  });
});
