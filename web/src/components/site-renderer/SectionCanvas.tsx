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
  cinematicParallaxDepthFor,
  cinematicStoryWindowFor,
  motionFor,
  revealDelayFor,
  parseStatParts,
  parallaxDepthFor,
  isSplitText,
  type MotionPlan,
} from '@/lib/motion/apply';

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
}

/** 절대 커버 레이어(배경 이미지/영상 공통) */
const coverStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };

const STACK_MAX = 5; // stacking-cards: 카드 3~5장, 초과분 일반 나열

export function SectionCanvas(props: SectionCanvasProps) {
  const { section, plan } = props;
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
}: SectionCanvasProps & { pinned?: boolean; cinematicPlayback?: boolean }) {
  const bg = section.background;
  const elements = [...section.elements].sort((a, b) => a.z - b.z);
  const kenBurns = plan?.kenBurnsSections.has(section.id) ?? false;
  const videoHero = (plan?.videoHeroSections.has(section.id) ?? false) && !!bg.video?.src && !!bg.video.poster;
  const parallax = plan?.parallaxSections.has(section.id) ?? false;
  const stacking = plan?.stackingSections.has(section.id) ?? false;
  const spotlight = plan?.spotlightSections.has(section.id) ?? false;
  const sectionDataM = spotlight ? 'spotlight' : parallax ? 'parallax' : stacking ? 'stacking' : undefined;

  // [Q1] bg.image에 overlayColor가 없으면(레거시 config) 팔레트 기반 기본 스크림 주입 — 텍스트 대비 보호.
  const imgScrim = bg.image
    ? bg.image.overlayColor
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
    height: pinned ? '100%' : cqw(section.height),
    overflow: 'hidden',
    backgroundColor: bg.color ?? theme.palette.background,
    backgroundImage: bg.gradient,
  };

  const videoBackdrop = videoHero && bg.video ? (
    <>
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
        muted
        loop={!cinematicPlayback}
        playsInline
        preload="none"
        aria-hidden
        style={coverStyle}
      />
    </>
  ) : null;

  return (
    <section
      id={section.id}
      data-section-type={section.type}
      aria-label={section.name}
      {...(sectionDataM ? { 'data-m': sectionDataM } : {})}
      style={sectionStyle}
    >
      {videoBackdrop ? (
        cinematicPlayback ? (
          <div data-m-cinematic-media style={coverStyle}>{videoBackdrop}</div>
        ) : videoBackdrop
      ) : (
        bg.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bg.image.src}
            alt=""
            aria-hidden
            loading={isFirst ? 'eager' : 'lazy'}
            decoding="async"
            {...(kenBurns ? { 'data-m': 'kenburns' } : {})}
            style={coverStyle}
          />
        )
      )}
      {imgScrim && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundColor: imgScrim.overlayColor, opacity: imgScrim.overlayOpacity }} />
      )}
      {elements.map((el) => {
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
          />
        );
        return (
          <div
            key={el.id}
            {...(dataM ? { 'data-m': dataM } : {})}
            {...(delay != null ? { 'data-m-delay': String(delay) } : {})}
            {...(depth != null ? { 'data-m-depth': String(depth) } : {})}
            style={{
              position: 'absolute',
              left: cqw(el.frame.x),
              top: cqw(el.frame.y),
              width: cqw(el.frame.w),
              height: cqw(el.frame.h),
              zIndex: el.z, // spotlight ::before(z:0)는 DOM 순서상 요소보다 먼저 → 요소가 위
              opacity: el.opacity,
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              textShadow: el.kind === 'text' ? imgTextShadow : undefined,
            }}
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
    </section>
  );
}

/**
 * [V2] 시네마틱 진행도 컨테이너. 네이티브 sticky만 사용하며 스크롤을 가로채지 않는다.
 * 실제 영상 scrub/모바일 loop/서사 변환은 V3·V4에서 같은 --scroll-progress를 소비한다.
 */
function CinematicProgressSection(props: SectionCanvasProps) {
  const { section } = props;
  return (
    <div
      data-m="cinematic"
      data-m-progress
      data-cinematic-layout="desktop"
      style={{
        position: 'relative',
        height: 'var(--cinematic-static-height)',
        '--scroll-progress': 0,
        '--cinematic-static-height': cqw(section.height),
        '--cinematic-scroll-height': cqw(section.height * 3),
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
      aria-label={section.name}
      {...(animate ? { 'data-m': 'marquee' } : {})}
      style={{
        position: 'relative',
        minHeight: cqw(Math.min(section.height, 240)),
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        backgroundColor: section.background.color ?? theme.palette.background,
        backgroundImage: section.background.gradient,
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
  return (
    <div data-m="scrollscrub" style={{ position: 'relative', height: cqw(section.height * 3) }}>
      <section
        id={section.id}
        data-section-type={section.type}
        aria-label={section.name}
        style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', backgroundColor: section.background.color ?? theme.palette.background }}
      >
        <video data-m-scrub src={safeMediaSrc(v.src)} poster={safeMediaSrc(v.poster)} muted playsInline preload="none" aria-hidden style={coverStyle} />
        {elements.map((el) => (
          <div
            key={el.id}
            style={{ position: 'absolute', left: cqw(el.frame.x), top: cqw(el.frame.y), width: cqw(el.frame.w), height: cqw(el.frame.h), zIndex: el.z, opacity: el.opacity }}
          >
            <ElementContent element={el} theme={theme} variant="canvas" eager={isFirst} interactive={interactive} siteId={siteId} />
          </div>
        ))}
      </section>
    </div>
  );
}
