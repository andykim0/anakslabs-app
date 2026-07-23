/**
 * 모바일 섹션 렌더 — 축소가 아니라 "재배치".
 * hiddenOnMobile 제외, stackOrder로 카드 단위(시각적 클러스터)를 보존해 세로 스택([F2a]).
 * 텍스트 중앙 정렬 보정, 이미지/영상 풀폭(원본 비율 유지), 버튼 탭 타깃 확보.
 * 순수 장식용 shape(rect/ellipse)는 스택에서 의미가 없어 제외 — line은 구분선으로 유지.
 */
import type { CSSProperties } from 'react';
import type { CanvasElement, Section, SiteTheme } from '@/lib/types/site';
import { ElementContent } from './ElementContent';
import { stackOrder } from './stack-order';
import { resolveScrim } from '@/lib/design/scrim';
import {
  cinematicParallaxDepthFor,
  cinematicStoryWindowFor,
  isSplitText,
  motionFor,
  revealDelayFor,
  parseStatParts,
  type MotionPlan,
} from '@/lib/motion/apply';
import { safeMediaSrc } from '@/lib/safe-url';
import { resolveThemePaint } from '@/lib/design/site-theme-tokens';
import { isUniformTeaserSection, UniformTeaserGrid } from './UniformTeaserGrid';
import { continuousFlowLayerRoleFor } from '@/lib/motion/site-cinematic';
import { ResponsiveHeroPhoto } from './ResponsiveHeroPhoto';

interface SectionStackProps {
  section: Section;
  theme: SiteTheme;
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
}

function stackable(el: CanvasElement): boolean {
  if (el.hiddenOnMobile) return false;
  // Provenance enforcement replaces a denied factual image with an intentional
  // CSS shape that occupies the original media frame. Keep that shape in the
  // mobile stack; ordinary decorative shapes remain omitted as before.
  if (el.kind === 'shape' && el.shape !== 'line' && !hasAssetFallback(el)) return false;
  return true;
}

function hasAssetFallback(el: CanvasElement): boolean {
  return el.kind === 'shape' && el.assetFallback === true;
}

function imageObjectPosition(point?: { x: number; y: number }): string | undefined {
  return point
    ? `${Math.round(point.x * 10000) / 100}% ${Math.round(point.y * 10000) / 100}%`
    : undefined;
}

/** 요소 종류별 스택 아이템 래퍼 스타일 */
function itemStyle(el: CanvasElement): CSSProperties {
  const base: CSSProperties = { opacity: el.opacity };
  switch (el.kind) {
    case 'image':
    case 'video':
      return {
        ...base,
        width: '100%',
        // 프레임 비율 유지 (0 방어)
        aspectRatio: el.frame.h > 0 ? `${el.frame.w} / ${el.frame.h}` : undefined,
      };
    case 'button':
      return { ...base, display: 'flex', justifyContent: 'center' };
    case 'divider':
      return { ...base, width: '56%', height: '16px' };
    case 'shape':
      return hasAssetFallback(el)
        ? {
            ...base,
            width: '100%',
            // Keep the rejected asset's reserved geometry in the no-JS/mobile
            // fallback instead of collapsing it into a decorative divider.
            aspectRatio: el.frame.h > 0 ? `${el.frame.w} / ${el.frame.h}` : undefined,
          }
        : { ...base, width: '56%', height: '16px' };
    // [v3 Phase 3] 지도는 스택에서 고정 높이 240px
    case 'map':
      return { ...base, width: '100%', height: '240px' };
    case 'socialLinks':
      return { ...base, width: '100%', minHeight: `${el.style.size ?? 40}px` };
    case 'form':
      return { ...base, width: '100%' };
    default:
      return { ...base, width: '100%' };
  }
}

export function SectionStack({
  section,
  theme,
  isFirst,
  interactive = true,
  plan,
  siteId,
  proceduralHero = false,
  integratedTypography = false,
  continuousFlow = false,
}: SectionStackProps) {
  if (isUniformTeaserSection(section)) {
    return <UniformTeaserGrid section={section} theme={theme} variant="stack" interactive={interactive} animate={Boolean(plan)} />;
  }
  const bg = section.background;
  // [F2a] 카드 단위(시각적 클러스터)를 보존한 세로 스택 순서 (전역 y정렬로 인한 유형별 분리 방지)
  const elements = stackOrder(section.elements.filter(stackable));
  const longHeroFlow = section.type === 'hero' && elements.some((element) => (
    element.kind === 'text'
    && element.id.includes('hero-title')
    && element.style.readabilityGuard === 'long-hero'
  ));
  // HERO2 R1: sectionInline 바깥 여백에 더해 장문 카피 자체에도 DNA 간격 한
  // 단계를 안전영역으로 예약한다. 아래 공용 foreground는 일반·continuous·
  // cinematic 모바일 경로가 모두 소비하므로 특정 무대에서만 빠질 수 없다.
  const longHeroSafeInline = longHeroFlow
    ? theme.tokens?.spacing.elementGap
    : undefined;
  const kenBurns = plan?.kenBurnsSections.has(section.id) ?? false;
  const cinematic = (plan?.cinematicHeroSections.has(section.id) ?? false) && !!bg.video?.src && !!bg.video.poster;
  // 일반 video-hero는 모바일 poster 정적. cinematic만 IO 진입 시 pinned loop로 향상한다.
  const videoHero = (plan?.videoHeroSections.has(section.id) ?? false) && !!bg.video?.poster;
  const responsivePhoto = bg.image?.responsivePromotion;
  const bgImgSrc = proceduralHero && !responsivePhoto
    ? undefined
    : videoHero
      ? bg.video!.poster!
      : bg.image?.src;
  // [Q1] overlayColor 없으면 팔레트 기반 기본 스크림(레거시 보호) + 이미지 배경 텍스트 미세 그림자
  const imgScrim = (!proceduralHero || responsivePhoto) && bg.image
    ? bg.image.overlayColor
      ? { overlayColor: bg.image.overlayColor, overlayOpacity: bg.image.overlayOpacity ?? 0.45 }
      : ((s) => ({ overlayColor: s.overlayColor, overlayOpacity: s.overlayOpacity }))(resolveScrim(theme.palette))
    : null;
  const imgTextShadow = imgScrim ? `0 1px 2px ${imgScrim.overlayColor}` : undefined;

  const cinematicScrim = cinematic
    ? imgScrim ?? ((s) => ({ overlayColor: s.overlayColor, overlayOpacity: s.overlayOpacity }))(resolveScrim(theme.palette))
    : null;
  const continuousHero = continuousFlow && section.type === 'hero';

  if (elements.length === 0 && !bgImgSrc && !proceduralHero) return null;

  const contentSection = (
    <section
      // [T1] 모바일 앵커 타깃 — id는 데스크톱 레이아웃(SectionCanvas)이 보유(중복 id 방지).
      // auto 모드에서 hidden 데스크톱 섹션이 앵커를 선점하는 문제는 SiteRenderer의 앵커 런타임이
      // data-anchor 중 '보이는' 요소로 스크롤해 해소.
      data-anchor={section.id}
      data-section-type={section.type}
      {...(continuousHero ? { 'data-continuous-hero-stage': 'true' } : {})}
      style={{
        position: 'relative',
        overflow: continuousHero ? 'visible' : 'hidden',
        backgroundColor: cinematic
          ? 'transparent'
          : resolveThemePaint(theme, bg.color, 'backgroundSubtle'),
        backgroundImage: cinematic ? undefined : bg.gradient,
        padding: theme.tokens
          ? `${theme.tokens.spacing.sectionBlock} ${theme.tokens.spacing.sectionInline}`
          : '64px 24px',
        // 요소 없이 배경 이미지만 있는 섹션은 이미지 밴드로
        minHeight: elements.length === 0 ? '52vw' : undefined,
        zIndex: cinematic ? 1 : undefined,
      }}
    >
      {!cinematic && proceduralHero && <div aria-hidden data-site-cine-procedural-hero />}
      {!cinematic && bgImgSrc && responsivePhoto && bg.image ? (
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
      ) : !cinematic && bgImgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgImgSrc}
          alt=""
          aria-hidden
          loading={isFirst ? 'eager' : 'lazy'}
          decoding="async"
          {...(kenBurns ? { 'data-m': 'kenburns' } : {})}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            ...(bg.image?.mobileFocalPoint || bg.image?.focalPoint
              ? { objectPosition: imageObjectPosition(bg.image.mobileFocalPoint ?? bg.image.focalPoint) }
              : {}),
          }}
        />
      ) : null}
      {!cinematic && imgScrim && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: imgScrim.overlayColor,
            opacity: imgScrim.overlayOpacity,
          }}
        />
      )}
      {continuousHero && <div aria-hidden="true" data-continuous-hero-bridge />}
      <div
        {...(continuousHero ? { 'data-continuous-hero-foreground': 'stack' } : {})}
        {...(longHeroSafeInline ? { 'data-hero-copy-safe-inline': 'dna-element-gap' } : {})}
        style={{
          position: 'relative',
          zIndex: continuousHero ? 6 : 1,
          width: '100%',
          maxWidth: '560px',
          margin: '0 auto',
          paddingInline: longHeroSafeInline,
          boxSizing: longHeroSafeInline ? 'border-box' : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: theme.tokens?.spacing.elementGap ?? '20px',
        }}
      >
        {elements.map((el, elementIndex) => {
          const m = plan ? motionFor(plan, section.id, el.id) : undefined;
          const countup = m === 'countup' && el.kind === 'text' ? parseStatParts(el.text) ?? undefined : undefined;
          // 모바일 hover-video: hover 불가 → autoplay 끄고 poster 정적 유지(대역폭 절약)
          const hoverVideo = m === 'hovervideo';
          const dataM = m === 'reveal' || m === 'mask' ? m : undefined;
          const delay = m === 'reveal' && plan ? revealDelayFor(plan, section.id, el.id) : undefined;
          const splitText = cinematic && plan ? isSplitText(plan, section.id, el.id) : false;
          const storyWindow = cinematic && plan ? cinematicStoryWindowFor(plan, section.id, el.id) : undefined;
          const cinematicDepth = cinematic && plan ? cinematicParallaxDepthFor(plan, section.id, el.id) : undefined;
          const flowRole = continuousFlow ? continuousFlowLayerRoleFor(el) : undefined;
          const content = (
            <ElementContent
              element={el}
              theme={theme}
              variant="stack"
              eager={isFirst}
              interactive={interactive}
              siteId={siteId}
              countup={countup}
              splitText={splitText}
              splitTextMode={cinematic ? 'progress' : 'io'}
              hoverVideo={hoverVideo}
            />
          );
          return (
            <div
              key={el.id}
              {...(integratedTypography && section.type === 'hero' && el.kind === 'text'
                ? { 'data-site-cine-hero-copy': true }
                : {})}
              {...(hasAssetFallback(el) ? { 'data-asset-fallback': 'true' } : {})}
              {...(dataM ? { 'data-m': dataM } : {})}
              {...(delay != null ? { 'data-m-delay': String(delay) } : {})}
              style={longHeroFlow
                ? {
                    ...itemStyle(el),
                    minWidth: 0,
                    maxWidth: '100%',
                    ...(el.kind === 'text' && imgTextShadow ? { textShadow: imgTextShadow } : {}),
                  }
                : el.kind === 'text' && imgTextShadow
                  ? { ...itemStyle(el), textShadow: imgTextShadow }
                  : itemStyle(el)}
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
      </div>
    </section>
  );

  if (!cinematic || !bg.video?.src || !bg.video.poster) return contentSection;

  return (
    <div
      data-m="cinematic"
      data-m-progress
      data-cinematic-layout="mobile"
      style={{
        position: 'relative',
        overflow: 'clip',
        backgroundColor: resolveThemePaint(theme, bg.color, 'backgroundSubtle'),
        backgroundImage: bg.gradient,
        '--scroll-progress': 0,
      } as CSSProperties}
    >
      <div data-m-mobile-pin>
        {/* no-JS/reduced/load-error의 영구 기저 레이어 */}
        <div data-m-cinematic-media style={{ position: 'absolute', inset: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={safeMediaSrc(bg.video.poster)}
            alt=""
            aria-hidden
            loading={isFirst ? 'eager' : 'lazy'}
            fetchPriority={isFirst ? 'high' : undefined}
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <video
            data-m="cinematicvideo"
            data-m-cinematic-video="true"
            data-playback="loop"
            src={safeMediaSrc(bg.video.src)}
            poster={safeMediaSrc(bg.video.poster)}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        {cinematicScrim && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: cinematicScrim.overlayColor,
              opacity: cinematicScrim.overlayOpacity,
            }}
          />
        )}
      </div>
      {contentSection}
    </div>
  );
}
