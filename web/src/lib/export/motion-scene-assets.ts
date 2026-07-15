/**
 * Motion-scene media traversal shared by static export, the document LCP resolver,
 * and the publishing audit. Keeping this exhaustive switch close to the export
 * boundary makes a newly added scene fail TypeScript until its assets are handled.
 */
import type { MotionMedia, MotionScene, SiteConfig, SitePage } from '@/lib/types/site';
import { findPage } from '@/lib/types/site';
import { isSafeMediaSrc } from '@/lib/safe-url';
import { isProductionMotionSignatureId } from '@/lib/motion/signatures';
import type { MotionAssetProvenance } from '@/lib/motion/signatures';

function assertNever(value: never): never {
  throw new Error(`Unsupported motion scene: ${String(value)}`);
}

/** Media in semantic/reading order. The first item is the only possible scene LCP candidate. */
export function motionSceneMedia(scene: MotionScene): MotionMedia[] {
  switch (scene.signatureId) {
    case 'cinematic-scrub':
    case 'scrollytelling-manifesto':
      return [scene.media];
    case 'sticky-chapters':
      return scene.chapters.flatMap((chapter) => chapter.media ? [chapter.media] : []);
    case 'true-card-stack':
      return scene.cards.flatMap((card) => card.media ? [card.media] : []);
    case 'portal-zoom':
    case 'scroll-curtain':
      return scene.scenes.flatMap((item) => item.media ? [item.media] : []);
    case 'mosaic-reveal':
      return scene.images;
    case 'path-journey':
      return [];
    case 'before-after-scrub':
      return [scene.before, scene.after];
    case 'horizontal-story':
      return scene.panels.flatMap((panel) => panel.media ? [panel.media] : []);
    default:
      return assertNever(scene);
  }
}

export function motionSceneForPage(config: SiteConfig, page: SitePage): MotionScene | undefined {
  if (config.motion?.catalogVersion !== 2) return undefined;
  const scene = config.motion.signatures?.find((candidate) => candidate.pageId === page.id);
  return scene && isProductionMotionSignatureId(scene.signatureId) ? scene : undefined;
}

/**
 * Section-grid, process, and comparison media are never the page LCP surface even when a
 * malformed/legacy config places their target first. Renderer and document preload share
 * this exact policy so eager markup cannot diverge from the preload decision.
 */
export function motionSceneMayOwnLcp(scene: MotionScene): boolean {
  return !(
    scene.signatureId === 'true-card-stack' ||
    scene.signatureId === 'mosaic-reveal' ||
    scene.signatureId === 'before-after-scrub' ||
    scene.signatureId === 'path-journey'
  );
}

/**
 * Add a static render URL only when the trusted collector actually rewrote the registry's
 * canonical URL. Callers cannot infer/submit this mapping from SiteConfig data.
 */
export function motionAssetsForStaticRender(
  assets: readonly MotionAssetProvenance[],
  trustedRewrites: ReadonlyMap<string, string>,
): MotionAssetProvenance[] {
  return assets.map((asset) => {
    const renderSrc = trustedRewrites.get(asset.canonicalSrc);
    return renderSrc ? { ...asset, renderSrc } : { ...asset, renderSrc: undefined };
  });
}

/**
 * Select exactly one image URL that is allowed to receive eager/high treatment.
 * A signature may own LCP only when it replaces the first visible section. Legacy
 * hero backgrounds remain the deterministic fallback.
 */
export function pageLcpImageSrc(config: SiteConfig, pageSlug: string): string | undefined {
  const page = findPage(config, pageSlug);
  if (!page) return undefined;
  const first = page.sections.find((section) => !section.hidden);
  if (!first) return undefined;

  const scene = motionSceneForPage(config, page);
  // Section-grid/comparison signatures deliberately never claim page LCP. Their
  // media stays lazy even when an unusual config places the section first.
  const sceneMayOwnLcp = scene && motionSceneMayOwnLcp(scene);
  if (sceneMayOwnLcp && scene.sectionId === first.id) {
    const media = motionSceneMedia(scene)[0];
    const candidate = media?.kind === 'video' ? media.poster : media?.src;
    if (candidate && isSafeMediaSrc(candidate)) return candidate;
  }

  if (first.type !== 'hero') return undefined;
  const legacyCandidate = first.background.video?.poster ?? first.background.image?.src;
  return legacyCandidate && isSafeMediaSrc(legacyCandidate) ? legacyCandidate : undefined;
}
