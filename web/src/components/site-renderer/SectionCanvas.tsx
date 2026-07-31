/**
 * 데스크톱(캔버스) 섹션 렌더 — DESIGN_WIDTH(1440) 기준 자유배치를
 * cqw 단위로 환산해 컨테이너 폭에 비례 스케일.
 *
 * [motion-system 2·3단계] 모션은 React 대신 data-m 속성 + CSS + 바닐라 런타임으로.
 * plan(resolveMotionPlan 결과)이 섹션/요소에 data-m을 부착하고, 실제 동작은 SiteRenderer가
 * 방출한 MOTION_CSS/MOTION_RUNTIME이 담당(호스팅·정적 내보내기 공용, framer-motion 없음).
 * Premium: video-hero(배경 영상·poster 폴백)/spotlight/parallax/stacking/split-text/hover-video는
 * 표준 섹션 구조에서, marquee(흐름 띠)·scroll-scrub(pin)은 별도 렌더 분기.
 */
import type { CSSProperties } from 'react';
import type { Section, SiteTheme } from '@/lib/types/site';
import { safeMediaSrc } from '@/lib/safe-url';
import { cqw } from './scale';
import { ElementContent } from './ElementContent';
import { resolveScrim } from '@/lib/design/scrim';
import {
  resolveSectionSurfaceTone,
  resolveThemePaint,
  themeSectionBlockDelta,
} from '@/lib/design/site-theme-tokens';
import {
  cinematicParallaxDepthFor,
  cinematicStoryWindowFor,
  motionFor,
  revealDelayFor,
  parseStatParts,
  parallaxDepthFor,
  isSplitText,
  type MotionPlan,
} from '@/lib/motion/apply';
import { isUniformTeaserSection, UniformTeaserGrid } from './UniformTeaserGrid';
import { continuousFlowLayerRoleFor } from '@/lib/motion/site-cinematic';
import { ResponsiveHeroPhoto } from './ResponsiveHeroPhoto';
import { SectionLayoutProjectionRenderer } from './SectionLayoutProjectionRenderer';
import { ProceduralBackground } from './ProceduralBackground';
import {
  ClinicInsuranceStrip,
  isClinicInsuranceStripSection,
} from './ClinicInsuranceStrip';
import { ClinicFlowSection } from './ClinicFlowSection';

interface SectionCanvasProps {
  section: Section;
  theme: SiteTheme;
  /** 첫 섹션(히어로)이면 이미지 eager 로딩 */
  isFirst?: boolean;
  /** false면 버튼을 비대화형으로 (미리보기 앵커 중첩 방지) */
  interactive?: boolean;
  /** [motion-system 2단계] 모션 계획 — 없으면 모션 미방출(프리뷰/썸네일) */
  plan?: MotionPlan;
  /** [v3 Phase 3] 문의 폼 제출 대상 — 실서빙에서만 전달 */
  siteId?: string;
  /** SITECINE v1 only. Legacy configs omit it and keep the exact image path. */
  proceduralHero?: boolean;
  /** Scene-integrated hero copy. Additive and enabled only by the SITECINE contract. */
  integratedTypography?: boolean;
  /** FLOW opt-in only. Existing SITECINE and legacy configs omit it. */
  continuousFlow?: boolean;
  /** premium-dental-v1 only: catalog semantics rendered as intrinsic document flow. */
  clinicFlow?: boolean;
  /** Visible page-level heading for clinic flow hero. */
  clinicPageHeading?: string;
  /** Route-aware page link mapping for preview and static export. */
  hrefForPageSlug?: (slug: string) => string;
  /** KO contract-import only. Omission preserves the existing en-US clinic markup. */
  clinicLocale?: 'en-US' | 'ko-KR';
}

/** 절대 커버 레이어(배경 이미지/영상 공통) */
const coverStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };

const STACK_MAX = 5; // stacking-cards: 카드 3~5장, 초과분 일반 나열

function coverStyleFor(point?: { x: number; y: number }): CSSProperties {
  if (!point) return coverStyle;
  return {
    ...coverStyle,
    objectPosition: `${Math.round(point.x * 10000) / 100}% ${Math.round(point.y * 10000) / 100}%`,
  };
}

function canvasFrameStyle(frame: { x: number; y: number; w: number; h: number }): CSSProperties {
  return {
    position: 'absolute',
    left: cqw(frame.x),
    top: cqw(frame.y),
    width: cqw(frame.w),
    height: cqw(frame.h),
  };
}

export function SectionCanvas(props: SectionCanvasProps) {
  const { section, plan } = props;
  if (isClinicInsuranceStripSection(section)) {
    return <ClinicInsuranceStrip section={section} theme={props.theme} variant="canvas" />;
  }
  if (props.clinicFlow) {
    return (
      <ClinicFlowSection
        section={section}
        theme={props.theme}
        isFirst={props.isFirst}
        interactive={props.interactive}
        siteId={props.siteId}
        pageHeading={props.clinicPageHeading}
        hrefForPageSlug={props.hrefForPageSlug}
        locale={props.clinicLocale}
        motionPlan={plan}
      />
    );
  }
  if (section.sectionLayout) {
    return (
      <SectionLayoutProjectionRenderer
        section={section}
        theme={props.theme}
        variant="canvas"
        isFirst={props.isFirst}
        interactive={props.interactive}
        plan={props.plan}
        siteId={props.siteId}
      />
    );
  }
  if (isUniformTeaserSection(section)) {
    return <UniformTeaserGrid section={section} theme={props.theme} variant="canvas" interactive={props.interactive ?? true} animate={Boolean(plan)} />;
  }
  // 레이아웃이 발산하는 두 기법은 별도 렌더 분기
  if (section.layout === 'marquee') return <MarqueeSection {...props} animate={plan?.marqueeSections.has(section.id) ?? false} />;
  if (plan?.cinematicHeroSections.has(section.id) && section.background.video?.src) return <CinematicProgressSection {...props} />;
  if (plan?.scrollScrubSections.has(section.id) && section.background.video?.src) return <ScrubSection {...props} />;
  return <StandardSection {...props} />;
}

function StandardSection({
  section,
  theme,
  isFirst,
  interactive = true,
  plan,
  siteId,
  pinned = false,
  cinematicPlayback = false,
  proceduralHero = false,
  integratedTypography = false,
  continuousFlow = false,
}: SectionCanvasProps & { pinned?: boolean; cinematicPlayback?: boolean }) {
  const bg = section.background;
  const elements = [...section.elements].sort((a, b) => a.z - b.z);
  const kenBurns = plan?.kenBurnsSections.has(section.id) ?? false;
  const heroLayout = section.heroLayout;
  const videoHero = (
    (plan?.videoHeroSections.has(section.id) ?? false)
    || heroLayout?.mediaKind === 'video'
  ) && !!bg.video?.src && !!bg.video.poster;
  const parallax = plan?.parallaxSections.has(section.id) ?? false;
  const stacking = plan?.stackingSections.has(section.id) ?? false;
  const spotlight = plan?.spotlightSections.has(section.id) ?? false;
  const sectionDataM = spotlight ? 'spotlight' : parallax ? 'parallax' : stacking ? 'stacking' : undefined;
  const densityDelta = themeSectionBlockDelta(theme);
  const continuousHero = continuousFlow && section.type === 'hero';
  const responsivePhoto = bg.image?.responsivePromotion;
  const heroLayoutBand = heroLayout?.bands.wide;
  // LIB2: 공급 추상은 atmosphere이지 figure가 아니다. role이 없는 저장본은
  // 종전 procedural 경로를 유지해 기존 발행본의 픽셀을 바꾸지 않는다.
  const effectiveProceduralHero = proceduralHero
    && heroLayout?.mediaSlotRole !== 'referential-figure';
  const adaptiveWideScrim = bg.image?.adaptiveScrim?.wide;
  const requestedSurfaceTone = section.surfaceTone ?? section.sectionLayout?.surfaceTone;
  const surfacePaint = requestedSurfaceTone
    ? resolveSectionSurfaceTone(theme, requestedSurfaceTone)
    : null;

  // [Q1] bg.image에 overlayColor가 없으면(레거시 config) 팔레트 기반 기본 스크림 주입 — 텍스트 대비 보호.
  const imgScrim = (!effectiveProceduralHero || responsivePhoto) && bg.image
    ? adaptiveWideScrim
      ? {
          overlayColor: adaptiveWideScrim.overlayColor,
          overlayOpacity: adaptiveWideScrim.overlayOpacity,
        }
      : bg.image.overlayColor
      ? { overlayColor: bg.image.overlayColor, overlayOpacity: bg.image.overlayOpacity ?? 0.45 }
      : ((s) => ({ overlayColor: s.overlayColor, overlayOpacity: s.overlayOpacity }))(resolveScrim(theme.palette))
    : null;
  // 이미지 배경 위 텍스트 가독 보강 — 스크림과 같은 계열 미세 그림자(가는 서체 보호)
  const imgTextShadow = imgScrim ? `0 1px 2px ${imgScrim.overlayColor}` : undefined;

  // stacking: y 상위 STACK_MAX개를 카드로 (reveal 대신 stackcard로 오버라이드)
  const stackCardIds = stacking
    ? new Set([...section.elements].sort((a, b) => a.frame.y - b.frame.y).slice(0, STACK_MAX).map((e) => e.id))
    : null;

  const sectionStyle: CSSProperties = {
    position: 'relative',
    height: pinned ? '100%' : cqw(section.height + densityDelta * 2),
    overflow: continuousHero ? 'visible' : 'hidden',
    backgroundColor: surfacePaint?.background
      ?? resolveThemePaint(theme, bg.color, 'backgroundSubtle'),
    backgroundImage: bg.gradient,
    ...(surfacePaint ? { color: surfacePaint.text } : {}),
  };

  const videoBackdrop = videoHero && bg.video ? (
    <>
      {effectiveProceduralHero && section.proceduralBackground ? (
        <ProceduralBackground
          spec={section.proceduralBackground}
          theme={theme}
          band="wide"
        />
      ) : null}
      {/* poster = 기저 레이어(항상 표시); 영상 로드 실패/reduced-motion 시 그대로 노출 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={safeMediaSrc(bg.video.poster)}
        alt=""
        aria-hidden
        loading={isFirst ? 'eager' : 'lazy'}
        fetchPriority={isFirst ? 'high' : undefined}
        decoding="async"
        style={coverStyle}
      />
      <video
        data-m={cinematicPlayback ? 'cinematicvideo' : 'videohero'}
        {...(cinematicPlayback
          ? { 'data-m-cinematic-video': 'true', 'data-playback': 'scrub' }
          : {})}
        src={safeMediaSrc(bg.video.src)}
        poster={safeMediaSrc(bg.video.poster)}
        muted
        loop={!cinematicPlayback}
        playsInline
        preload="none"
        aria-hidden
        style={coverStyle}
      />
    </>
  ) : null;

  const imageBackdrop = (
    <>
      {effectiveProceduralHero && (
        section.proceduralBackground
          ? (
              <ProceduralBackground
                spec={section.proceduralBackground}
                theme={theme}
                band="wide"
              />
            )
          : <div aria-hidden data-site-cine-procedural-hero />
      )}
      {bg.image && (responsivePhoto ? (
        <ResponsiveHeroPhoto
          src={bg.image.src}
          alt=""
          promotion={responsivePhoto}
          focalPoint={bg.image.focalPoint}
          compactFocalPoint={bg.image.compactFocalPoint}
          mobileFocalPoint={bg.image.mobileFocalPoint}
          loading={isFirst ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={isFirst ? 'high' : undefined}
          imageData={kenBurns ? { 'data-m': 'kenburns' } : undefined}
        />
      ) : !effectiveProceduralHero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bg.image.src}
          alt=""
          aria-hidden
          loading={isFirst ? 'eager' : 'lazy'}
          decoding="async"
          {...(kenBurns ? { 'data-m': 'kenburns' } : {})}
          style={coverStyleFor(bg.image.focalPoint)}
        />
      ) : null)}
    </>
  );
  const backdrop = videoBackdrop
    ? cinematicPlayback
      ? <div data-m-cinematic-media style={coverStyle}>{videoBackdrop}</div>
      : videoBackdrop
    : imageBackdrop;
  const heroLayoutScrim = heroLayout
    ? heroLayout.scrim === 'subtle-scrim' ? imgScrim : null
    : null;

  return (
    <section
      id={section.id}
      data-section-type={section.type}
      {...(surfacePaint
        ? { 'data-section-surface-tone': surfacePaint.resolvedTone }
        : {})}
      {...(continuousHero ? { 'data-continuous-hero-stage': 'true' } : {})}
      aria-label={section.name}
      {...(sectionDataM ? { 'data-m': sectionDataM } : {})}
      style={sectionStyle}
    >
      {heroLayoutBand?.panelFrame ? (
        <div
          aria-hidden
          data-hero-layout-panel
          style={{
            ...canvasFrameStyle(heroLayoutBand.panelFrame),
            zIndex: 1,
            backgroundColor: surfacePaint?.surface
              ?? resolveThemePaint(theme, theme.palette.surface, 'surfaceStrong'),
            borderRadius: theme.tokens?.radius.soft ?? cqw(theme.radius ?? 0),
          }}
        />
      ) : null}
      {heroLayoutBand?.mediaFrame ? (
        <div
          data-hero-layout-media
          style={{
            ...canvasFrameStyle(heroLayoutBand.mediaFrame),
            zIndex: 0,
            overflow: 'hidden',
            borderRadius: heroLayout?.resolvedId.includes('fullbleed')
              || heroLayout?.resolvedId === 'hero.overlay-bottom-left'
              || heroLayout?.resolvedId === 'hero.video-scrim'
              ? undefined
              : theme.tokens?.radius.soft ?? cqw(theme.radius ?? 0),
          }}
        >
          {backdrop}
          {heroLayoutScrim && (
            <div
              aria-hidden
              {...(adaptiveWideScrim
                ? {
                    'data-adaptive-image-scrim': 'wide',
                    'data-minimum-contrast': adaptiveWideScrim.minimumContrast.toFixed(2),
                  }
                : {})}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: heroLayoutScrim.overlayColor,
                opacity: heroLayoutScrim.overlayOpacity,
              }}
            />
          )}
        </div>
      ) : backdrop}
      {!heroLayout && imgScrim && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundColor: imgScrim.overlayColor, opacity: imgScrim.overlayOpacity }} />
      )}
      {continuousHero && <div aria-hidden="true" data-continuous-hero-bridge />}
      {elements.map((el, elementIndex) => {
        const m = plan ? motionFor(plan, section.id, el.id) : undefined;
        const countup = m === 'countup' && el.kind === 'text' ? parseStatParts(el.text) ?? undefined : undefined;
        const splitText = plan ? isSplitText(plan, section.id, el.id) : false;
        const hoverVideo = m === 'hovervideo';
        const isCard = stackCardIds?.has(el.id) ?? false;
        // 우선순위: stackcard > mask > reveal (countup/hovervideo/split은 요소 내부에서 처리)
        const dataM = isCard ? 'stackcard' : m === 'mask' ? 'mask' : m === 'reveal' ? 'reveal' : undefined;
        const delay =
          isCard ? [...(stackCardIds ?? [])].indexOf(el.id) * 90
          : m === 'reveal' && plan ? revealDelayFor(plan, section.id, el.id)
          : undefined;
        const depth = parallax && plan ? parallaxDepthFor(plan, section.id, el.id) : undefined;
        const cinematicDepth = cinematicPlayback && plan ? cinematicParallaxDepthFor(plan, section.id, el.id) : undefined;
        const storyWindow = cinematicPlayback && plan ? cinematicStoryWindowFor(plan, section.id, el.id) : undefined;
        const flowRole = continuousFlow ? continuousFlowLayerRoleFor(el) : undefined;
        const heroForeground = continuousHero && (flowRole === 'copy' || flowRole === 'action');
        const content = (
          <ElementContent
            element={el}
            theme={theme}
            variant="canvas"
            eager={isFirst}
            interactive={interactive}
            siteId={siteId}
            countup={countup}
            splitText={splitText}
            splitTextMode={cinematicPlayback ? 'progress' : 'io'}
            hoverVideo={hoverVideo}
            layoutFontSize={heroLayoutBand?.fontSizes[el.id] != null
              ? cqw(heroLayoutBand.fontSizes[el.id])
              : undefined}
            layoutAlign={heroLayoutBand?.align}
            layoutFillFrame={Boolean(heroLayoutBand && el.kind === 'button')}
          />
        );
        return (
          <div
            key={el.id}
            {...(bg.image?.adaptiveScrim && el.kind === 'text'
              ? { 'data-image-contrast-foreground': el.id }
              : {})}
            {...(integratedTypography && section.type === 'hero' && el.kind === 'text'
              ? { 'data-site-cine-hero-copy': true }
              : {})}
            {...(heroForeground ? { 'data-continuous-hero-foreground': flowRole } : {})}
            {...(dataM ? { 'data-m': dataM } : {})}
            {...(delay != null ? { 'data-m-delay': String(delay) } : {})}
            {...(depth != null ? { 'data-m-depth': String(depth) } : {})}
            style={{
              position: 'absolute',
              left: cqw(el.frame.x),
              top: cqw(el.frame.y + densityDelta),
              width: cqw(el.frame.w),
              height: cqw(el.frame.h),
              // FLOW bridge is a background transition at z:5. Copy/actions stay
              // structurally above it regardless of customer-editable element z.
              zIndex: heroForeground ? Math.max(el.z, 6) : el.z,
              opacity: el.opacity,
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              textShadow: el.kind === 'text' ? imgTextShadow : undefined,
            }}
          >
            {flowRole ? (
              <div data-flow-layer={flowRole} data-flow-order={elementIndex}>
                {cinematicDepth != null || storyWindow ? (
                  <div
                    {...(cinematicDepth != null
                      ? { 'data-m-cinematic-layer': 'true', 'data-m-depth': String(cinematicDepth) }
                      : {})}
                    {...(storyWindow
                      ? { 'data-m-story': 'true', 'data-story-start': storyWindow.start.toFixed(4), 'data-story-end': storyWindow.end.toFixed(4) }
                      : {})}
                    style={{ width: '100%', height: '100%' }}
                  >
                    {content}
                  </div>
                ) : content}
              </div>
            ) : cinematicDepth != null || storyWindow ? (
              <div
                {...(cinematicDepth != null
                  ? { 'data-m-cinematic-layer': 'true', 'data-m-depth': String(cinematicDepth) }
                  : {})}
                {...(storyWindow
                  ? { 'data-m-story': 'true', 'data-story-start': storyWindow.start.toFixed(4), 'data-story-end': storyWindow.end.toFixed(4) }
                  : {})}
                style={{ width: '100%', height: '100%' }}
              >
                {content}
              </div>
            ) : content}
          </div>
        );
      })}
    </section>
  );
}

/**
 * [V2] 시네마틱 진행도 컨테이너. 네이티브 sticky만 사용하며 스크롤을 가로채지 않는다.
 * 실제 영상 scrub/모바일 loop/서사 변환은 V3·V4에서 같은 --scroll-progress를 소비한다.
 */
function CinematicProgressSection(props: SectionCanvasProps) {
  const { section, theme } = props;
  const densityDelta = themeSectionBlockDelta(theme);
  return (
    <div
      data-m="cinematic"
      data-m-progress
      data-cinematic-layout="desktop"
      style={{
        position: 'relative',
        height: 'var(--cinematic-static-height)',
        '--scroll-progress': 0,
        '--cinematic-static-height': cqw(section.height + densityDelta * 2),
        '--cinematic-scroll-height': cqw((section.height + densityDelta * 2) * 3),
      } as CSSProperties}
    >
      <div
        data-m-pin
        style={{ overflow: 'hidden' }}
      >
        <StandardSection {...props} pinned cinematicPlayback />
      </div>
    </div>
  );
}

/**
 * [motion 3단계] marquee — 흐름 띠(비파괴: frame 무시, x오름차순 나열). animate면 트랙 복제로
 * 심리스 루프(복제는 aria-hidden), 아니면 정적 나열. layout==='marquee'이면 애니 여부와 무관하게 흐름 렌더.
 */
function MarqueeSection({ section, theme, isFirst, interactive = true, siteId, animate }: SectionCanvasProps & { animate: boolean }) {
  const items = [...section.elements].sort((a, b) => a.frame.x - b.frame.x || a.frame.y - b.frame.y);
  const densityDelta = themeSectionBlockDelta(theme);
  const requestedSurfaceTone = section.surfaceTone ?? section.sectionLayout?.surfaceTone;
  const surfacePaint = requestedSurfaceTone
    ? resolveSectionSurfaceTone(theme, requestedSurfaceTone)
    : null;
  const group = (clone: boolean) => (
    <div className="anaks-mq-group" aria-hidden={clone || undefined} style={{ display: 'flex', alignItems: 'center', gap: cqw(56), paddingRight: cqw(56) }}>
      {items.map((el) => (
        <div key={(clone ? 'c-' : '') + el.id} style={{ flex: '0 0 auto', width: cqw(el.frame.w), height: cqw(el.frame.h) }}>
          <ElementContent element={el} theme={theme} variant="canvas" eager={isFirst} interactive={interactive} siteId={siteId} />
        </div>
      ))}
    </div>
  );
  return (
    <section
      id={section.id}
      data-section-type={section.type}
      {...(surfacePaint
        ? { 'data-section-surface-tone': surfacePaint.resolvedTone }
        : {})}
      aria-label={section.name}
      {...(animate ? { 'data-m': 'marquee' } : {})}
      style={{
        position: 'relative',
        minHeight: cqw(Math.min(section.height + densityDelta * 2, 240 + densityDelta * 2)),
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        backgroundColor: surfacePaint?.background
          ?? resolveThemePaint(theme, section.background.color, 'backgroundSubtle'),
        backgroundImage: section.background.gradient,
        ...(surfacePaint ? { color: surfacePaint.text } : {}),
      }}
    >
      <div className="anaks-mq">
        {animate ? (
          <div className="anaks-mq-track">
            {group(false)}
            {group(true)}
          </div>
        ) : (
          <div className="anaks-mq-track" style={{ width: '100%', justifyContent: 'center' }}>
            {group(false)}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * [motion 3단계] scroll-scrub — pin(높이 3배 컨테이너 + sticky) + 스크롤 진행도→video.currentTime(런타임).
 * 인코딩 요구: 스크럽 대상 영상은 촘촘한 키프레임(-g 1)로 인코딩해야 부드럽다(에셋 검증 경고 대상).
 * 현재 어떤 프리셋도 scroll-scrub을 포함하지 않음(3단계 이월) — bg.video 있는 섹션에서만 발동.
 */
function ScrubSection({ section, theme, interactive = true, siteId, isFirst }: SectionCanvasProps) {
  const v = section.background.video!;
  const elements = [...section.elements].sort((a, b) => a.z - b.z);
  const densityDelta = themeSectionBlockDelta(theme);
  const requestedSurfaceTone = section.surfaceTone ?? section.sectionLayout?.surfaceTone;
  const surfacePaint = requestedSurfaceTone
    ? resolveSectionSurfaceTone(theme, requestedSurfaceTone)
    : null;
  return (
    <div data-m="scrollscrub" style={{ position: 'relative', height: cqw((section.height + densityDelta * 2) * 3) }}>
      <section
        id={section.id}
        data-section-type={section.type}
        {...(surfacePaint
          ? { 'data-section-surface-tone': surfacePaint.resolvedTone }
          : {})}
        aria-label={section.name}
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: surfacePaint?.background
            ?? resolveThemePaint(theme, section.background.color, 'backgroundSubtle'),
          ...(surfacePaint ? { color: surfacePaint.text } : {}),
        }}
      >
        <video data-m-scrub src={safeMediaSrc(v.src)} poster={safeMediaSrc(v.poster)} muted playsInline preload="none" aria-hidden style={coverStyle} />
        {elements.map((el) => (
          <div
            key={el.id}
            style={{ position: 'absolute', left: cqw(el.frame.x), top: cqw(el.frame.y + densityDelta), width: cqw(el.frame.w), height: cqw(el.frame.h), zIndex: el.z, opacity: el.opacity }}
          >
            <ElementContent element={el} theme={theme} variant="canvas" eager={isFirst} interactive={interactive} siteId={siteId} />
          </div>
        ))}
      </section>
    </div>
  );
}
