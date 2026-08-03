import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { applyHeroVideoToConfig, buildMotionPrompt, heroVideoContext } from '@/lib/ai/video-pipeline-core';
import { resolveMotionPlan } from '@/lib/motion/apply';
import {
  HERO_VIDEO_MOTION_IDS,
  HERO_VIDEO_MOTIONS,
  heroVideoMotionIdsForContext,
} from '@/lib/motion/hero-video-motions';
import { COMPOSITE_SIGNATURES, MOTION_LIMITS, countMotionSignatures } from '@/lib/motion/registry';
import {
  SCROLLYTELLING_MOTION_ID,
  SCROLLYTELLING_TEMPLATE_POLICY,
  canRenderScrollytellingSection,
  isScrollytellingTemplate,
} from '@/lib/motion/scrollytelling';
import { sanitizeMotion } from '@/lib/motion/validate';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function requestedConfig(): SiteConfig {
  const config = emptySiteConfig('승인 수명주기');
  config.meta = {
    ...config.meta,
    purposeId: 'company_brand',
    templateId: 'company_brand.default',
  };
  config.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    heroImageChoice: 'upload',
    videoRequested: true,
    videoAddon: true,
    heroMotionId: SCROLLYTELLING_MOTION_ID,
  };
  config.pages[0].sections = [{
    id: 'stage', type: 'hero', name: '브랜드 서사', height: 800,
    layout: 'scrollytelling',
    acts: [
      { heading: '분위기', body: '고객의 태그라인', band: [0, 0.25] },
      { heading: '정체성', body: '고객의 소개', band: [0.25, 0.5] },
      { heading: '10년', body: '고객의 실적', kind: 'stat', band: [0.5, 0.75] },
      { heading: '초대', body: '문의하기', band: [0.75, 1] },
    ],
    background: { image: { src: '/uploaded-hero.webp' } },
    elements: [],
  }];
  return config;
}

describe('SS5 — W 모션 라이브러리 절제 게이트', () => {
  test('매니페스토를 다섯 번째 등록 연출로 두되 허용 템플릿에서만 노출한다', () => {
    assert.equal(HERO_VIDEO_MOTION_IDS.includes(SCROLLYTELLING_MOTION_ID), true);
    assert.equal(HERO_VIDEO_MOTIONS[SCROLLYTELLING_MOTION_ID].label, '매니페스토 (페이지 관통)');
    assert.equal(heroVideoMotionIdsForContext(false).includes(SCROLLYTELLING_MOTION_ID), false);
    assert.equal(heroVideoMotionIdsForContext(true).includes(SCROLLYTELLING_MOTION_ID), true);
    for (const entry of SCROLLYTELLING_TEMPLATE_POLICY) {
      assert.equal(isScrollytellingTemplate(entry.purposeId, entry.templateId), true);
    }
    assert.equal(isScrollytellingTemplate('local_store', 'local_store.default'), false, '카페/일반 매장 자동 적용 금지');
    assert.equal(isScrollytellingTemplate('booking_service', 'booking_service.clinic'), false, '병원 자동 적용 금지');
  });

  test('온보딩은 중앙 eligibility와 production renderer 대표 예시만 사용한다', () => {
    const motion = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
    const wizard = source('src/components/dashboard/onboarding/wizard.tsx');
    assert.match(wizard, /<MotionChoiceStep[\s\S]*templateId=\{survey\.templateId\}/);
    assert.match(motion, /motionContextFromSurvey\(survey, 'premium'/);
    assert.match(motion, /motionSignaturesForContext\(demoContext/);
    assert.match(motion, /buildMotionSignaturePreviewConfig/);
    assert.match(motion, /<SitePreview/);
    assert.match(motion, /Actual renderer teaser/);
    assert.match(motion, /Experience the scroll behavior full screen/);
    assert.doesNotMatch(motion, /@keyframes|CSS 대표 예시예요/);
    assert.doesNotMatch(motion, /fetch\(|generateVeoVideo|generateHeroVideo/);
  });

  test('시네마틱 합성의 레이아웃 변형이라 페이지 시그니처는 여전히 1개다', () => {
    const composite = COMPOSITE_SIGNATURES['cinematic-hero'];
    assert.equal(countMotionSignatures(composite.techniques, 'cinematic-hero'), 1);
    assert.ok(1 <= MOTION_LIMITS.maxSignaturePerPage);
  });

  test('선택한 매니페스토 방향은 기존 피사체 안전 Veo 프롬프트 경로만 탄다', () => {
    const context = heroVideoContext(requestedConfig());
    assert.ok(context);
    assert.ok(context.povMood.includes(HERO_VIDEO_MOTIONS[SCROLLYTELLING_MOTION_ID].promptSeed));
    const prompt = buildMotionPrompt(context.povMood, context.source);
    assert.match(prompt, /ANAKSLABS_REGISTERED_MOTION_V1/);
    assert.match(prompt, /camera drift|composition|depth|loop/i);
    assert.match(prompt, /Do NOT depict a specific finished dish, product, or service result/);
    assert.doesNotMatch(HERO_VIDEO_MOTIONS[SCROLLYTELLING_MOTION_ID].promptSeed, /\b(?:dish|meal|steak|product|service result)\b/i);
  });
});

describe('SS5 — 요청→정적 강등→관리자 승인→무대 복원', () => {
  test('basic은 acts·의도를 보존하고, 승인 영상 적용 뒤 premium 무대로 복원한다', () => {
    const requested = requestedConfig();
    const basic = sanitizeMotion(requested, 'basic').config;
    const basicHero = basic.pages[0].sections[0];
    assert.equal(basicHero.layout, 'canvas');
    assert.deepEqual(basicHero.acts, requested.pages[0].sections[0].acts);
    assert.equal(basic.motion?.heroMotionId, SCROLLYTELLING_MOTION_ID);
    assert.equal(basicHero.background.video, undefined);

    const approved = applyHeroVideoToConfig(basic, '/approved.mp4', '/approved-poster.webp');
    const approvedHero = approved.pages[0].sections[0];
    assert.equal(approvedHero.layout, 'scrollytelling');
    assert.deepEqual(approvedHero.background.video, {
      src: '/approved.mp4', poster: '/approved-poster.webp',
    });

    const premium = sanitizeMotion(approved, 'premium').config;
    const premiumHero = premium.pages[0].sections[0];
    assert.equal(canRenderScrollytellingSection(premium, premiumHero, 'premium'), true);
    const plan = resolveMotionPlan(premium, { tier: 'premium' });
    assert.deepEqual([...plan.scrollytellingSections], ['stage']);
    assert.equal(plan.cinematicHeroSections.size, 0);

    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: premium, mode: 'auto', interactive: true, animate: true, tier: 'premium',
    }));
    assert.equal((html.match(/data-ss-stage="true"/g) ?? []).length, 1);
    assert.equal((html.match(/<video\b/g) ?? []).length, 1);
  });

  test('비허용 템플릿과 명시 선택 없는 forged layout은 fail-closed canvas다', () => {
    const cafe = requestedConfig();
    cafe.meta = { ...cafe.meta, purposeId: 'local_store', templateId: 'local_store.default' };
    const denied = sanitizeMotion(cafe, 'premium');
    assert.equal(denied.config.motion?.heroMotionId, undefined);
    assert.equal(denied.config.pages[0].sections[0].layout, 'canvas');
    assert.match(denied.changes.join('\n'), /허용된 브랜드|허용되지 않은 목적/);

    const forged = requestedConfig();
    forged.motion!.heroMotionId = 'slow-zoom';
    const closed = sanitizeMotion(forged, 'premium');
    assert.equal(closed.config.pages[0].sections[0].layout, 'canvas');
    assert.match(closed.changes.join('\n'), /명시 선택 없음/);
  });
});
