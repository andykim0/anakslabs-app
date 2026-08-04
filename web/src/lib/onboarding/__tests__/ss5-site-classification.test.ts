import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { SCROLLYTELLING_MOTION_ID, isScrollytellingTemplate } from '@/lib/motion/scrollytelling';
import { sanitizeMotion } from '@/lib/motion/validate';
import {
  canonicalizeSurveyTemplate,
  preserveSiteClassification,
} from '@/lib/onboarding/site-classification';
import type { SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function survey(industry: string, templateId?: string): SurveyInput {
  const template = resolveTemplate('local_store', industry);
  return {
    businessName: '분류 경계 테스트',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry,
    tone: ['차분한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: templateId ?? template.id,
  };
}

function forgedStageConfig(): SiteConfig {
  const config = emptySiteConfig('분류 변조');
  config.meta = {
    ...config.meta,
    purposeId: 'company_brand',
    templateId: 'company_brand.default',
    locale: 'en-US',
    jurisdiction: 'US',
  };
  config.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    videoRequested: true,
    videoAddon: true,
    heroMotionId: SCROLLYTELLING_MOTION_ID,
  };
  config.pages[0].sections = [{
    id: 'forged-stage',
    type: 'hero',
    name: '위조 무대',
    height: 800,
    layout: 'scrollytelling',
    acts: [
      { heading: '첫 막', body: '고객 원문', band: [0, 0.34] },
      { heading: '둘째 막', body: '고객 소개', band: [0.34, 0.67] },
      { heading: '셋째 막', body: '고객 초대', band: [0.67, 1] },
    ],
    background: {
      image: { src: '/hero.webp' },
      video: { src: '/hero.mp4', poster: '/hero.webp' },
    },
    elements: [],
  }];
  return config;
}

describe('SS5 — 서버 권위 purpose/template 분류', () => {
  test('정상 템플릿은 서버 업종 분류를 확정하고, 카페가 보낸 fine-dining templateId는 서버 계산값으로 교정한다', () => {
    const normal = survey('카페·디저트');
    const classifiedNormal = canonicalizeSurveyTemplate(normal);
    assert.equal(classifiedNormal.industryClass, 'cafe');
    assert.equal(
      canonicalizeSurveyTemplate(classifiedNormal),
      classifiedNormal,
      '서버 분류가 이미 확정된 설문은 불필요하게 복제하지 않는다',
    );

    const forged = survey('카페·디저트', 'local_store.fine_dining');
    const canonical = canonicalizeSurveyTemplate(forged);
    assert.notEqual(canonical, forged);
    assert.equal(canonical.templateId, 'local_store.default');
    assert.equal(isScrollytellingTemplate(canonical.purposeId, canonical.templateId), false);

    const legitimate = canonicalizeSurveyTemplate(survey('파인다이닝·오마카세'));
    assert.equal(legitimate.templateId, 'local_store.fine_dining');
    assert.equal(isScrollytellingTemplate(legitimate.purposeId, legitimate.templateId), true);
  });

  test('에디터 PATCH는 저장된 카페 분류를 보존해 허용 메타+무대 변조를 canvas로 강등한다', () => {
    const persisted = emptySiteConfig('저장된 카페');
    persisted.meta = {
      ...persisted.meta,
      purposeId: 'local_store',
      templateId: 'local_store.default',
    };

    const classified = preserveSiteClassification(forgedStageConfig(), persisted);
    assert.equal(classified.meta.purposeId, 'local_store');
    assert.equal(classified.meta.templateId, 'local_store.default');

    const sanitized = sanitizeMotion(classified, 'premium');
    assert.equal(sanitized.config.motion?.heroMotionId, undefined);
    assert.equal(sanitized.config.pages[0].sections[0].layout, 'canvas');
    assert.match(sanitized.changes.join('\n'), /approved brand|purpose template not allowed/);
  });

  test('분류 없는 레거시 저장본은 PATCH 요청의 새 분류를 채택하지 않는다', () => {
    const legacy = emptySiteConfig('레거시');
    const classified = preserveSiteClassification(forgedStageConfig(), legacy);
    assert.equal(classified.meta.purposeId, undefined);
    assert.equal(classified.meta.templateId, undefined);
    assert.equal(classified.meta.locale, undefined);
    assert.equal(classified.meta.jurisdiction, undefined);
  });

  test('에디터 PATCH가 locale/jurisdiction을 생략해도 저장된 US 분류를 서버 권위로 복원한다', () => {
    const persisted = emptySiteConfig('Stored US classification');
    persisted.meta = {
      ...persisted.meta,
      locale: 'en-US',
      jurisdiction: 'US',
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
    };
    const submitted = emptySiteConfig('Client attempted classification deletion');
    const classified = preserveSiteClassification(submitted, persisted);
    assert.equal(classified.meta.locale, 'en-US');
    assert.equal(classified.meta.jurisdiction, 'US');
    assert.equal(classified.meta.purposeId, 'booking_service');
    assert.equal(classified.meta.templateId, 'booking_service.clinic');
    assert.equal(classified.meta.industryClass, 'medical');
    assert.equal(classified.meta.industryId, 'clinic');
  });

  test('generate/regenerate/PATCH가 sanitize 이전에 서버 권위 헬퍼를 호출한다', () => {
    for (const route of [
      'src/app/api/onboarding/generate/route.ts',
      'src/app/api/onboarding/regenerate/route.ts',
    ]) {
      const code = source(route);
      const canonical = code.indexOf('canonicalizeSurveyTemplate(body.data.survey');
      const generate = code.indexOf('buildZeroCostSiteConfig(');
      assert.ok(canonical >= 0 && canonical < generate, route);
      assert.doesNotMatch(code, /ai\.generateSiteConfig\(/);
    }

    const patch = source('src/app/api/sites/[siteId]/route.ts');
    const preserve = patch.indexOf('preserveSiteClassification(body.data.draftConfig');
    const assetRefs = patch.indexOf('validateConfigAssetRefsForSave({', preserve);
    const provenance = patch.indexOf('resolveStoredBeforeAfterMotionOptions({ config: assetValidated');
    const sanitize = patch.indexOf('const { config: sanitized, changes } = sanitizeMotion(');
    assert.ok(
      preserve >= 0 && preserve < assetRefs && assetRefs < provenance && provenance < sanitize,
      '저장 분류와 asset manifest를 권위화하고 민감 provenance를 재검증한 뒤 모션을 sanitize해야 한다',
    );

    const regenerate = source('src/app/api/onboarding/regenerate/route.ts');
    const pin = regenerate.indexOf('pinUsTenantLocaleForNewSite(');
    const contact = regenerate.indexOf('ensureUsBookingContactActions(');
    const connectors = regenerate.indexOf('applyConnectorManifest(withContactActions');
    assert.ok(pin >= 0 && pin < contact && contact < connectors);
  });
});
