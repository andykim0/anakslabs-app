import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import type { SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { resolveMotionPlan } from '@/lib/motion/apply';
import {
  ADDON_DEMO_POSTER,
  ADDON_DEMO_VIDEO,
  ADDON_DEMO_VIDEO_BYTES,
  configForAddonPreview,
  configForManifestoChoicePreview,
} from '@/lib/motion/preview-addon';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function basicConfig(): SiteConfig {
  const config = emptySiteConfig('애드온 예시');
  config.motion = {
    presetId: 'cafe-basic',
    intensity: 'normal',
    videoRequested: true,
    videoAddon: true,
  };
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '히어로',
    height: 760,
    background: { image: { src: '/customer-choice.webp' } },
    elements: [],
  }];
  return config;
}

describe('Q$1 — 권한을 부여하지 않는 애드온 데모 미리보기', () => {
  test('기본 off는 객체 identity와 기존 강등 결과를 그대로 보존한다', () => {
    const config = basicConfig();
    const result = configForAddonPreview(config, false);
    assert.equal(result, config);
    assert.equal(result.pages[0].sections[0].background.video, undefined);
    assert.equal(resolveMotionPlan(result).cinematicHeroSections.size, 0);
  });

  test('on은 화면용 복제본에만 고정 데모 영상과 시네마틱 프리셋을 합성한다', () => {
    const config = basicConfig();
    const before = structuredClone(config);
    const result = configForAddonPreview(config, true);
    const hero = result.pages[0].sections[0];

    assert.notEqual(result, config);
    assert.deepEqual(config, before, '원본 config를 변경하면 저장·발행 권한 누출이다');
    assert.deepEqual(hero.background.video, {
      src: ADDON_DEMO_VIDEO,
      poster: ADDON_DEMO_POSTER,
      bytes: ADDON_DEMO_VIDEO_BYTES,
    });
    assert.equal(result.motion?.presetId, 'cinematic-hero');
    assert.equal(result.motion?.heroTechnique, 'video-hero');
    assert.equal(resolveMotionPlan(result).cinematicHeroSections.has('hero'), true);
    assert.equal('tier' in result, false, 'preview projection이 entitlement를 만들면 안 된다');
  });

  test('preview 전용 모듈은 대시보드 렌더에서만 사용되고 serving·export에 들어가지 않는다', () => {
    const preview = source('src/components/dashboard/site-preview.tsx');
    const serving = source('src/app/s/[domain]/_shared.tsx');
    const exporter = source('src/lib/export/render-static.ts');
    const detail = source('src/components/dashboard/site-detail.tsx');

    assert.match(preview, /configForAddonPreview/);
    assert.match(preview, /예시 · AI 영상 홈페이지\(\+₩/);
    assert.match(detail, /애드온 적용 예시/);
    assert.doesNotMatch(serving, /preview-addon|previewAsAddon|configForAddonPreview/);
    assert.doesNotMatch(exporter, /preview-addon|previewAsAddon|configForAddonPreview/);
  });

  test('매니페스토 선택용 config는 고객 원문 막·선택 이미지를 보존하고 Q1 projection에서 실제 무대로 열린다', () => {
    const survey: SurveyInput = {
      businessName: '고객 브랜드',
      purposeId: 'company_brand',
      purpose: '회사·브랜드 소개',
      industry: '브랜드 스튜디오',
      tone: ['차분한'],
      colorPreference: '블루',
      referenceImageUrls: [],
      sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', source: 'user' }],
      templateId: 'company_brand.default',
      tagline: '고객이 입력한 첫 문장',
      highlights: ['고객이 입력한 12년'],
      siteGoal: 'trust',
    };
    const base = configForManifestoChoicePreview(survey, '/selected-source.webp');
    assert.ok(base);
    const baseHero = base.pages[0].sections[0];
    assert.equal(baseHero.background.image?.src, '/selected-source.webp');
    assert.ok(baseHero.acts?.some((act) => act.heading === '고객이 입력한 첫 문장'));

    const projected = configForAddonPreview(base, true);
    assert.equal(projected.pages[0].sections[0].background.video?.src, ADDON_DEMO_VIDEO);
    assert.deepEqual([...resolveMotionPlan(projected, { tier: 'premium' }).scrollytellingSections], [
      'manifesto-choice-preview',
    ]);

    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: projected,
      mode: 'desktop',
      interactive: true,
      animate: true,
      tier: 'premium',
    }));
    assert.equal((html.match(/data-ss-stage="true"/g) ?? []).length, 1);
    assert.equal((html.match(/data-ss-act="true"/g) ?? []).length, baseHero.acts?.length);
    assert.equal((html.match(/<video\b/g) ?? []).length, 1);
    assert.match(html, /daboim-visibility-film-scrub\.mp4/);
    assert.match(html, /고객이 입력한 첫 문장/);
  });

  test('온보딩 적용 예시는 실제 production renderer·명확한 라벨·고정 자산만 쓰고 생성 API를 호출하지 않는다', () => {
    const onboarding = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
    const projection = source('src/lib/motion/preview-config.ts');
    assert.match(onboarding, /buildMotionSignaturePreviewConfig/);
    assert.match(onboarding, /<SitePreview/);
    assert.match(onboarding, /실제 렌더러 티저/);
    assert.match(onboarding, /실제 스크롤 체험/);
    assert.match(onboarding, /고객 최종 자산 아님/);
    assert.match(onboarding, /예시는 최종 Veo 영상이 아닙니다/);
    assert.match(projection, /daboim-visibility-film-scrub\.mp4/);
    assert.match(projection, /daboim-visibility-film-poster\.webp/);
    assert.doesNotMatch(`${onboarding}\n${projection}`, /fetch\(|\/api\/sites\/|generateVeoVideo|generateHeroVideo/);
  });
});
