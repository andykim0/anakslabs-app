import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { motionChoiceForVideoPreference } from '@/components/dashboard/onboarding/motion-choice-step';
import { configForAddonPreview } from '@/lib/motion/preview-addon';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const SOURCES = {
  choice: source('src/components/dashboard/onboarding/motion-choice-step.tsx'),
  customerPhoto: source('src/components/dashboard/onboarding/hero-motion-upsell-preview.tsx'),
  immersive: source('src/components/dashboard/onboarding/motion-immersive-preview.tsx'),
  sectionReview: source('src/components/dashboard/onboarding/section-review-step.tsx'),
  sitePreview: source('src/components/dashboard/site-preview.tsx'),
  siteDetail: source('src/components/dashboard/site-detail.tsx'),
  previewMotion: source('src/components/site-renderer/use-preview-motion.ts'),
  runtime: source('src/lib/motion/runtime.ts'),
} as const;

function walkTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : walkTypeScriptFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function addonPreviewConfig(): SiteConfig {
  const config = emptySiteConfig('화면 전용 애드온 예시');
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 760,
    background: { image: { src: '/customer-selected-hero.webp' } },
    elements: [],
  }];
  return config;
}

describe('SEL5 — 애드온 데모 정직성·수명주기·비누출 불변식', () => {
  test('모든 고객 노출 데모 표면은 예시임을 명시한다', () => {
    const demoLabels = {
      compactProductionTeaser: {
        source: SOURCES.choice,
        label: /aria-label=\{`\$\{spec\.label\} 전체 화면 예시 열기`\}/,
      },
      customerPhotoComparator: {
        source: SOURCES.customerPhoto,
        label: /예시 · 같은 사진으로 비교 중/,
      },
      immersiveProductionRenderer: {
        source: SOURCES.immersive,
        label: /예시 · 실제 production renderer/,
      },
      addonProjectionBadge: {
        source: SOURCES.sitePreview,
        label: /예시 · AI 영상 홈페이지\(\+₩/,
      },
      sectionReviewProjection: {
        source: SOURCES.sectionReview,
        label: /고른 영상 연출의 실제 스크롤 예시예요/,
      },
      dashboardAddonToggle: {
        source: SOURCES.siteDetail,
        label: /애드온 적용 예시/,
      },
    } as const;

    for (const [name, fixture] of Object.entries(demoLabels)) {
      assert.match(fixture.source, fixture.label, `${name}에서 예시 고지가 사라졌다`);
    }
    assert.match(SOURCES.choice, /예시는 최종 Veo 영상이 아닙니다/);
    assert.match(SOURCES.immersive, /고객님의 최종 자산이 아닙니다/);
  });

  test('고객 사진 비교 데모는 같은 사진에 transform만 적용하고 생성·영상 경로를 호출하지 않는다', () => {
    assert.match(SOURCES.choice, /heroImageUrl=\{heroImageUrl\}/);
    assert.match(SOURCES.customerPhoto, /<motion\.img[\s\S]*src=\{heroImageUrl\}/);
    assert.match(SOURCES.customerPhoto, /scale: \[1, 1\.045, 1\.018\]/);
    assert.match(SOURCES.customerPhoto, /x: \['0%', '-1\.2%', '0\.45%'\]/);
    assert.match(SOURCES.customerPhoto, /y: \['0%', '-0\.8%', '0\.25%'\]/);
    assert.doesNotMatch(
      SOURCES.customerPhoto,
      /fetch\s*\(|\/api\/|generateHeroVideo|generateVeo|video-pipeline|veo-|<video\b|<canvas\b|currentTime|srcObject/i,
    );
  });

  test('정지 유지 선택은 한 번의 클릭으로 영상 필드를 제거한 기본 모션 DTO를 만든다', () => {
    assert.match(
      SOURCES.choice,
      /onClick=\{\(\) => chooseVideoPreference\(false\)\}[\s\S]{0,500}정지 화면으로 유지하기/,
    );
    assert.doesNotMatch(SOURCES.choice, /disabled=\{videoRequired\}/);

    const declined = motionChoiceForVideoPreference(
      false,
      'space-mood',
      'cinematic-scrub',
      'cinematic-scrub',
    );
    assert.deepEqual(declined, {
      heroTechnique: 'ken-burns',
      intensity: 'subtle',
      signatureId: 'cinematic-scrub',
    });
    assert.equal('videoConceptId' in declined, false);
    assert.equal('heroMotionId' in declined, false);
    assert.equal('videoAddon' in declined, false);
  });

  test('reduced-motion은 비교 자동전환과 production runtime의 video autoplay보다 먼저 차단된다', () => {
    const reducedGuard = SOURCES.customerPhoto.indexOf('if (reducedMotion || userSelected.current) return;');
    const autoTimer = SOURCES.customerPhoto.indexOf('window.setTimeout');
    assert.ok(reducedGuard >= 0 && reducedGuard < autoTimer, 'reduced-motion guard가 자동전환보다 먼저여야 한다');
    assert.match(SOURCES.customerPhoto, /const effectiveMode: UpsellPreviewMode = reducedMotion \? 'still' : mode/);
    assert.match(SOURCES.customerPhoto, /const moving = effectiveMode === 'motion'/);
    assert.match(SOURCES.customerPhoto, /disabled=\{reducedMotion\}/);
    assert.doesNotMatch(SOURCES.customerPhoto, /autoPlay|autoplay/);
    assert.match(SOURCES.immersive, /motion=\{!reducedMotion\}/);

    const runtimeReducedGuard = SOURCES.runtime.indexOf(
      "if(mm && mm.matches){ roots.forEach(markStatic); return; }",
    );
    const runtimeAutoplay = SOURCES.runtime.indexOf('v.autoplay=true');
    assert.ok(
      runtimeReducedGuard >= 0 && runtimeReducedGuard < runtimeAutoplay,
      'production runtime은 reduced-motion에서 video 초기화 전에 정적 경로로 반환해야 한다',
    );
  });

  test('몰입 오버레이는 open 때만 lazy mount되고 unmount 시 소유한 listener·focus·scroll lock을 정리한다', () => {
    assert.match(SOURCES.choice, /const MotionImmersivePreview = dynamic/);
    assert.match(SOURCES.choice, /ssr: false/);
    assert.match(SOURCES.choice, /\{immersive \? \([\s\S]*<MotionImmersivePreview/);
    assert.match(SOURCES.immersive, /if \(!mounted\) return null/);
    assert.match(SOURCES.immersive, /createPortal\([\s\S]*document\.body/);

    assert.match(SOURCES.immersive, /window\.removeEventListener\('resize', updateViewport\)/);
    assert.match(SOURCES.immersive, /window\.removeEventListener\('keydown', onKeyDown\)/);
    assert.match(SOURCES.immersive, /__anaksMotionDispose\?\.\(\)/);
    assert.match(SOURCES.immersive, /document\.body\.style\.overflow = previousOverflow/);
    assert.match(SOURCES.immersive, /previousFocus\?\.focus\(\)/);
    assert.match(SOURCES.previewMotion, /return \(\) => \{[\s\S]*window\.cancelAnimationFrame\(raf\);[\s\S]*window\.clearTimeout\(sweep\)/);
    assert.match(SOURCES.immersive, /mode !== 'mobile' \|\| reducedMotion\) return/);
    assert.match(SOURCES.immersive, /data-site-preview-scroll[\s\S]*scrollBy[\s\S]*behavior: 'smooth'/);
    assert.match(SOURCES.immersive, /removeEventListener\('pointerdown', stopAutoProgress\)[\s\S]*removeEventListener\('touchstart', stopAutoProgress\)[\s\S]*removeEventListener\('wheel', stopAutoProgress\)/);
  });

  test('previewAsAddon은 순수 화면 projection이며 저장·API·서빙·export 계약으로 누출되지 않는다', () => {
    const config = addonPreviewConfig();
    const before = structuredClone(config);
    assert.equal(configForAddonPreview(config, false), config);

    const projected = configForAddonPreview(config, true);
    assert.notEqual(projected, config);
    assert.deepEqual(config, before, '화면 projection이 입력 SiteConfig를 변경했다');
    assert.equal(projected.pages[0].sections[0].background.video?.src, '/daboim-visibility-film-scrub.mp4');
    assert.equal(config.pages[0].sections[0].background.video, undefined);

    const allowedFiles = new Set([
      'src/components/dashboard/onboarding/motion-choice-step.tsx',
      'src/components/dashboard/onboarding/motion-immersive-preview.tsx',
      'src/components/dashboard/onboarding/section-review-step.tsx',
      'src/components/dashboard/site-detail.tsx',
      'src/components/dashboard/site-preview.tsx',
      'src/lib/motion/preview-addon.ts',
    ]);
    const leaks = walkTypeScriptFiles(join(process.cwd(), 'src'))
      .filter((path) => readFileSync(path, 'utf8').includes('previewAsAddon'))
      .map((path) => relative(process.cwd(), path))
      .filter((path) => !allowedFiles.has(path));

    assert.deepEqual(leaks, [], `previewAsAddon이 화면 경계 밖으로 누출됐다: ${leaks.join(', ')}`);
    assert.doesNotMatch(source('src/app/s/[domain]/_shared.tsx'), /previewAsAddon|configForAddonPreview|preview-addon/);
    assert.doesNotMatch(source('src/lib/export/render-static.ts'), /previewAsAddon|configForAddonPreview|preview-addon/);
    assert.doesNotMatch(source('src/app/api/_lib/schemas.ts'), /previewAsAddon/);
    assert.doesNotMatch(source('src/components/dashboard/api.ts'), /previewAsAddon/);
    assert.doesNotMatch(source('src/lib/types/site.ts'), /previewAsAddon/);
    assert.doesNotMatch(source('src/lib/types/domain.ts'), /previewAsAddon/);
  });
});
