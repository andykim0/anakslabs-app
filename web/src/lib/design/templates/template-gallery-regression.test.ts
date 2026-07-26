import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { SiteRenderer } from '@/components/site-renderer';
import { surveySchema } from '@/app/api/_lib/schemas';
import { imageDirectionToLegacyCandidateStyle } from '@/lib/assets/image-directions';
import {
  buildZeroCostCandidates,
  buildZeroCostSiteConfig,
} from '@/lib/billing/prepublish-cost-policy';
import {
  permittedTestimonials,
  testimonialExposurePolicyForSurvey,
} from '@/lib/content/testimonial-policy';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import {
  applyProceduralBackgroundDefaults,
} from '@/lib/abstract/application';
import {
  withContinuousCanvasDefault,
  withSiteCinematicDefault,
} from '@/lib/motion/site-cinematic';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import type {
  DesignCandidate,
  SurveyInput,
  SurveyProofInput,
} from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import {
  NAMED_TEMPLATE_CATALOG,
  resolveNamedTemplate,
} from '.';

const source = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const projectPhotos = [
  '/cases/demos/yeobaek-workshop/still-1.webp',
  '/cases/demos/yeobaek-workshop/still-2.webp',
  '/cases/demos/yeobaek-workshop/still-3.webp',
] as const;

function interiorSurvey(
  overrides: Partial<SurveyInput> = {},
): SurveyInput {
  const blueprint = resolveTemplate('company_brand', '건설·인테리어 시공');
  const contentItems = [
    { name: '주거 공간 설계', description: '고객이 입력한 실제 업무', photoUrl: projectPhotos[0] },
    { name: '상업 공간 설계', description: '고객이 입력한 실제 업무', photoUrl: projectPhotos[1] },
    { name: '업무 공간 설계', description: '고객이 입력한 실제 업무', photoUrl: projectPhotos[2] },
    { name: '현장 관리', description: '고객이 입력한 실제 업무', photoUrl: projectPhotos[0] },
  ];
  return {
    businessName: '다온 공간',
    purposeId: 'company_brand',
    purpose: blueprint.label,
    industry: '건설·인테리어 시공',
    tone: ['차분한', '신뢰감 있는'],
    colorPreference: '#7b6952',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(blueprint),
    pagePlan: pagePlanFromTemplate(blueprint),
    templateId: blueprint.id,
    imageDirectionId: 'abstract_editorial',
    highlights: ['쓰임을 먼저 듣습니다', '재료의 균형을 살핍니다', '과정을 분명하게 안내합니다'],
    contentItems,
    storePhotoUrls: [...projectPhotos],
    contentDepth: {
      version: 2,
      facts: [
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
        { key: 'address', value: '서울시 고객 확인 주소', source: 'customer' },
        { key: 'caseStudies', value: '고객이 직접 입력한 공간 프로젝트', source: 'customer' },
      ],
      faqAnswers: [],
      imports: [],
      mainStorytelling: {
        version: 1,
        brandStory: '공간의 목적을 듣고 재료와 동선을 함께 살핀다는 고객의 실제 이야기입니다.',
      },
      surveyBrief: {
        version: 1,
        targetCustomer: '새 공간을 준비하는 사업자',
        visitorNeed: '사업 분야와 진행 방식을 확인',
        valueProposition: '쓰임을 중심에 두는 태도',
        conversionDestination: { kind: 'phone_fact' },
      },
    },
    ...overrides,
  } as SurveyInput;
}

function surveyForTemplate(
  template: (typeof NAMED_TEMPLATE_CATALOG)[number],
): SurveyInput {
  const realPhoto = template.recipe.imageDirectionId === 'real_photo';
  return interiorSurvey({
    imageDirectionId: template.recipe.imageDirectionId,
    ...(realPhoto
      ? {
          generalAssetAttestationId: 'attestation-template-review',
          heroPhotoUrl: projectPhotos[0],
          heroPhotoAssetRef: {
            assetId: 'asset-template-review-hero',
            url: projectPhotos[0],
          },
        }
      : {}),
  });
}

function candidateForTemplate(
  template: (typeof NAMED_TEMPLATE_CATALOG)[number],
  survey: SurveyInput,
): DesignCandidate {
  const resolved = resolveNamedTemplate(template, survey);
  assert.ok(resolved, `${template.id}: representative input must satisfy its catalog contract`);
  const customerPhoto = template.recipe.imageDirectionId === 'real_photo';
  return {
    id: `tpl-${template.id}`,
    label: template.name,
    style: imageDirectionToLegacyCandidateStyle(template.recipe.imageDirectionId),
    imageDirectionId: template.recipe.imageDirectionId,
    heroImageUrl: customerPhoto ? projectPhotos[0] : template.previewImage,
    heroPresentation: customerPhoto ? 'promoted_customer_photo' : 'system',
    theme: tokenSetToSiteTheme(expandTokens(
      resolved.designDna.dnaId,
      resolved.designDna.hueSeed,
      resolved.designDna.overrides,
    )),
    description: template.description,
    designDna: resolved.designDna,
    heroLayoutVariantId: resolved.heroLayoutVariantId,
    sectionLayoutVariantIds: resolved.sectionLayoutVariantIds,
    namedTemplate: resolved.selection,
    recommendedMotionSignatureId: resolved.recommendedMotionSignatureId,
  };
}

function completeConfig(
  survey: SurveyInput,
  candidate: DesignCandidate,
): SiteConfig {
  const base = buildZeroCostSiteConfig(survey, candidate);
  const cinematic = withContinuousCanvasDefault(withSiteCinematicDefault(base));
  const atmosphere = applyProceduralBackgroundDefaults(cinematic);
  return applyGeneratedMotion(
    atmosphere,
    survey.purposeId,
    'premium',
    {
      intensity: 'subtle',
      heroTechnique: 'ken-burns',
      signatureId: candidate.recommendedMotionSignatureId,
    },
    survey,
  );
}

function render(config: SiteConfig): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  }));
}

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('TPL T3 — 24종 실제 생성·정직성', () => {
  test('24개 큐레이션 조합 모두 실제 SiteRenderer까지 완주하고 빈 사실 섹션을 만들지 않는다', () => {
    const renderedIds: string[] = [];
    for (const template of NAMED_TEMPLATE_CATALOG) {
      const survey = surveyForTemplate(template);
      const candidate = candidateForTemplate(template, survey);
      const config = completeConfig(survey, candidate);
      const html = render(config);
      const emptyFactual = config.pages.flatMap((page) => page.sections).filter(
        (section) => ['gallery', 'testimonials', 'cases'].includes(section.type)
          && section.elements.length === 0,
      );

      assert.deepEqual(emptyFactual, [], `${template.id}: empty factual section`);
      assert.match(html, /다온 공간/u, template.id);
      assert.match(html, /고객이 입력한 실제 업무|고객이 직접 입력한 공간 프로젝트/u, template.id);
      assert.doesNotMatch(html, /샘플 후기|가상의 고객|임의 실적/u, template.id);
      assert.equal(config.namedTemplate?.templateId, template.id);
      renderedIds.push(template.id);
    }
    assert.deepEqual(renderedIds, NAMED_TEMPLATE_CATALOG.map(({ id }) => id));
  });

  test('카탈로그는 24개 명시 레코드뿐이며 자동 조합 곱집합을 노출하지 않는다', () => {
    const catalog = source('src/lib/design/templates/catalog.ts');
    assert.equal((catalog.match(/\btemplate\(\{/gu) ?? []).length, 24);
    assert.doesNotMatch(catalog, /\.flatMap\(|flatMap\(\s*(?:dna|signature|layout)/u);
  });
});
describe('TPL T3 — ON/OFF·저장 핀 불변', () => {
  test('ON 설문은 referenceDesignId 없이 검증·6안 생성까지 완주한다', async () => {
    const survey = interiorSurvey({ referenceDesignId: undefined });
    assert.equal(surveySchema.safeParse(survey).success, true);
    const candidates = await buildZeroCostCandidates(survey, {
      templateGalleryEnabled: true,
    });
    assert.equal(candidates.length, 6);
    assert.ok(candidates.every((candidate) => candidate.namedTemplate));
  });

  test('OFF 후보·기존 config의 JSON과 HTML은 플래그 값과 무관하게 동일하다', async () => {
    const survey = interiorSurvey({ imageDirectionId: undefined });
    const offCandidates = await buildZeroCostCandidates(survey, {
      templateGalleryEnabled: false,
    });
    const config = buildZeroCostSiteConfig(survey, offCandidates[0]);
    const beforeEnv = process.env.TEMPLATE_GALLERY_ENABLED;
    try {
      process.env.TEMPLATE_GALLERY_ENABLED = '0';
      const off = { json: sha(JSON.stringify(config)), html: sha(render(config)) };
      process.env.TEMPLATE_GALLERY_ENABLED = '1';
      const on = { json: sha(JSON.stringify(config)), html: sha(render(config)) };
      assert.deepEqual(on, off);
      assert.equal(config.namedTemplate, undefined);
    } finally {
      if (beforeEnv === undefined) delete process.env.TEMPLATE_GALLERY_ENABLED;
      else process.env.TEMPLATE_GALLERY_ENABLED = beforeEnv;
    }
  });

  test('저장된 실제 핀이 있으면 플래그 OFF·카탈로그 메타 변경에도 렌더 SHA가 같다', () => {
    const template = NAMED_TEMPLATE_CATALOG[0];
    const survey = surveyForTemplate(template);
    const config = completeConfig(survey, candidateForTemplate(template, survey));
    const baseline = sha(render(config));
    const relabeledMetadata: SiteConfig = {
      ...config,
      namedTemplate: {
        catalogVersion: config.namedTemplate!.catalogVersion,
        templateId: 'future-catalog-label-only',
      },
    };
    const beforeEnv = process.env.TEMPLATE_GALLERY_ENABLED;
    try {
      process.env.TEMPLATE_GALLERY_ENABLED = '0';
      assert.equal(sha(render(config)), baseline);
      assert.equal(sha(render(relabeledMetadata)), baseline);
    } finally {
      if (beforeEnv === undefined) delete process.env.TEMPLATE_GALLERY_ENABLED;
      else process.env.TEMPLATE_GALLERY_ENABLED = beforeEnv;
    }
  });
});

describe('TPL T3 — 업종 권위 후기 가드', () => {
  const testimonial: SurveyProofInput = {
    kind: 'testimonial',
    content: '게시를 허락받은 고객의 실제 문장',
    sourceStatus: 'publication_permission',
    publisher: '고객 제공',
    asOfDate: '2026-07-26',
  };

  test('medical·legal 무드 DNA도 인테리어 업종에서는 후기를 차단하지 않는다', () => {
    for (const id of ['ordered-blueprint', 'quiet-proposal'] as const) {
      const template = NAMED_TEMPLATE_CATALOG.find((entry) => entry.id === id);
      assert.ok(template);
      assert.match(template.recipe.designDna.dnaId, /medical|legal/u);
      const survey = surveyForTemplate(template);
      survey.contentDepth!.surveyBrief!.proofs = [testimonial];
      assert.equal(testimonialExposurePolicyForSurvey(survey).allowed, true);
      assert.deepEqual(permittedTestimonials(survey), [testimonial]);
    }
  });

  test('실제 의료 업종은 같은 proof가 있어도 계속 fail-closed한다', () => {
    const blueprint = resolveTemplate('booking_service', '서울 마음 의원');
    const medical = interiorSurvey({
      purposeId: 'booking_service',
      purpose: blueprint.label,
      industry: '서울 마음 의원',
      templateId: blueprint.id,
      sectionPlan: planFromTemplate(blueprint),
      pagePlan: pagePlanFromTemplate(blueprint),
    });
    medical.contentDepth!.surveyBrief!.proofs = [testimonial];
    assert.equal(testimonialExposurePolicyForSurvey(medical).allowed, false);
    assert.deepEqual(permittedTestimonials(medical), []);
  });
});
