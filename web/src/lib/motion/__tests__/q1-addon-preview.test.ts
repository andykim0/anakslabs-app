import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { resolveMotionPlan } from '@/lib/motion/apply';
import {
  ADDON_DEMO_POSTER,
  ADDON_DEMO_VIDEO,
  ADDON_DEMO_VIDEO_BYTES,
  configForAddonPreview,
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
    assert.match(preview, /예시 · 애드온\(\+₩/);
    assert.match(detail, /애드온 적용 예시/);
    assert.doesNotMatch(serving, /preview-addon|previewAsAddon|configForAddonPreview/);
    assert.doesNotMatch(exporter, /preview-addon|previewAsAddon|configForAddonPreview/);
  });

  test('온보딩 적용 예시는 명확한 라벨·고정 자산만 쓰고 생성 API를 호출하지 않는다', () => {
    const onboarding = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
    assert.match(onboarding, /애드온 적용 예시 보기/);
    assert.match(onboarding, /예시 · 애드온\(\+₩/);
    assert.match(onboarding, /고객님의 최종 영상이 아닙니다/);
    assert.match(onboarding, /daboim-visibility-film\.webm/);
    assert.doesNotMatch(onboarding, /fetch\(|\/api\/sites\/|generateVeoVideo|generateHeroVideo/);
  });
});
