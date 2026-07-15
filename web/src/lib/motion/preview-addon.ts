import type { Section, SiteConfig } from '@/lib/types/site';
import { SCROLLYTELLING_MOTION_ID } from './hero-video-motions';
import { hasValidScrollytellingActs, isScrollytellingTemplate } from './scrollytelling';

/**
 * 결제 전 애드온 예시에만 쓰는 다보임 데모 자산.
 * 실제 고객 발행물의 영상 URL이나 애드온 권한으로 저장하지 않는다.
 */
export const ADDON_DEMO_VIDEO = '/daboim-visibility-film-scrub.mp4';
export const ADDON_DEMO_POSTER = '/daboim-visibility-film-poster.webp';
export const ADDON_DEMO_VIDEO_BYTES = 6_950_435;

function previewHero(section: Section, config: SiteConfig): Section {
  const requestedManifesto =
    config.motion?.heroMotionId === SCROLLYTELLING_MOTION_ID &&
    isScrollytellingTemplate(config.meta.purposeId, config.meta.templateId) &&
    hasValidScrollytellingActs(section.acts);

  return {
    ...section,
    layout: requestedManifesto ? 'scrollytelling' : section.layout,
    background: {
      ...section.background,
      video: {
        src: ADDON_DEMO_VIDEO,
        poster: ADDON_DEMO_POSTER,
        bytes: ADDON_DEMO_VIDEO_BYTES,
      },
    },
  };
}

/**
 * 대시보드 화면에서만 애드온 연출을 합성하는 순수 projection.
 * false는 원본 identity까지 보존하고, true도 원본·tier·크레딧·발행 상태를 절대 변경하지 않는다.
 */
export function configForAddonPreview(config: SiteConfig, previewAsAddon: boolean): SiteConfig {
  if (!previewAsAddon) return config;

  let injected = false;
  const pages = config.pages.map((page) => {
    if (injected || page.slug !== '') return page;
    const sections = page.sections.map((section) => {
      if (injected || section.type !== 'hero') return section;
      injected = true;
      return previewHero(section, config);
    });
    return sections === page.sections ? page : { ...page, sections };
  });

  if (!injected) return config;
  return {
    ...config,
    pages,
    motion: {
      ...config.motion,
      presetId: 'cinematic-hero',
      intensity: config.motion?.intensity === 'off' ? 'normal' : (config.motion?.intensity ?? 'normal'),
      heroTechnique: 'video-hero',
      videoRequested: true,
      videoAddon: true,
    },
  };
}
