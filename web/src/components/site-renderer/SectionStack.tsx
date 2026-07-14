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
}

function stackable(el: CanvasElement): boolean {
  if (el.hiddenOnMobile) return false;
  if (el.kind === 'shape' && el.shape !== 'line') return false;
  return true;
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
    case 'shape':
      return { ...base, width: '56%', height: '16px' };
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

export function SectionStack({ section, theme, isFirst, interactive = true, plan, siteId }: SectionStackProps) {
  const bg = section.background;
  // [F2a] 카드 단위(시각적 클러스터)를 보존한 세로 스택 순서 (전역 y정렬로 인한 유형별 분리 방지)
  const elements = stackOrder(section.elements.filter(stackable));
  const kenBurns = plan?.kenBurnsSections.has(section.id) ?? false;
  const cinematic = (plan?.cinematicHeroSections.has(section.id) ?? false) && !!bg.video?.src && !!bg.video.poster;
  // 일반 video-hero는 모바일 poster 정적. cinematic만 IO 진입 시 pinned loop로 향상한다.
  const videoHero = (plan?.videoHeroSections.has(section.id) ?? false) && !!bg.video?.poster;
  const bgImgSrc = videoHero ? bg.video!.poster! : bg.image?.src;
  // [Q1] overlayColor 없으면 팔레트 기반 기본 스크림(레거시 보호) + 이미지 배경 텍스트 미세 그림자
  const imgScrim = bg.image
    ? bg.image.overlayColor
      ? { overlayColor: bg.image.overlayColor, overlayOpacity: bg.image.overlayOpacity ?? 0.45 }
      : ((s) => ({ overlayColor: s.overlayColor, overlayOpacity: s.overlayOpacity }))(resolveScrim(theme.palette))
    : null;
  const imgTextShadow = imgScrim ? `0 1px 2px ${imgScrim.overlayColor}` : undefined;

  const cinematicScrim = cinematic
    ? imgScrim ?? ((s) => ({ overlayColor: s.overlayColor, overlayOpacity: s.overlayOpacity }))(resolveScrim(theme.palette))
    : null;

  if (elements.length === 0 && !bgImgSrc) return null;

  const contentSection = (
    <section
      // [T1] 모바일 앵커 타깃 — id는 데스크톱 레이아웃(SectionCanvas)이 보유(중복 id 방지).
      // auto 모드에서 hidden 데스크톱 섹션이 앵커를 선점하는 문제는 SiteRenderer의 앵커 런타임이
      // data-anchor 중 '보이는' 요소로 스크롤해 해소.
      data-anchor={section.id}
      data-section-type={section.type}
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: cinematic ? 'transparent' : (bg.color ?? theme.palette.background),
        backgroundImage: cinematic ? undefined : bg.gradient,
        padding: '64px 24px',
        // 요소 없이 배경 이미지만 있는 섹션은 이미지 밴드로
        minHeight: elements.length === 0 ? '52vw' : undefined,
        zIndex: cinematic ? 1 : undefined,
      }}
    >
      {!cinematic && bgImgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgImgSrc}
          alt=""
          aria-hidden
          loading={isFirst ? 'eager' : 'lazy'}
          decoding="async"
          {...(kenBurns ? { 'data-m': 'kenburns' } : {})}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
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
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '560px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {elements.map((el) => {
          const m = plan ? motionFor(plan, section.id, el.id) : undefined;
          const countup = m === 'countup' && el.kind === 'text' ? parseStatParts(el.text) ?? undefined : undefined;
          // 모바일 hover-video: hover 불가 → autoplay 끄고 poster 정적 유지(대역폭 절약)
          const hoverVideo = m === 'hovervideo';
          const dataM = m === 'reveal' || m === 'mask' ? m : undefined;
          const delay = m === 'reveal' && plan ? revealDelayFor(plan, section.id, el.id) : undefined;
          const splitText = cinematic && plan ? isSplitText(plan, section.id, el.id) : false;
          const storyWindow = cinematic && plan ? cinematicStoryWindowFor(plan, section.id, el.id) : undefined;
          const cinematicDepth = cinematic && plan ? cinematicParallaxDepthFor(plan, section.id, el.id) : undefined;
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
              {...(dataM ? { 'data-m': dataM } : {})}
              {...(delay != null ? { 'data-m-delay': String(delay) } : {})}
              style={el.kind === 'text' && imgTextShadow ? { ...itemStyle(el), textShadow: imgTextShadow } : itemStyle(el)}
            >
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
        backgroundColor: bg.color ?? theme.palette.background,
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
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <video
            data-m="cinematicvideo"
            data-m-cinematic-video="true"
            data-playback="loop"
            src={safeMediaSrc(bg.video.src)}
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
