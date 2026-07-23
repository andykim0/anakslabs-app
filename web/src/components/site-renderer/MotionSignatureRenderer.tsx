import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import type {
  BeforeAfterScrubScene,
  MotionMedia,
  MotionScene,
  Section,
  SiteTheme,
} from '@/lib/types/site';
import type { MotionArtDirectionProfile } from '@/lib/motion/signatures';
import {
  resolvePlacement,
  signatureContractFor,
  type ResolvedSignaturePlacement,
  type SignatureBreakpointBand,
  type SignatureContract,
} from '@/lib/motion/signature-contract';
import {
  defaultCinematicCompositionPattern,
  resolveScrollytellingComposition,
  type ScrollytellingCompositionOverride,
  type ScrollytellingCompositionPattern,
  type ScrollytellingCopyTone,
} from '@/lib/motion/scrollytelling-composition';
import { safeMediaSrc } from '@/lib/safe-url';

export type MotionSignatureRenderMode = 'desktop' | 'mobile' | 'auto';

export interface ScrollytellingActLink {
  href: `/${string}`;
  label: string;
}

interface MotionSignatureRendererProps {
  scene: MotionScene;
  theme: SiteTheme;
  artDirection: MotionArtDirectionProfile;
  mode: MotionSignatureRenderMode;
  isFirst?: boolean;
  /** Renderer-only responsive sources for curated previews; persisted MotionMedia remains unchanged. */
  responsiveVideoSources?: readonly {
    src: string;
    type: 'video/webm' | 'video/mp4';
    media?: string;
  }[];
  /** 랜딩 전역 진행도 루트가 이 단일 영상을 소유할 때 시그니처 자체의 seek를 비활성화한다. */
  pageFilm?: boolean;
  /** 한 설정으로 시그니처의 모든 막에 적용하는 타이틀 구도 패턴. */
  compositionPattern?: ScrollytellingCompositionPattern;
  /** 장면 밝기 충돌 등 특정 막만 보정하는 선택적 슬롯. */
  compositionOverrides?: readonly (ScrollytellingCompositionOverride | null)[];
  /** 개별 override가 없을 때 쓰는 장면 위 타이포 톤. */
  compositionDefaultTone?: ScrollytellingCopyTone;
  /** 마케팅 등 renderer 소유 내부 경로 CTA. 저장된 tenant 콘텐츠에서는 사용하지 않는다. */
  scrollytellingActLinks?: readonly (ScrollytellingActLink | null)[];
  /** Server-owned rollout projection. False preserves the pre-contract renderer byte-for-byte. */
  signatureContractEnabled?: boolean;
}

const copyStyle: CSSProperties = {
  maxWidth: '44rem',
  wordBreak: 'keep-all',
  overflowWrap: 'anywhere',
};

function domId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function bandFor(index: number, count: number, band?: [number, number]): [number, number] {
  return band ?? [index / count, index === count - 1 ? 1 : (index + 1) / count];
}

function breakpointBandFor(mode: MotionSignatureRenderMode): SignatureBreakpointBand {
  return mode === 'mobile' ? 'mobile' : 'wide';
}

function contractPlacement(
  props: Pick<MotionSignatureRendererProps, 'signatureContractEnabled' | 'mode'>,
  signatureId: 'cinematic-scrub' | 'scrollytelling-manifesto' | 'scroll-curtain',
  index: number,
  textLength: number,
): ResolvedSignaturePlacement | undefined {
  return props.signatureContractEnabled
    ? resolvePlacement(signatureId, index, breakpointBandFor(props.mode), { textLength })
    : undefined;
}

function ScrollytellingHeading({ heading }: { heading: string }) {
  const words = heading.trim().split(/\s+/u).filter(Boolean);
  return (
    <>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} data-ss-word aria-hidden="true">
          {word}{index < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

function CinematicHeading({ heading }: { heading: string }) {
  const words = heading.trim().split(/\s+/u).filter(Boolean);
  return (
    <>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} data-cinematic-word aria-hidden="true">
          {word}{index < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

/**
 * Stable center-out support groups around the first (focal) tile. This is intentionally
 * derived before render: hydration never shuffles the gallery and DOM order stays intact.
 */
function mosaicRevealRanks(count: number): number[] {
  const columns = 3;
  return Array.from({ length: count }, (_, index) => index)
    .sort((left, right) => {
      const leftDistance = Math.floor(left / columns) + (left % columns);
      const rightDistance = Math.floor(right / columns) + (right % columns);
      return leftDistance - rightDistance || left - right;
    })
    .reduce((ranks, index, rank) => {
      ranks[index] = rank;
      return ranks;
    }, Array<number>(count));
}

function mosaicMediaShape(media: MotionMedia): 'wide' | 'square' | 'portrait' {
  const ratio = media.width / media.height;
  if (ratio >= 1.28) return 'wide';
  if (ratio <= 0.82) return 'portrait';
  return 'square';
}

function sceneVars(theme: SiteTheme, art: MotionArtDirectionProfile): CSSProperties {
  return {
    '--signature-bg': theme.tokens?.color.backgroundSubtle ?? theme.palette.background,
    '--signature-surface': theme.tokens?.color.surfaceStrong ?? theme.palette.surface,
    '--signature-text': theme.palette.text,
    '--signature-muted': theme.tokens?.color.muted ?? theme.palette.muted,
    '--signature-primary': theme.palette.primary,
    '--signature-accent': theme.palette.accent,
    '--signature-heading-font': theme.fonts.heading,
    '--signature-body-font': theme.fonts.body,
    '--signature-duration': `${art.durationMs}ms`,
    '--signature-easing': theme.tokens?.motion.easing.enter ?? art.cssEasing,
    '--signature-max-scale': art.maxScale,
    '--signature-max-translation': `${art.maxTranslationPx}px`,
    '--signature-radius': theme.tokens?.radius.soft ?? `${theme.radius ?? 8}px`,
  } as CSSProperties;
}

function mediaIsSafe(media: MotionMedia): boolean {
  return Boolean(
    media.width > 0 && media.height > 0 && media.alt.trim() && safeMediaSrc(media.src) &&
    (media.kind !== 'video' || safeMediaSrc(media.poster)),
  );
}

function beforeAfterContractIsSafe(scene: BeforeAfterScrubScene): boolean {
  return (
    scene.sameCaseAttested === true &&
    scene.publicationRightsAttested === true &&
    scene.before.provenance === 'customer-provided' &&
    scene.after.provenance === 'customer-provided' &&
    Boolean(scene.before.assetId) &&
    Boolean(scene.after.assetId) &&
    scene.before.assetId !== scene.after.assetId &&
    scene.before.caseId === scene.caseId &&
    scene.after.caseId === scene.caseId &&
    scene.before.width * scene.after.height === scene.after.width * scene.before.height &&
    mediaIsSafe(scene.before) &&
    mediaIsSafe(scene.after)
  );
}

/** Renderer-side final defense. Server ownership/provenance verification still happens in the sanitizer. */
export function isRenderableMotionScene(scene: MotionScene): boolean {
  switch (scene.signatureId) {
    case 'cinematic-scrub':
    case 'scrollytelling-manifesto':
      return scene.media.kind === 'video' && mediaIsSafe(scene.media);
    case 'mosaic-reveal':
      return scene.images.every((media) => media.kind === 'image' && mediaIsSafe(media));
    case 'before-after-scrub':
      return beforeAfterContractIsSafe(scene);
    case 'sticky-chapters':
      return scene.chapters.every((item) => !item.media || mediaIsSafe(item.media));
    case 'true-card-stack':
      return scene.cards.every((item) => !item.media || mediaIsSafe(item.media));
    case 'portal-zoom':
    case 'scroll-curtain':
      return scene.scenes.every((item) => !item.media || mediaIsSafe(item.media));
    case 'horizontal-story':
      return scene.panels.every((item) => !item.media || mediaIsSafe(item.media));
    case 'path-journey':
      return true;
  }
}

/** Sections whose structured content is represented by the signature and must not be duplicated below it. */
export function consumedSectionIds(scene: MotionScene): ReadonlySet<string> {
  const ids = new Set<string>([scene.sectionId]);
  if (scene.signatureId === 'sticky-chapters') {
    scene.chapters.forEach((chapter) => ids.add(chapter.sourceSectionId));
  } else if (scene.signatureId === 'portal-zoom' || scene.signatureId === 'scroll-curtain') {
    scene.scenes.forEach((item) => ids.add(item.sourceSectionId));
  } else if (scene.signatureId === 'horizontal-story') {
    scene.panels.forEach((panel) => ids.add(panel.sourceSectionId));
  }
  return ids;
}

/** Structured page scenes must point at real source sections; horizontal stages never absorb forms/maps/contact. */
export function sceneSourceSectionsAreSafe(scene: MotionScene, sections: readonly Section[]): boolean {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const sources = (() => {
    if (scene.signatureId === 'sticky-chapters') return scene.chapters.map((item) => item.sourceSectionId);
    if (scene.signatureId === 'portal-zoom' || scene.signatureId === 'scroll-curtain') {
      return scene.scenes.map((item) => item.sourceSectionId);
    }
    if (scene.signatureId === 'horizontal-story') return scene.panels.map((item) => item.sourceSectionId);
    return [];
  })();
  if (!sources.every((id) => sectionById.has(id))) return false;
  if (scene.signatureId !== 'horizontal-story') return true;
  return sources.every((id) => {
    const section = sectionById.get(id)!;
    return !['contact', 'cta'].includes(section.type) &&
      !section.elements.some((element) => element.kind === 'form' || element.kind === 'map');
  });
}

function focalPosition(media: MotionMedia): string {
  const point = media.focalPoint ?? { x: 0.5, y: 0.5 };
  return `${Math.round(point.x * 10000) / 100}% ${Math.round(point.y * 10000) / 100}%`;
}

function SignatureMedia({
  media,
  eager = false,
  scrub = false,
  scrollytelling = false,
  className,
  dataAttrs = {},
  responsiveVideoSources,
  pageFilm = false,
}: {
  media: MotionMedia;
  eager?: boolean;
  scrub?: boolean;
  scrollytelling?: boolean;
  className?: string;
  dataAttrs?: Record<string, string | number | boolean>;
  responsiveVideoSources?: MotionSignatureRendererProps['responsiveVideoSources'];
  pageFilm?: boolean;
}) {
  if (!mediaIsSafe(media)) return null;
  const src = safeMediaSrc(media.src);
  const poster = safeMediaSrc(media.poster);
  const geometry: CSSProperties & Record<`--${string}`, string> = {
    aspectRatio: `${media.width} / ${media.height}`,
    width: '100%',
    '--signature-media-quality-max-width': `${Math.round(media.width * 1.15)}px`,
    '--signature-media-quality-max-height': `${Math.round(media.height * 1.15)}px`,
  };
  const commonImageProps = {
    width: media.width,
    height: media.height,
    loading: eager ? 'eager' as const : 'lazy' as const,
    decoding: eager ? 'sync' as const : 'async' as const,
    fetchPriority: eager ? 'high' as const : undefined,
    style: { objectFit: 'cover' as const, objectPosition: focalPosition(media) },
  };

  return (
    <figure
      data-signature-media
      data-video-quality-guard={media.kind === 'video' ? true : undefined}
      data-source-width={media.kind === 'video' ? media.width : undefined}
      data-source-height={media.kind === 'video' ? media.height : undefined}
      className={className}
      style={geometry}
      {...dataAttrs}
    >
      {media.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary tenant/export URLs need plain reserved-size img.
        <img src={src} alt={media.alt} {...commonImageProps} />
      ) : (
        <>
          {/* Poster is the SSR/LCP surface. Runtime reveals video only after loadeddata/playing. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- poster must survive static export and video failure. */}
          <img
            data-video-poster
            src={poster}
            alt={media.alt}
            {...commonImageProps}
          />
          <video
            data-m="cinematicvideo"
            data-m-cinematic-video="true"
            data-ss-video={scrollytelling ? true : undefined}
            data-playback={scrub ? 'scrub' : 'loop'}
            data-page-film-video={pageFilm ? true : undefined}
            src={responsiveVideoSources?.length ? undefined : src}
            poster={poster}
            width={media.width}
            height={media.height}
            muted
            playsInline
            preload="none"
            aria-hidden="true"
            tabIndex={-1}
            style={{ objectFit: 'cover', objectPosition: focalPosition(media) }}
          >
            {responsiveVideoSources?.map((source) => (
              <source
                key={`${source.media ?? 'default'}-${source.src}`}
                src={safeMediaSrc(source.src)}
                type={source.type}
                media={source.media}
              />
            ))}
          </video>
        </>
      )}
      {media.caption ? <figcaption data-signature-caption>{media.caption}</figcaption> : null}
    </figure>
  );
}

function SignatureRoot({
  scene,
  theme,
  art,
  mode,
  children,
  style,
  label,
  signatureContract,
}: {
  scene: MotionScene;
  theme: SiteTheme;
  art: MotionArtDirectionProfile;
  mode: MotionSignatureRenderMode;
  children: ReactNode;
  style?: CSSProperties;
  label?: string;
  signatureContract?: SignatureContract;
}) {
  const fallbackPhase = 'settle' as const;
  const fallbackContrast = signatureContract?.contrastPolicy[fallbackPhase];
  const policy = (phase: keyof SignatureContract['contrastPolicy']) => {
    const value = signatureContract?.contrastPolicy[phase];
    return value ? `${value.textColorToken},${value.scrim}` : undefined;
  };
  return (
    <section
      id={scene.sectionId}
      data-motion-signature={scene.signatureId}
      data-signature-id={scene.signatureId}
      data-signature-status="production-renderer"
      data-signature-tempo={art.tempo}
      data-signature-depth={art.depth}
      data-signature-media-treatment={art.mediaTreatment}
      data-signature-art-direction={art.artDirection}
      data-signature-theme-tone={art.themeTone}
      data-signature-corners={art.cornerTreatment}
      data-signature-typography={art.typographyVoice}
      data-signature-media-shape={art.mediaShape}
      data-signature-item-count={art.itemCount}
      data-signature-intensity={art.motionIntensity}
      data-phase-establish={art.progressWindows.establish.join(',')}
      data-phase-progress={art.progressWindows.progress.join(',')}
      data-phase-focal={art.progressWindows.focal.join(',')}
      data-phase-settle={art.progressWindows.settle.join(',')}
      {...(signatureContract ? {
        'data-signature-contract': '1',
        'data-signature-contract-phase': fallbackPhase,
        'data-signature-contract-text-token': fallbackContrast?.textColorToken,
        'data-signature-contract-scrim': fallbackContrast?.scrim,
        'data-signature-contract-fallback-zone': signatureContract.renderContract.reducedMotionFallbackZone,
        'data-signature-contract-pinned': String(signatureContract.renderContract.needsPinnedStage),
        'data-signature-contract-scroll-depth': String(signatureContract.renderContract.scrollDepthActs),
        'data-signature-contract-poster': String(signatureContract.renderContract.posterRequired),
        'data-signature-contract-no-js-readable': String(signatureContract.renderContract.noJsReadable),
        'data-signature-contract-window-enter': signatureContract.phases[0].visibilityRatio.join(','),
        'data-signature-contract-window-hold': signatureContract.phases[1].visibilityRatio.join(','),
        'data-signature-contract-window-settle': signatureContract.phases[2].visibilityRatio.join(','),
        'data-signature-contract-window-exit': signatureContract.phases[3].visibilityRatio.join(','),
        'data-signature-contract-policy-enter': policy('enter'),
        'data-signature-contract-policy-hold': policy('hold'),
        'data-signature-contract-policy-settle': policy('settle'),
        'data-signature-contract-policy-exit': policy('exit'),
      } : {})}
      data-render-mode={mode}
      data-ss-stage={scene.signatureId === 'scrollytelling-manifesto' ? true : undefined}
      data-ss-mode={scene.signatureId === 'scrollytelling-manifesto' ? mode : undefined}
      data-m-progress
      aria-label={label}
      style={{ ...sceneVars(theme, art), ...style }}
    >
      {children}
    </section>
  );
}

function CinematicScrub({
  scene,
  theme,
  art,
  mode,
  isFirst,
  compositionPattern,
  compositionOverrides,
  compositionDefaultTone = 'light',
  signatureContractEnabled,
}: MotionSignatureRendererProps & {
  scene: Extract<MotionScene, { signatureId: 'cinematic-scrub' }>;
  art: MotionArtDirectionProfile;
}) {
  const headingId = `${domId(scene.sectionId)}-cinematic-heading`;
  const pattern = compositionPattern ?? defaultCinematicCompositionPattern('cinematic-scrub');
  const legacyComposition = resolveScrollytellingComposition(
    pattern,
    0,
    compositionOverrides?.[0],
    compositionDefaultTone,
  );
  const resolvedContractPlacement = contractPlacement(
    { signatureContractEnabled, mode },
    'cinematic-scrub',
    0,
    scene.heading.length + (scene.body?.length ?? 0),
  );
  const composition = resolvedContractPlacement
    ? { ...legacyComposition, ...resolvedContractPlacement }
    : legacyComposition;
  const signatureContract = signatureContractEnabled
    ? signatureContractFor('cinematic-scrub')
    : undefined;
  const trackDepth = signatureContract?.renderContract.scrollDepthActs ?? 3;
  return (
    <SignatureRoot
      scene={scene}
      theme={theme}
      art={art}
      mode={mode}
      label={scene.heading}
      signatureContract={signatureContract}
      style={{ '--signature-track-height': `${trackDepth * 100}svh` } as CSSProperties}
    >
      <div data-signature-pin data-composition-pattern={pattern}>
        <SignatureMedia
          media={scene.media}
          eager={isFirst}
          scrub
          dataAttrs={{ 'data-m-cinematic-media': true, 'data-cinematic-media': true }}
        />
        <div
          data-cinematic-copy
          data-cinematic-composition={composition.placement}
          data-cinematic-entrance={composition.entrance}
          data-cinematic-tone={composition.tone}
          {...(resolvedContractPlacement
            ? { 'data-signature-contract-zone': resolvedContractPlacement.zone }
            : {})}
          style={copyStyle}
          data-signature-contract-copy={signatureContract ? true : undefined}
        >
          {/* Establish the story before the first scroll input. Previously the whole copy was
              progress-hidden at p=0, so a healthy cinematic renderer looked like a plain photo. */}
          <h2 id={headingId} data-signature-heading aria-label={scene.heading}>
            <CinematicHeading heading={scene.heading} />
          </h2>
          {scene.body ? (
            <p
              data-signature-body
              data-m-story
              data-story-start="0.02"
              data-story-end="0.38"
            >
              {scene.body}
            </p>
          ) : null}
        </div>
      </div>
    </SignatureRoot>
  );
}

function ScrollytellingManifesto({
  scene,
  theme,
  art,
  mode,
  isFirst,
  responsiveVideoSources,
  pageFilm,
  compositionPattern = defaultCinematicCompositionPattern('scrollytelling-manifesto'),
  compositionOverrides,
  compositionDefaultTone = 'light',
  scrollytellingActLinks,
  signatureContractEnabled,
}: MotionSignatureRendererProps & {
  scene: Extract<MotionScene, { signatureId: 'scrollytelling-manifesto' }>;
  art: MotionArtDirectionProfile;
}) {
  const signatureContract = signatureContractEnabled
    ? signatureContractFor('scrollytelling-manifesto')
    : undefined;
  const trackDepth = Math.max(
    signatureContract?.renderContract.scrollDepthActs ?? 3,
    scene.acts.length,
  );
  return (
    <SignatureRoot
      scene={scene}
      theme={theme}
      art={art}
      mode={mode}
      label={scene.acts[0]?.heading ?? '스크롤 스토리'}
      signatureContract={signatureContract}
      style={{
        '--signature-track-height': `${trackDepth * 100}svh`,
        '--ss-scroll-height': `${trackDepth * 100}svh`,
        '--ss-static-height': `${Math.round(scene.media.height / scene.media.width * 100)}vw`,
        '--ss-stage-bg': theme.palette.background,
        '--ss-stack-bg': theme.palette.surface,
        '--ss-stack-text': theme.palette.text,
        '--ss-text': theme.palette.text,
        '--ss-heading-font': theme.fonts.heading,
      } as CSSProperties}
    >
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: '.anaks-site [data-signature-id="scrollytelling-manifesto"]{height:auto!important;contain:none}' }} />
      </noscript>
      <div data-signature-pin data-ss-pin>
        <div data-ss-media data-m-cinematic-media>
          <SignatureMedia
            media={scene.media}
            eager={isFirst}
            scrub
            scrollytelling
            responsiveVideoSources={responsiveVideoSources}
            pageFilm={pageFilm}
            dataAttrs={{ 'data-ss-video-wrap': true }}
          />
        </div>
        <div data-ss-act-list data-ss-composition-pattern={compositionPattern}>
          {scene.acts.map((act, index) => {
            const [start, end] = bandFor(index, scene.acts.length, act.band);
            const headingId = `${domId(scene.sectionId)}-act-${index + 1}`;
            const legacyComposition = resolveScrollytellingComposition(
              compositionPattern,
              index,
              compositionOverrides?.[index],
              compositionDefaultTone,
            );
            const resolvedContractPlacement = contractPlacement(
              { signatureContractEnabled, mode },
              'scrollytelling-manifesto',
              index,
              act.heading.length + act.body.length,
            );
            const composition = resolvedContractPlacement
              ? { ...legacyComposition, ...resolvedContractPlacement }
              : legacyComposition;
            const actLink = scrollytellingActLinks?.[index];
            return (
              <article
                key={act.id}
                data-ss-act
                data-act-kind={act.kind ?? 'text'}
                data-act-start={start.toFixed(4)}
                data-act-end={end.toFixed(4)}
                data-ss-composition={composition.placement}
                data-ss-entrance={composition.entrance}
                data-ss-tone={composition.tone}
                {...(resolvedContractPlacement
                  ? { 'data-signature-contract-zone': resolvedContractPlacement.zone }
                  : {})}
                aria-labelledby={headingId}
              >
                <div
                  data-ss-copy
                  data-signature-contract-copy={signatureContract ? true : undefined}
                  style={copyStyle}
                >
                  <h2 id={headingId} data-ss-heading data-signature-heading aria-label={act.heading}>
                    <ScrollytellingHeading heading={act.heading} />
                  </h2>
                  <p data-ss-body data-signature-body>{act.body}</p>
                  {actLink ? (
                    <Link data-ss-act-link href={actLink.href}>
                      {actLink.label} <span aria-hidden="true">→</span>
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </SignatureRoot>
  );
}

function StickyChapters({ scene, theme, art, mode, isFirst }: MotionSignatureRendererProps & {
  scene: Extract<MotionScene, { signatureId: 'sticky-chapters' }>;
  art: MotionArtDirectionProfile;
}) {
  const firstMedia = scene.chapters.findIndex((chapter) => Boolean(chapter.media));
  return (
    <SignatureRoot scene={scene} theme={theme} art={art} mode={mode} label="주요 이야기">
      <span data-signature-progress-rail aria-hidden="true"><span data-signature-progress-fill /></span>
      <ol data-chapter-indicator aria-hidden="true">
        {scene.chapters.map((chapter, index) => (
          <li key={`indicator-${chapter.id}`} data-chapter-indicator-item data-chapter-index={index}>
            <span>{String(index + 1).padStart(2, '0')}</span>
          </li>
        ))}
      </ol>
      {scene.chapters.map((chapter, index) => {
        const headingId = `${domId(scene.sectionId)}-chapter-${index + 1}`;
        return (
          <section
            key={chapter.id}
            id={chapter.sourceSectionId !== scene.sectionId ? chapter.sourceSectionId : undefined}
            data-signature-chapter
            data-chapter-index={index}
            aria-labelledby={headingId}
          >
            {chapter.media ? (
              <SignatureMedia
                media={chapter.media}
                eager={Boolean(isFirst && index === firstMedia)}
                className="signature-chapter-media"
                dataAttrs={{ 'data-chapter-media': true }}
              />
            ) : null}
            <div data-chapter-copy style={copyStyle}>
              <h2 id={headingId} data-signature-heading>{chapter.heading}</h2>
              <p data-signature-body>{chapter.body}</p>
            </div>
          </section>
        );
      })}
    </SignatureRoot>
  );
}

function TrueCardStack({
  scene,
  theme,
  art,
  mode,
  isFirst,
  signatureContractEnabled,
}: MotionSignatureRendererProps & {
  scene: Extract<MotionScene, { signatureId: 'true-card-stack' }>;
  art: MotionArtDirectionProfile;
}) {
  const headingId = `${domId(scene.sectionId)}-stack-heading`;
  const firstMedia = scene.cards.findIndex((card) => Boolean(card.media));
  const signatureContract = signatureContractEnabled
    ? signatureContractFor('true-card-stack')
    : undefined;
  return (
    <SignatureRoot
      scene={scene}
      theme={theme}
      art={art}
      mode={mode}
      label={scene.heading}
      signatureContract={signatureContract}
    >
      <header data-signature-intro style={{ ...copyStyle, padding: 'clamp(40px, 7vw, 104px) clamp(24px, 8vw, 120px) 0' }}>
        <h2 id={headingId} data-signature-heading>{scene.heading}</h2>
      </header>
      <ol data-card-list aria-labelledby={headingId}>
        {scene.cards.map((card, index) => {
          const cardHeadingId = `${domId(scene.sectionId)}-card-${index + 1}`;
          const resolvedContractPlacement = signatureContractEnabled
            ? resolvePlacement('true-card-stack', index, breakpointBandFor(mode), {
                textLength: card.heading.length + card.body.length + (card.caption?.length ?? 0),
              })
            : undefined;
          return (
            <li
              key={card.id}
              data-stack-card
              {...(resolvedContractPlacement
                ? { 'data-signature-contract-zone': resolvedContractPlacement.zone }
                : {})}
              style={{ '--card-index': index, '--card-bg': index % 2 ? theme.palette.background : theme.palette.surface } as CSSProperties}
            >
              <article aria-labelledby={cardHeadingId}>
                {card.media ? <SignatureMedia media={card.media} eager={Boolean(isFirst && index === firstMedia)} /> : null}
                <div
                  data-card-copy
                  data-signature-contract-copy={signatureContract ? true : undefined}
                  style={{ ...copyStyle, marginTop: card.media ? '1.5rem' : undefined }}
                >
                  <h3 id={cardHeadingId} data-signature-heading>{card.heading}</h3>
                  <p data-signature-body>{card.body}</p>
                  {card.caption ? <p data-signature-caption>{card.caption}</p> : null}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </SignatureRoot>
  );
}

function EditorialScenes({
  scene,
  theme,
  art,
  mode,
  isFirst,
  kind,
  compositionPattern,
  compositionOverrides,
  compositionDefaultTone = 'light',
  signatureContractEnabled,
}: MotionSignatureRendererProps & {
  scene: Extract<MotionScene, { signatureId: 'portal-zoom' | 'scroll-curtain' }>;
  art: MotionArtDirectionProfile;
  kind: 'portal' | 'curtain';
}) {
  const count = scene.scenes.length;
  const firstMedia = scene.scenes.findIndex((item) => Boolean(item.media));
  const pattern = compositionPattern ?? defaultCinematicCompositionPattern(
    kind === 'portal' ? 'portal-zoom' : 'scroll-curtain',
  );
  const signatureContract = kind === 'curtain' && signatureContractEnabled
    ? signatureContractFor('scroll-curtain')
    : undefined;
  const trackDepth = Math.max(
    signatureContract?.renderContract.scrollDepthActs ?? count,
    count,
  );
  return (
    <SignatureRoot
      scene={scene}
      theme={theme}
      art={art}
      mode={mode}
      label={scene.scenes[0]?.heading ?? '브랜드 스토리'}
      signatureContract={signatureContract}
      style={{ '--signature-track-height': `${trackDepth * 100}svh` } as CSSProperties}
    >
      <div data-signature-pin data-composition-pattern={pattern}>
        {scene.scenes.map((item, index) => {
          const headingId = `${domId(scene.sectionId)}-${kind}-${index + 1}`;
          const legacyComposition = resolveScrollytellingComposition(
            pattern,
            index,
            compositionOverrides?.[index],
            compositionDefaultTone,
          );
          const resolvedContractPlacement = kind === 'curtain'
            ? contractPlacement(
                { signatureContractEnabled, mode },
                'scroll-curtain',
                index,
                item.heading.length + item.body.length,
              )
            : undefined;
          const composition = resolvedContractPlacement
            ? { ...legacyComposition, ...resolvedContractPlacement }
            : legacyComposition;
          return (
            <section
              key={item.id}
              id={item.sourceSectionId !== scene.sectionId ? item.sourceSectionId : undefined}
              data-signature-panel
              data-scene-index={index}
              data-cinematic-composition={composition.placement}
              data-cinematic-entrance={composition.entrance}
              data-cinematic-tone={composition.tone}
              {...(resolvedContractPlacement
                ? { 'data-signature-contract-zone': resolvedContractPlacement.zone }
                : {})}
              {...(kind === 'curtain' ? { 'data-curtain-panel': true } : {})}
              aria-labelledby={headingId}
              style={kind === 'curtain' ? { zIndex: count - index } : undefined}
            >
              {item.media ? (
                kind === 'portal' ? (
                  <div data-portal-aperture>
                    <SignatureMedia
                      media={item.media}
                      eager={Boolean(isFirst && index === firstMedia)}
                      dataAttrs={{ 'data-portal-media': true }}
                    />
                    <span data-portal-boundary aria-hidden="true" />
                  </div>
                ) : (
                  <SignatureMedia
                    media={item.media}
                    eager={Boolean(isFirst && index === firstMedia)}
                    dataAttrs={{ 'data-curtain-media': true }}
                  />
                )
              ) : null}
              {kind === 'curtain' ? <span data-curtain-edge aria-hidden="true" /> : null}
              <div
                data-scene-copy
                data-curtain-copy={kind === 'curtain' ? true : undefined}
                data-signature-contract-copy={signatureContract ? true : undefined}
                style={copyStyle}
              >
                <h2 id={headingId} data-signature-heading aria-label={item.heading}>
                  <CinematicHeading heading={item.heading} />
                </h2>
                <p data-signature-body>{item.body}</p>
              </div>
            </section>
          );
        })}
      </div>
    </SignatureRoot>
  );
}

function MosaicReveal({ scene, theme, art, mode }: MotionSignatureRendererProps & {
  scene: Extract<MotionScene, { signatureId: 'mosaic-reveal' }>;
  art: MotionArtDirectionProfile;
}) {
  const headingId = `${domId(scene.sectionId)}-mosaic-heading`;
  const revealRanks = mosaicRevealRanks(scene.images.length);
  return (
    <SignatureRoot scene={scene} theme={theme} art={art} mode={mode} label={scene.heading ?? '이미지 갤러리'}>
      {scene.heading ? (
        <header data-signature-intro style={{ ...copyStyle, padding: 'clamp(28px, 5vw, 72px) clamp(24px, 8vw, 120px) 0' }}>
          <h2 id={headingId} data-signature-heading>{scene.heading}</h2>
        </header>
      ) : null}
      <div data-mosaic-grid role="list" aria-labelledby={scene.heading ? headingId : undefined}>
        {scene.images.map((media, index) => (
          <div
            key={media.id}
            data-mosaic-tile
            data-mosaic-focal={index === 0 ? true : undefined}
            data-tile-index={index}
            data-reveal-order={revealRanks[index]}
            data-reveal-group={revealRanks[index] === 0 ? 0 : 1 + Math.floor((revealRanks[index] - 1) / 2)}
            data-tile-shape={mosaicMediaShape(media)}
            role="listitem"
          >
            {/* Mosaic is never an LCP candidate: every tile is lazy + async by contract. */}
            <SignatureMedia media={media} />
          </div>
        ))}
      </div>
    </SignatureRoot>
  );
}

function PathJourney({ scene, theme, art, mode, signatureContractEnabled }: MotionSignatureRendererProps & {
  scene: Extract<MotionScene, { signatureId: 'path-journey' }>;
  art: MotionArtDirectionProfile;
}) {
  const headingId = `${domId(scene.sectionId)}-path-heading`;
  const signatureContract = signatureContractEnabled
    ? signatureContractFor('path-journey')
    : undefined;
  return (
    <SignatureRoot
      scene={scene}
      theme={theme}
      art={art}
      mode={mode}
      label={scene.heading}
      signatureContract={signatureContract}
    >
      <header data-signature-intro style={{ ...copyStyle, padding: 'clamp(40px, 7vw, 104px) clamp(24px, 8vw, 120px) 0' }}>
        <h2 id={headingId} data-signature-heading>{scene.heading}</h2>
      </header>
      <div data-path-stage data-path-count={scene.milestones.length}>
        <span data-path-line aria-hidden="true" />
        <ol data-path-list aria-labelledby={headingId}>
          {scene.milestones.map((milestone, index) => {
            const milestoneId = `${domId(scene.sectionId)}-milestone-${index + 1}`;
            const resolvedContractPlacement = signatureContractEnabled
              ? resolvePlacement('path-journey', index, breakpointBandFor(mode), {
                  textLength: milestone.heading.length + milestone.body.length + (milestone.caption?.length ?? 0),
                })
              : undefined;
            return (
              <li
                key={milestone.id}
                data-path-milestone
                data-milestone-index={index}
                {...(resolvedContractPlacement
                  ? { 'data-signature-contract-zone': resolvedContractPlacement.zone }
                  : {})}
              >
                <span data-path-marker aria-hidden="true" />
                <article
                  aria-labelledby={milestoneId}
                  data-signature-contract-copy={signatureContract ? true : undefined}
                  style={copyStyle}
                >
                  <span data-path-index aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <h3 id={milestoneId} data-signature-heading>{milestone.heading}</h3>
                  <p data-signature-body>{milestone.body}</p>
                  {milestone.caption ? <p data-signature-caption>{milestone.caption}</p> : null}
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </SignatureRoot>
  );
}

function BeforeAfterScrub({ scene, theme, art, mode }: MotionSignatureRendererProps & {
  scene: BeforeAfterScrubScene;
  art: MotionArtDirectionProfile;
}) {
  if (!beforeAfterContractIsSafe(scene)) return null;
  const headingId = `${domId(scene.sectionId)}-comparison-heading`;
  const viewportId = `${domId(scene.sectionId)}-comparison-viewport`;
  const rangeId = `${domId(scene.sectionId)}-comparison-range`;
  const helpId = `${domId(scene.sectionId)}-comparison-help`;
  const outputId = `${domId(scene.sectionId)}-comparison-output`;
  const ratio = `${scene.before.width} / ${scene.before.height}`;
  const comparisonFocal = focalPosition(scene.before);
  return (
    <SignatureRoot
      scene={scene}
      theme={theme}
      art={art}
      mode={mode}
      label={`${scene.heading} 실제 사례`}
      style={{ '--before-after-ratio': ratio } as CSSProperties}
    >
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: '.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-viewport]{grid-template-columns:repeat(2,minmax(0,1fr));aspect-ratio:auto;overflow:visible}.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame]{grid-area:auto;height:auto;aspect-ratio:var(--before-after-ratio,4/3)!important}.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame="after"]{clip-path:none}.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-control]{display:none!important}' }} />
      </noscript>
      <div data-before-after-shell>
        <div data-before-after-heading style={copyStyle}>
          <span
            data-before-after-label="actual-case"
            data-non-removable="true"
            data-label-contrast="aa"
            aria-label="실제 고객 사례"
            style={{
              display: 'inline-flex', position: 'relative', zIndex: 20, opacity: 1,
              color: '#ffffff', background: '#111111', border: '2px solid #ffffff',
              borderRadius: 999, padding: '0.45rem 0.8rem', fontWeight: 800,
              pointerEvents: 'none', mixBlendMode: 'normal',
            }}
          >
            실제 사례
          </span>
          <h2 id={headingId} data-signature-heading>{scene.heading}</h2>
        </div>
        <div id={viewportId} data-before-after-viewport aria-labelledby={headingId}>
          {([
            ['before', scene.before, '이전 · 실제 사례'],
            ['after', scene.after, '이후 · 실제 사례'],
          ] as const).map(([kind, media, caption]) => (
            <figure
              key={media.assetId}
              data-before-after-frame={kind}
              style={{ aspectRatio: ratio }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- verified tenant asset with required dimensions. */}
              <img
                src={safeMediaSrc(media.src)}
                alt={media.alt}
                width={media.width}
                height={media.height}
                loading="lazy"
                decoding="async"
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: comparisonFocal }}
              />
              <figcaption>{caption}</figcaption>
            </figure>
          ))}
          <span data-before-after-handle aria-hidden="true"><span /></span>
        </div>
        <label data-before-after-control>
          <span data-before-after-control-row>
            <span>비교 위치</span>
            <output id={outputId} data-before-after-output htmlFor={rangeId}>50%</output>
          </span>
          <input
            id={rangeId}
            data-before-after-range
            type="range"
            min="0"
            max="100"
            step="1"
            defaultValue="50"
            aria-label="실제 사례 전후 비교 위치"
            aria-controls={viewportId}
            aria-describedby={helpId}
            aria-valuetext="이후 사진 50%"
          />
          <span id={helpId} data-before-after-help>좌우 방향키 또는 비교 화면을 움직여 확인하세요.</span>
        </label>
      </div>
    </SignatureRoot>
  );
}

function HorizontalStory({
  scene,
  theme,
  art,
  mode,
  isFirst,
  compositionPattern,
  compositionOverrides,
  compositionDefaultTone = 'light',
}: MotionSignatureRendererProps & {
  scene: Extract<MotionScene, { signatureId: 'horizontal-story' }>;
  art: MotionArtDirectionProfile;
}) {
  const count = scene.panels.length;
  const firstMedia = scene.panels.findIndex((panel) => Boolean(panel.media));
  const pattern = compositionPattern ?? defaultCinematicCompositionPattern('horizontal-story');
  return (
    <SignatureRoot
      scene={scene}
      theme={theme}
      art={art}
      mode={mode}
      label={scene.heading ?? scene.panels[0]?.heading ?? '가로 스토리'}
      style={{ '--signature-track-height': `${count * 100}svh` } as CSSProperties}
    >
      <div data-signature-pin data-composition-pattern={pattern}>
        {scene.heading ? <p data-horizontal-kicker>{scene.heading}</p> : null}
        <span data-signature-progress-rail aria-hidden="true"><span data-signature-progress-fill /></span>
        <ol data-horizontal-indicator aria-hidden="true">
          {scene.panels.map((panel, index) => (
            <li key={`horizontal-step-${panel.id}`} data-horizontal-step data-panel-index={index}>
              {String(index + 1).padStart(2, '0')}
            </li>
          ))}
        </ol>
        <div data-horizontal-rail data-panel-count={count}>
          {scene.panels.map((panel, index) => {
            const headingId = `${domId(scene.sectionId)}-panel-${index + 1}`;
            const composition = resolveScrollytellingComposition(
              pattern,
              index,
              compositionOverrides?.[index],
              compositionDefaultTone,
            );
            return (
              <section
                key={panel.id}
                id={panel.sourceSectionId !== scene.sectionId ? panel.sourceSectionId : undefined}
                data-signature-panel
                data-horizontal-panel
                data-panel-index={index}
                data-cinematic-composition={composition.placement}
                data-cinematic-entrance={composition.entrance}
                data-cinematic-tone={composition.tone}
                aria-labelledby={headingId}
              >
                {panel.media ? (
                  <SignatureMedia media={panel.media} eager={Boolean(isFirst && index === firstMedia)} />
                ) : null}
                <div data-panel-copy style={copyStyle}>
                  <h2 id={headingId} data-signature-heading aria-label={panel.heading}>
                    <CinematicHeading heading={panel.heading} />
                  </h2>
                  <p data-signature-body>{panel.body}</p>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </SignatureRoot>
  );
}

/** Exhaustive structured-scene renderer. No signature infers content from canvas coordinates. */
export function MotionSignatureRenderer(props: MotionSignatureRendererProps) {
  if (!isRenderableMotionScene(props.scene)) return null;
  const shared = { ...props, art: props.artDirection };
  switch (props.scene.signatureId) {
    case 'cinematic-scrub': return <CinematicScrub {...shared} scene={props.scene} />;
    case 'scrollytelling-manifesto': return <ScrollytellingManifesto {...shared} scene={props.scene} />;
    case 'sticky-chapters': return <StickyChapters {...shared} scene={props.scene} />;
    case 'true-card-stack': return <TrueCardStack {...shared} scene={props.scene} />;
    case 'portal-zoom': return <EditorialScenes {...shared} scene={props.scene} kind="portal" />;
    case 'scroll-curtain': return <EditorialScenes {...shared} scene={props.scene} kind="curtain" />;
    case 'mosaic-reveal': return <MosaicReveal {...shared} scene={props.scene} />;
    case 'path-journey': return <PathJourney {...shared} scene={props.scene} />;
    case 'before-after-scrub': return <BeforeAfterScrub {...shared} scene={props.scene} />;
    case 'horizontal-story': return <HorizontalStory {...shared} scene={props.scene} />;
  }
}
