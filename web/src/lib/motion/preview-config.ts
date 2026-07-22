import type { DesignCandidate, SurveyInput, Tier } from '@/lib/types/domain';
import type { ProductionMotionSignatureId, SiteConfig } from '@/lib/types/site';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { applyGeneratedMotion } from './validate';
import { withSiteCinematicDefault } from './site-cinematic';

const DEMO_VIDEO = '/daboim-visibility-film-scrub.mp4';
const DEMO_POSTER = '/daboim-visibility-film-poster.webp';

export interface MotionPreviewResult {
  config: SiteConfig;
  /** false면 고객 콘텐츠가 이 연출의 최소 계약을 충족하지 못한 것이다. */
  contentFit: boolean;
  usesRepresentativeMedia: boolean;
}

/**
 * 온보딩 전용 projection. 고객 팔레트·타이포·실제 입력 콘텐츠로 production SiteConfig를
 * 만들고 동일 scene builder/sanitizer/renderer를 탄다. 결과는 저장하지 않는다.
 */
export function buildMotionSignaturePreviewConfig(
  survey: SurveyInput,
  candidate: DesignCandidate,
  heroImageUrl: string,
  signatureId: Exclude<ProductionMotionSignatureId, 'before-after-scrub'>,
  tier: Tier,
): MotionPreviewResult {
  const mediaPool = [
    ...(survey.storePhotoUrls ?? []),
    ...((survey.contentItems ?? []).map((item) => item.photoUrl).filter((src): src is string => Boolean(src))),
  ].filter((src, index, all) => src !== heroImageUrl && all.indexOf(src) === index);
  const config = withSiteCinematicDefault(buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl,
    imagePool: mediaPool,
  }));
  const videoRequired = signatureId === 'cinematic-scrub' || signatureId === 'scrollytelling-manifesto';
  let source = config;
  if (videoRequired) {
    const home = config.pages.find((page) => page.slug === '') ?? config.pages[0];
    const hero = home?.sections.find((section) => section.type === 'hero');
    if (hero) {
      source = {
        ...config,
        pages: config.pages.map((page) => page.id !== home.id ? page : {
          ...page,
          sections: page.sections.map((section) => section.id !== hero.id ? section : {
            ...section,
            background: {
              ...section.background,
              video: { src: DEMO_VIDEO, poster: DEMO_POSTER },
            },
          }),
        }),
      };
    }
  }
  const previewTier: Tier = videoRequired ? 'premium' : tier;
  const next = applyGeneratedMotion(source, survey.purposeId, previewTier, {
    signatureId,
    ...(videoRequired ? { videoAddon: true, heroTechnique: 'video-hero' } : {}),
  }, survey);
  return {
    config: next,
    contentFit: next.motion?.signatures?.some((scene) => scene.signatureId === signatureId) ?? false,
    usesRepresentativeMedia: videoRequired,
  };
}
