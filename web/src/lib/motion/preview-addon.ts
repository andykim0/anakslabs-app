import type { SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type Section, type SiteConfig } from '@/lib/types/site';
import { buildNarrativeArc } from '@/lib/data/narrative-arc';
import { SCROLLYTELLING_MOTION_ID } from './hero-video-motions';
import { hasValidScrollytellingActs, isScrollytellingTemplate } from './scrollytelling';

/**
 * 결제 전 애드온 예시에만 쓰는 Anaks Labs 데모 자산.
 * 실제 고객 발행물의 영상 URL이나 애드온 권한으로 저장하지 않는다.
 */
export const ADDON_DEMO_VIDEO = '/anakslabs-visibility-film-scrub.mp4';
export const ADDON_DEMO_POSTER = '/anakslabs-visibility-film-poster.webp';
export const ADDON_DEMO_VIDEO_BYTES = 6_950_435;

/**
 * 움직임 선택 화면에서 실제 ScrollytellingStage/runtime을 체험하기 위한 화면 전용 config.
 * 문구는 고객 설문에서 결정적으로 만든 막만 사용하고, 선택 이미지는 source 표식으로 보존한다.
 * 배경 영상은 configForAddonPreview/SitePreview가 고정 데모 자산을 주입하므로 저장·발행 대상이 아니다.
 */
export function configForManifestoChoicePreview(
  survey: SurveyInput,
  heroImageUrl: string,
): SiteConfig | null {
  if (!isScrollytellingTemplate(survey.purposeId, survey.templateId)) return null;
  const acts = buildNarrativeArc(survey);
  if (!hasValidScrollytellingActs(acts)) return null;

  const config = emptySiteConfig(`${survey.businessName} manifesto preview`);
  config.theme = {
    ...config.theme,
    palette: {
      background: '#07162f',
      surface: '#0b2042',
      text: '#ffffff',
      muted: '#b8c8e5',
      primary: '#2f72ff',
      accent: '#11c8bf',
    },
  };
  config.meta = {
    ...config.meta,
    purposeId: survey.purposeId,
    templateId: survey.templateId,
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
    id: 'manifesto-choice-preview',
    type: 'hero',
    name: 'Manifesto preview',
    height: 800,
    layout: 'scrollytelling',
    acts,
    background: {
      image: {
        src: heroImageUrl,
        overlayColor: '#07162f',
        overlayOpacity: 0.52,
      },
    },
    elements: [],
  }];
  return config;
}

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
