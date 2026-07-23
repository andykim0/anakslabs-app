/**
 * 발행된 SiteConfig → 실제 사이트 렌더 (서버 컴포넌트, JS 최소).
 *
 * 스케일링 전략:
 *  - 루트에 `container-type: inline-size` → 하위의 모든 cqw 단위가
 *    루트 폭 기준 퍼센트로 해석된다. 좌표/크기/폰트를 px/1440*100 cqw로
 *    환산하면 어떤 폭에서도 1440 디자인이 비례 축소/확대 (SSR 안전, JS 측정 0).
 *  - 대시보드 미리보기에서 좁은 컨테이너에 넣어도 그대로 비례 렌더.
 *
 * mode:
 *  - 'desktop' | 'mobile': 해당 레이아웃만 (에디터/대시보드 미리보기용)
 *  - 'auto'(기본): 두 레이아웃을 모두 렌더하고 Tailwind 브레이크포인트로 전환.
 *    1440 고정 캔버스가 읽기 어려울 만큼 축소되지 않도록 <1280px는 세로 스택 재배치.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { MotionTier, Section, SiteConfig } from '@/lib/types/site';
import { findPage, homePage } from '@/lib/types/site';
import { resolveMotionPlan, intensityFactors, planIsActive } from '@/lib/motion/apply';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';
import { ANCHOR_RUNTIME } from '@/lib/motion/anchor-runtime';
import {
  motionContextFromConfig,
  resolveMotionArtDirectionProfile,
  resolveMotionSignaturePlan,
  type MotionAssetProvenance,
} from '@/lib/motion/signatures';
import { googleFontUrls, needsPretendard, PRETENDARD_CSS_URL } from './fonts';
import { SectionCanvas } from './SectionCanvas';
import { SectionStack } from './SectionStack';
import { ScrollytellingStage } from './ScrollytellingStage';
import {
  consumedSectionIds,
  isRenderableMotionScene,
  MotionSignatureRenderer,
  sceneSourceSectionsAreSafe,
} from './MotionSignatureRenderer';
import { motionSceneMayOwnLcp } from '@/lib/export/motion-scene-assets';
import { SiteRuntimeBootstrap } from './SiteRuntimeBootstrap';
import { themeColor } from '@/lib/design/site-theme-tokens';
import { continuousCanvasIsEnabled, siteCinematicIsEnabled } from '@/lib/motion/site-cinematic';
import { StoryProgressRail } from '@/components/motion/StoryProgressRail';
import { signatureContractEnabled } from '@/lib/motion/signature-contract';

export type SiteRendererMode = 'desktop' | 'mobile' | 'auto';

/** 사이트 공통 베이스 CSS — hover 마이크로 인터랙션은 CSS로만 (JS 금지) */
const BASE_CSS = `
.anaks-site, .anaks-site *, .anaks-site *::before, .anaks-site *::after { box-sizing: border-box; }
.anaks-site { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.anaks-site a { -webkit-tap-highlight-color: transparent; }
.anaks-btn {
  white-space: nowrap;
  transition: transform 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease;
}
.anaks-btn:hover { transform: translateY(-2px); opacity: 0.92; }
.anaks-btn[data-variant="solid"]:hover { box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.45); }
.anaks-btn[data-variant="ghost"]:hover { text-decoration: underline; }
@media (prefers-reduced-motion: reduce) {
  .anaks-btn { transition: none; }
  .anaks-btn:hover { transform: none; }
}
`;

/** DNA configs only. Keeping this block conditional preserves legacy/OFF markup and pixels. */
const THEME_TOKEN_CSS = `
.anaks-site[data-theme-tokens] .anaks-btn {
  transition-duration: var(--theme-duration-normal);
  transition-timing-function: var(--theme-easing-standard);
}
.anaks-site[data-theme-tokens] .anaks-btn[data-variant="solid"]:hover {
  box-shadow: var(--theme-shadow-high);
}
.anaks-site[data-theme-tokens] [data-signature-media] {
  border-radius: var(--signature-radius);
  box-shadow: var(--theme-shadow-high);
}
.anaks-site[data-theme-tokens] [data-signature-card],
.anaks-site[data-theme-tokens] [data-stack-card] {
  border-radius: var(--signature-radius);
  box-shadow: var(--theme-shadow-medium);
}
`;

/** New-site-only palette world. It has no URL or product-brand asset to leak into a tenant artifact. */
const SITE_CINEMATIC_CSS = `
.anaks-site[data-site-cinematic] [data-site-cine-procedural-hero] {
  position: absolute; inset: 0; overflow: hidden; pointer-events: none;
  background:
    radial-gradient(circle at 18% 18%, color-mix(in srgb,var(--site-cine-primary) 54%,transparent) 0,transparent 34%),
    radial-gradient(circle at 82% 30%, color-mix(in srgb,var(--site-cine-accent) 44%,transparent) 0,transparent 31%),
    linear-gradient(142deg,var(--site-cine-bg) 4%,var(--site-cine-surface) 55%,color-mix(in srgb,var(--site-cine-primary) 24%,var(--site-cine-bg)) 100%);
}
.anaks-site[data-site-cinematic] [data-site-cine-procedural-hero]::before,
.anaks-site[data-site-cinematic] [data-site-cine-procedural-hero]::after {
  position: absolute; content: ''; pointer-events: none; border-radius: 50%; filter: blur(1px);
}
.anaks-site[data-site-cinematic] [data-site-cine-procedural-hero]::before {
  width: 58%; aspect-ratio: 1; right: -8%; top: -24%;
  border: 1px solid color-mix(in srgb,var(--site-cine-text) 15%,transparent);
  box-shadow: inset 0 0 0 8vw color-mix(in srgb,var(--site-cine-accent) 7%,transparent);
}
.anaks-site[data-site-cinematic] [data-site-cine-procedural-hero]::after {
  width: 42%; aspect-ratio: 1; left: -10%; bottom: -26%;
  background: color-mix(in srgb,var(--site-cine-primary) 24%,transparent);
  filter: blur(64px);
}
.anaks-site[data-site-cinematic] [data-site-cine-integrated-typography]
  :is([data-cinematic-copy],[data-ss-copy],[data-scene-copy],[data-curtain-copy],[data-panel-copy],[data-chapter-copy]),
.anaks-site[data-site-cinematic] [data-site-cine-hero-copy] {
  position: relative; isolation: isolate;
  padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; backdrop-filter: none;
}
.anaks-site[data-site-cinematic] [data-site-cine-integrated-typography]
  :is([data-cinematic-copy],[data-ss-copy],[data-scene-copy],[data-curtain-copy],[data-panel-copy],[data-chapter-copy])::before,
.anaks-site[data-site-cinematic] [data-site-cine-hero-copy]::before {
  position: absolute; z-index: -1; inset: -18% -9%; content: ''; pointer-events: none;
  border: 0; border-radius: 50%;
  background: radial-gradient(ellipse at center,var(--site-cine-local-scrim,color-mix(in srgb,var(--site-cine-bg) 58%,transparent)) 0,transparent 72%);
  filter: blur(14px);
}
.anaks-site[data-site-cinematic] [data-site-cine-integrated-typography]
  :is([data-cinematic-tone="light"],[data-ss-tone="light"]) {
  --site-cine-local-scrim: rgba(2,8,24,.64);
}
.anaks-site[data-site-cinematic] [data-site-cine-integrated-typography]
  :is([data-cinematic-tone="ink"],[data-ss-tone="ink"]) {
  --site-cine-local-scrim: rgba(255,255,255,.68);
}
.anaks-site[data-site-cinematic] [data-site-cine-hero-copy] {
  text-shadow: 0 1px 2px color-mix(in srgb,var(--site-cine-bg) 72%,transparent),
    0 12px 34px color-mix(in srgb,var(--site-cine-bg) 62%,transparent);
}
.anaks-site[data-site-cinematic] [data-site-cinematic-continuation] {
  --story-progress: var(--scroll-progress,0); position: relative; isolation: isolate; overflow: clip;
}
.anaks-site[data-site-cinematic] [data-site-cinematic-continuation] > [data-story-progress-rail] {
  position: absolute; z-index: 1; top: clamp(120px,12svh,180px); bottom: clamp(96px,10svh,160px);
  left: max(14px,calc((100% - 1400px) / 2 + 20px)); width: 2px; overflow: hidden;
  border-radius: 999px; background: color-mix(in srgb,var(--site-cine-text) 14%,transparent); pointer-events: none;
}
.anaks-site[data-site-cinematic] [data-site-cinematic-continuation] [data-story-progress-fill] {
  display: block; width: 100%; height: 100%; transform: scaleY(var(--story-progress)); transform-origin: 50% 0;
  background: linear-gradient(to bottom,var(--site-cine-primary),var(--site-cine-accent));
  box-shadow: 0 0 16px color-mix(in srgb,var(--site-cine-accent) 42%,transparent);
}
.anaks-site[data-site-cinematic] [data-site-cinematic-continuation] > [data-story-chapter] {
  position: relative; isolation: isolate; z-index: 2;
}
.anaks-site[data-site-cinematic] [data-site-cinematic-continuation] > [data-story-chapter]::before {
  position: absolute; z-index: 3; inset: 0; content: ''; pointer-events: none;
  opacity: var(--story-chapter-light,.5);
  background: radial-gradient(
    circle at var(--story-light-x,18%) var(--story-light-y,42%),
    color-mix(in srgb,var(--site-cine-accent) 12%,transparent),transparent 26%
  );
  mix-blend-mode: soft-light;
}
.anaks-site[data-site-cinematic].m-cinematic-ready [data-site-cinematic-continuation] > [data-story-chapter] > * {
  opacity: var(--story-chapter-opacity,1);
  transform: translate3d(var(--story-chapter-x,0px),var(--story-chapter-y,0px),0) scale(var(--story-chapter-scale,1));
  transform-origin: 50% 50%; will-change: transform,opacity;
}
.anaks-site[data-site-cinematic] [data-site-cinematic-continuation] > [data-story-chapter]::after {
  position: absolute; z-index: 4; top: clamp(30px,4vw,58px);
  left: calc(max(14px,calc((100% - 1400px) / 2 + 20px)) - 17px);
  display: grid; width: 36px; height: 36px; place-items: center; content: attr(data-story-chapter);
  border: 1px solid color-mix(in srgb,var(--site-cine-primary) 40%,transparent); border-radius: 999px;
  background: var(--site-cine-bg); color: var(--site-cine-text);
  font: 650 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing: .08em;
  box-shadow: 0 0 0 4px var(--site-cine-bg),0 8px 24px color-mix(in srgb,var(--site-cine-text) 14%,transparent);
  pointer-events: none;
}
@media (max-width: 767.98px) {
  .anaks-site[data-site-cinematic] [data-site-cinematic-continuation] > [data-story-progress-rail] {
    right: 12px; left: auto; opacity: .72;
  }
  .anaks-site[data-site-cinematic] [data-site-cinematic-continuation] > [data-story-chapter]::after {
    top: 14px; right: 0; left: auto; width: 28px; height: 28px; font-size: 8px;
    box-shadow: 0 0 0 3px var(--site-cine-bg),0 6px 18px color-mix(in srgb,var(--site-cine-text) 12%,transparent);
  }
}
@media (prefers-reduced-motion: reduce) {
  .anaks-site[data-site-cinematic] [data-site-cinematic-continuation] [data-story-progress-fill] { transform: scaleY(1); }
  .anaks-site[data-site-cinematic] [data-site-cinematic-continuation] > [data-story-chapter] > * {
    opacity: 1 !important; transform: none !important; will-change: auto;
  }
  .anaks-site[data-site-cinematic] [data-site-cinematic-continuation] > [data-story-chapter]::before { opacity: .34; }
}
`;

/** FLOW is opt-in inside SITECINE. The old v1 selector tree never sees these rules. */
const CONTINUOUS_CANVAS_CSS = `
.anaks-site[data-continuous-canvas-root] [data-continuous-canvas] {
  --flow-canvas-top: color-mix(in srgb,var(--site-cine-bg) 84%,var(--site-cine-primary));
  --flow-canvas-mid: color-mix(in srgb,var(--site-cine-surface) 91%,var(--site-cine-accent));
  --flow-canvas-low: color-mix(in srgb,var(--site-cine-bg) 94%,var(--site-cine-surface));
  position: relative; isolation: isolate; overflow: clip;
  background: linear-gradient(180deg,
    var(--flow-canvas-top) 0%,
    color-mix(in srgb,var(--flow-canvas-top) 42%,var(--flow-canvas-mid)) 28%,
    var(--flow-canvas-mid) 58%,
    var(--flow-canvas-low) 100%);
}
.anaks-site[data-continuous-canvas-root] [data-continuous-canvas-field] {
  position: absolute; z-index: 0; inset: 0; overflow: hidden; pointer-events: none;
}
.anaks-site[data-continuous-canvas-root] [data-continuous-canvas-field]::before {
  position: absolute; inset: 0; content: '';
  background:
    radial-gradient(circle at calc(18% + var(--story-motif-x,0%)) 20%,color-mix(in srgb,var(--site-cine-primary) 18%,transparent),transparent 31%),
    radial-gradient(circle at calc(82% - var(--story-motif-x,0%)) 54%,color-mix(in srgb,var(--site-cine-accent) 14%,transparent),transparent 29%),
    radial-gradient(circle at 32% 88%,color-mix(in srgb,var(--site-cine-primary) 9%,transparent),transparent 25%);
}
.anaks-site[data-continuous-canvas-root] [data-continuous-canvas-field]::after {
  position: absolute; width: min(58vw,760px); aspect-ratio: 1; right: -18%; top: 12%; content: '';
  border: 1px solid color-mix(in srgb,var(--site-cine-text) 8%,transparent); border-radius: 50%;
  box-shadow: inset 0 0 0 8vw color-mix(in srgb,var(--site-cine-accent) 3%,transparent);
  transform: translate3d(0,var(--flow-field-y,0px),0) rotate(var(--flow-field-rotate,0deg));
}
.anaks-site[data-continuous-canvas-root].m-cinematic-ready
  [data-continuous-canvas][data-flow-depth="long"] > [data-continuous-canvas-field] {
  position: sticky; inset: auto 0; top: 0; height: 100svh; margin-bottom: -100svh;
}
.anaks-site[data-continuous-canvas-root] [data-continuous-canvas] > [data-story-chapter] {
  background: transparent;
}
.anaks-site[data-continuous-canvas-root] [data-continuous-canvas] > [data-flow-hero] {
  z-index: 3; overflow: visible;
}
.anaks-site[data-continuous-canvas-root] [data-continuous-canvas] > [data-flow-hero] + [data-story-chapter]::before {
  -webkit-mask-image: linear-gradient(to bottom,transparent 0%,#000 clamp(120px,18svh,220px));
  mask-image: linear-gradient(to bottom,transparent 0%,#000 clamp(120px,18svh,220px));
}
.anaks-site[data-continuous-canvas-root] [data-continuous-canvas] > [data-story-chapter]:not([data-flow-hero])
  :is(section[data-section-type],[data-motion-signature]) {
  background-color: transparent !important; background-image: none !important;
}
.anaks-site[data-continuous-canvas-root] [data-continuous-hero-bridge] {
  position: absolute; z-index: 5; right: 0; bottom: clamp(-140px,-12svh,-76px); left: 0; height: clamp(300px,52svh,520px);
  pointer-events: none;
  background: linear-gradient(to bottom,transparent 0%,color-mix(in srgb,var(--flow-canvas-top) 28%,transparent) 36%,var(--flow-canvas-top) 70%,transparent 100%);
}
.anaks-site[data-continuous-canvas-root].m-cinematic-ready [data-flow-layer] {
  opacity: var(--flow-layer-opacity,1);
  transform: translate3d(var(--flow-layer-x,0px),var(--flow-layer-y,0px),0) scale(var(--flow-layer-scale,1));
  transform-origin: 50% 50%; will-change: transform,opacity;
}
.anaks-site[data-continuous-canvas-root] [data-flow-layer] { width: 100%; height: 100%; }
@media (max-width: 767.98px) {
  .anaks-site[data-continuous-canvas-root] [data-continuous-canvas-field]::after { width: 92vw; right: -42%; top: 28%; opacity: .62; }
  .anaks-site[data-continuous-canvas-root] [data-continuous-hero-bridge] {
    bottom: clamp(-96px,-9svh,-64px); height: clamp(220px,38svh,340px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .anaks-site[data-continuous-canvas-root] [data-continuous-canvas][data-flow-depth="long"] > [data-continuous-canvas-field] {
    position: absolute; inset: 0; height: auto; margin: 0;
  }
  .anaks-site[data-continuous-canvas-root] [data-flow-layer] {
    opacity: 1 !important; transform: none !important; will-change: auto;
  }
}
`;

function SiteCinematicSequence({
  children,
  continuous = false,
  chapterCount = 0,
}: {
  children: ReactNode;
  continuous?: boolean;
  chapterCount?: number;
}) {
  const hasLongStage = continuous && chapterCount >= 3;
  return (
    <div
      data-site-cinematic-continuation
      data-m-progress
      {...(continuous ? {
        'data-continuous-canvas': 'true',
        'data-flow-depth': hasLongStage ? 'long' : 'short',
        'data-flow-chapter-count': String(chapterCount),
      } : {})}
      style={{ '--scroll-progress': 0 } as CSSProperties}
    >
      {continuous && <div aria-hidden="true" data-continuous-canvas-field />}
      <StoryProgressRail />
      {children}
    </div>
  );
}

function SiteCinematicChapter({
  index,
  sectionType,
  continuous = false,
  children,
}: {
  index: number;
  sectionType?: string;
  continuous?: boolean;
  children: ReactNode;
}) {
  const hero = continuous && sectionType === 'hero';
  return (
    <div
      data-story-chapter={String(index + 1).padStart(2, '0')}
      data-site-cine-quiet-section
      data-site-cine-integrated-typography
      {...(continuous ? { 'data-flow-section': 'true' } : {})}
      {...(hero ? { 'data-flow-hero': 'true' } : {})}
    >
      {children}
    </div>
  );
}

/**
 * AI 생성 customCss를 사이트 루트 클래스로 스코프.
 * CSS 중첩(nesting)으로 감싸 내부 셀렉터가 전부 `.anaks-site` 하위로 한정된다.
 * `</` 시퀀스는 제거해 <style> 태그 탈출 방지.
 */
function scopeCustomCss(customCss: string | undefined): string {
  if (!customCss?.trim()) return '';
  return `\n.anaks-site {\n${customCss.replace(/<\//g, '')}\n}`;
}

export function SiteRenderer({
  config,
  mode = 'auto',
  interactive = true,
  animate,
  tier,
  siteId,
  motionOwnerId,
  motionAssets,
  pageSlug = '',
  runtimeDelivery = 'inline',
}: {
  config: SiteConfig;
  mode?: SiteRendererMode;
  /** [v4] 렌더할 페이지 slug (''=홈). 호출부가 존재를 사전 확인(서빙은 notFound) */
  pageSlug?: string;
  /**
   * [motion 3단계 — 이월부채: 렌더시점 티어 방어] 소유자 티어. 주면 resolveMotionPlan이
   * sanitizeMotion으로 프리셋을 강등(저장/발행 방벽 우회·DB 오염 대비, defense-in-depth).
   * 서빙(/s)·내보내기가 전달. 미지정 시 저장 방벽이 보장한 프리셋 신뢰.
   */
  tier?: MotionTier;
  /**
   * false면 버튼을 링크가 아닌 비대화형(<span>)으로 렌더한다.
   * 대시보드 미리보기(SitePreview)처럼 상위가 이미 <a>인 맥락에서
   * 앵커 중첩(하이드레이션 에러)을 막는다. 실서빙은 기본 true.
   */
  interactive?: boolean;
  /**
   * [motion-system 2단계] 모션 레이어 방출 여부(재정의). true면 config.motion.presetId 기준
   * data-m 속성 + MOTION_CSS + 바닐라 런타임을 방출한다. 미지정 시 interactive를 따른다.
   * false = 비실사이트 컨텍스트(에디터 프리뷰·대시보드 썸네일 등) → 모션 미방출(정적).
   * (Stage-1의 tier 게이팅은 제거 — 모션 유무·종류의 단일 소스는 프리셋 계획이다.)
   */
  animate?: boolean;
  /** [v3 Phase 3] 문의 폼 제출 대상 사이트 — 실서빙(/s/[domain])에서만 전달 */
  siteId?: string;
  /**
   * 민감한 시그니처용 서버 권위 소유자. URL/클라이언트 provenance 문자열만으로는 대체할 수 없다.
   * 미지정 시 before-after는 sanitizer에서 fail-closed 된다.
   */
  motionOwnerId?: string;
  /** 저장소에서 현재 사이트 소유권까지 검증한 자산 projection. 기본 빈 배열 = 민감 기능 비활성. */
  motionAssets?: readonly MotionAssetProvenance[];
  /** 정적 발행은 inline, App Router 문서는 client로 전달해 SPA 내비게이션에서도 실행한다. */
  runtimeDelivery?: 'inline' | 'client';
}) {
  const shouldAnimate = animate ?? interactive;
  const { theme } = config;
  const siteCinematic = siteCinematicIsEnabled(config);
  // [v4] 선택 페이지의 섹션만 렌더 (미매칭 시 홈으로 폴백 — 호출부가 사전 존재 확인)
  const page = findPage(config, pageSlug) ?? homePage(config);
  const continuousCanvas = page.slug === '' && continuousCanvasIsEnabled(config);
  const sections = page.sections.filter((s) => !s.hidden);
  const usesProceduralHero = (section: Section) => siteCinematic
    && (config.siteCinematic?.heroBackdrop === 'dna-procedural'
      || (section.background.image?.responsivePromotion
        && [
          section.background.image.responsivePromotion.wide,
          section.background.image.responsivePromotion.compact,
          section.background.image.responsivePromotion.mobile,
        ].some((band) => !band.promoted)))
    && section.type === 'hero'
    && !section.background.video?.src;
  const fontUrls = googleFontUrls(theme.fonts.googleFonts);

  // v2 signature는 저장값을 곧바로 신뢰하지 않는다. 렌더 진입에서도 업종·tier·target·자산 소유권을
  // 재검증한다. tier/권위 자산이 빠진 호출은 basic/empty로 fail-closed 하되 ordinary sections는 보존한다.
  const signatureContext = motionContextFromConfig(config, tier ?? 'basic', {
    assets: motionAssets ?? [],
    ...(motionOwnerId ? { ownerId: motionOwnerId } : {}),
    ...(siteId ? { siteId } : {}),
    theme,
    playback: { renderMode: mode },
  });
  // Base and signature planning share the same authoritative projection. Otherwise a
  // verified sensitive scene could be stripped in the base pass and leave a duplicate
  // legacy video-hero active beside the later verified signature renderer.
  const signatureSanitizeOptions = {
    assets: motionAssets ?? [],
    ...(motionOwnerId ? { ownerId: motionOwnerId } : {}),
    ...(siteId ? { siteId } : {}),
    theme,
  };
  const plan = shouldAnimate
    ? resolveMotionPlan(config, tier ? { tier, signatureContext: signatureSanitizeOptions } : undefined)
    : undefined;
  const baseMotionActive = !!plan && planIsActive(plan);
  const signaturePlan = resolveMotionSignaturePlan(config, signatureContext);
  const signatureCandidate = signaturePlan.sceneByPage.get(page.id);
  const signatureScene = signatureCandidate && isRenderableMotionScene(signatureCandidate) &&
    sceneSourceSectionsAreSafe(signatureCandidate, sections)
    ? signatureCandidate
    : undefined;
  const useSignatureContract = signatureContractEnabled();
  const signatureArt = signatureScene
    ? resolveMotionArtDirectionProfile(signatureScene.signatureId, signatureContext, signatureScene)
    : undefined;
  // Signature CSS is also its complete no-JS/reduced static layout; runtime remains optional enhancement.
  const motionCssNeeded = baseMotionActive || Boolean(signatureScene) || siteCinematic;
  const signatureMotionEnabled = Boolean(signatureScene) && config.motion?.intensity !== 'off';
  const motionActive = shouldAnimate && (
    baseMotionActive || signatureMotionEnabled || (siteCinematic && config.motion?.intensity !== 'off')
  );
  const css = BASE_CSS + (theme.tokens ? THEME_TOKEN_CSS : '') + (siteCinematic ? SITE_CINEMATIC_CSS : '') +
    (continuousCanvas ? CONTINUOUS_CANVAS_CSS : '') +
    scopeCustomCss(theme.customCss) + (motionCssNeeded ? MOTION_CSS : '');

  const rootStyle: CSSProperties = {
    containerType: 'inline-size',
    width: '100%',
    minHeight: '100dvh',
    backgroundColor: themeColor(theme, 'backgroundSubtle'),
    color: theme.palette.text,
    fontFamily: theme.fonts.body,
  };
  if (theme.tokens) {
    const tokenStyle = rootStyle as Record<string, string | number>;
    tokenStyle['--theme-duration-fast'] = theme.tokens.motion.duration.fast;
    tokenStyle['--theme-duration-normal'] = theme.tokens.motion.duration.normal;
    tokenStyle['--theme-duration-slow'] = theme.tokens.motion.duration.slow;
    tokenStyle['--theme-easing-enter'] = theme.tokens.motion.easing.enter;
    tokenStyle['--theme-easing-exit'] = theme.tokens.motion.easing.exit;
    tokenStyle['--theme-easing-standard'] = theme.tokens.motion.easing.standard;
    tokenStyle['--theme-shadow-low'] = theme.tokens.shadow.low;
    tokenStyle['--theme-shadow-medium'] = theme.tokens.shadow.medium;
    tokenStyle['--theme-shadow-high'] = theme.tokens.shadow.high;
  }
  if (siteCinematic) {
    const cinematicStyle = rootStyle as Record<string, string | number>;
    cinematicStyle['--site-cine-bg'] = theme.palette.background;
    cinematicStyle['--site-cine-surface'] = theme.palette.surface;
    cinematicStyle['--site-cine-text'] = theme.palette.text;
    cinematicStyle['--site-cine-primary'] = theme.palette.primary;
    cinematicStyle['--site-cine-accent'] = theme.palette.accent;
  }
  if (motionCssNeeded) {
    const f = intensityFactors(plan?.intensity ?? config.motion?.intensity ?? 'normal');
    (rootStyle as Record<string, string | number>)['--m-amp'] = f.amp;
    (rootStyle as Record<string, string | number>)['--m-dur-scale'] = f.durScale;
  }

  const showDesktop = mode === 'desktop' || mode === 'auto';
  const showMobile = mode === 'mobile' || mode === 'auto';
  // Structured signature wins over a legacy layout on the same page; persisted legacy IDs remain untouched
  // and continue through SectionCanvas/ScrollytellingStage when no v2 scene is valid.
  const hasScrollytelling = !signatureScene && !!plan && plan.scrollytellingSections.size > 0;
  const scrollytellingSection = hasScrollytelling
    ? sections.find((section) => plan?.scrollytellingSections.has(section.id))
    : undefined;
  const ordinarySections = scrollytellingSection
    ? sections.filter((section) => section.id !== scrollytellingSection.id)
    : sections;
  const signatureConsumed = signatureScene ? consumedSectionIds(signatureScene) : new Set<string>();
  const signatureSequenceSections = signatureScene
    ? ordinarySections.filter((section) => (
      section.id === signatureScene.sectionId || !signatureConsumed.has(section.id)
    ))
    : ordinarySections;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {fontUrls.map((href) => (
        // React 19: precedence 지정 시 <head>로 호이스팅 + 중복 제거
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      {needsPretendard(theme) && <link rel="stylesheet" href={PRETENDARD_CSS_URL} precedence="default" />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div
        className="anaks-site"
        {...(theme.tokens ? { 'data-theme-tokens': '1' } : {})}
        {...(siteCinematic ? { 'data-site-cinematic': '1' } : {})}
        {...(continuousCanvas ? { 'data-continuous-canvas-root': '1' } : {})}
        style={rootStyle}
      >
        {signatureScene && signatureArt ? (
          siteCinematic ? (
            <SiteCinematicSequence continuous={continuousCanvas} chapterCount={signatureSequenceSections.length}>
              {signatureSequenceSections.map((section, continuationIndex) => {
                if (section.id === signatureScene.sectionId) {
                  return (
                    <SiteCinematicChapter key={`signature:${signatureScene.signatureId}:${section.id}`} index={continuationIndex} sectionType={section.type} continuous={continuousCanvas}>
                      <MotionSignatureRenderer
                        scene={signatureScene}
                        theme={theme}
                        artDirection={signatureArt}
                        mode={mode}
                        isFirst={sections[0]?.id === section.id && motionSceneMayOwnLcp(signatureScene)}
                        signatureContractEnabled={useSignatureContract}
                      />
                    </SiteCinematicChapter>
                  );
                }
                return (
                  <SiteCinematicChapter key={section.id} index={continuationIndex} sectionType={section.type} continuous={continuousCanvas}>
                    <div
                      data-signature-ordinary-section
                      data-signature-continuation
                      data-continuation-index={continuationIndex}
                      data-m-progress
                    >
                      {showDesktop && (
                        <div className={mode === 'auto' ? 'hidden xl:block' : undefined}>
                          <SectionCanvas section={section} theme={theme} isFirst={sections[0]?.id === section.id} interactive={interactive} plan={plan} siteId={siteId} proceduralHero={usesProceduralHero(section)} integratedTypography={section.type === 'hero'} continuousFlow={continuousCanvas} />
                        </div>
                      )}
                      {showMobile && (
                        <div className={mode === 'auto' ? 'xl:hidden' : undefined}>
                          <SectionStack section={section} theme={theme} isFirst={mode === 'mobile' && sections[0]?.id === section.id} interactive={interactive} plan={plan} siteId={siteId} proceduralHero={usesProceduralHero(section)} integratedTypography={section.type === 'hero'} continuousFlow={continuousCanvas} />
                        </div>
                      )}
                    </div>
                  </SiteCinematicChapter>
                );
              })}
            </SiteCinematicSequence>
          ) : ordinarySections.map((section, continuationIndex) => {
            if (section.id === signatureScene.sectionId) {
              return (
                <MotionSignatureRenderer
                  key={`signature:${signatureScene.signatureId}:${section.id}`}
                  scene={signatureScene}
                  theme={theme}
                  artDirection={signatureArt}
                  mode={mode}
                  isFirst={sections[0]?.id === section.id && motionSceneMayOwnLcp(signatureScene)}
                  signatureContractEnabled={useSignatureContract}
                />
              );
            }
            if (signatureConsumed.has(section.id)) return null;
            return (
              <div
                key={section.id}
                data-signature-ordinary-section
                data-signature-continuation
                data-continuation-index={continuationIndex}
                data-m-progress
              >
                {showDesktop && (
                  <div className={mode === 'auto' ? 'hidden xl:block' : undefined}>
                    <SectionCanvas
                      section={section}
                      theme={theme}
                      isFirst={sections[0]?.id === section.id}
                      interactive={interactive}
                      plan={plan}
                      siteId={siteId}
                      proceduralHero={usesProceduralHero(section)}
                    />
                  </div>
                )}
                {showMobile && (
                  <div className={mode === 'auto' ? 'xl:hidden' : undefined}>
                    <SectionStack
                      section={section}
                      theme={theme}
                      // auto contains both trees: only desktop receives eager/high so a page has one LCP candidate.
                      isFirst={mode === 'mobile' && sections[0]?.id === section.id}
                      interactive={interactive}
                      plan={plan}
                      siteId={siteId}
                      proceduralHero={usesProceduralHero(section)}
                    />
                  </div>
                )}
              </div>
            );
          })
        ) : scrollytellingSection ? (
          siteCinematic ? (
            <SiteCinematicSequence continuous={continuousCanvas} chapterCount={ordinarySections.length + 1}>
              <SiteCinematicChapter index={0} sectionType={scrollytellingSection.type} continuous={continuousCanvas}>
                <ScrollytellingStage
                  section={scrollytellingSection}
                  theme={theme}
                  isFirst={sections[0]?.id === scrollytellingSection.id}
                  mode={mode}
                />
              </SiteCinematicChapter>
              {ordinarySections.map((section, index) => (
                <SiteCinematicChapter key={section.id} index={index + 1} sectionType={section.type} continuous={continuousCanvas}>
                  {showDesktop && (
                    <div className={mode === 'auto' ? 'hidden xl:block' : undefined}>
                      <SectionCanvas section={section} theme={theme} isFirst={false} interactive={interactive} plan={plan} siteId={siteId} proceduralHero={usesProceduralHero(section)} integratedTypography={section.type === 'hero'} continuousFlow={continuousCanvas} />
                    </div>
                  )}
                  {showMobile && (
                    <div className={mode === 'auto' ? 'xl:hidden' : undefined}>
                      <SectionStack section={section} theme={theme} isFirst={false} interactive={interactive} plan={plan} siteId={siteId} proceduralHero={usesProceduralHero(section)} integratedTypography={section.type === 'hero'} continuousFlow={continuousCanvas} />
                    </div>
                  )}
                </SiteCinematicChapter>
              ))}
            </SiteCinematicSequence>
          ) : (
            <ScrollytellingStage
              section={scrollytellingSection}
              theme={theme}
              isFirst={sections[0]?.id === scrollytellingSection.id}
              mode={mode}
            />
          )
        ) : null}
        {!signatureScene && !(siteCinematic && scrollytellingSection) && showDesktop && (
          <div className={mode === 'auto' ? 'hidden xl:block' : undefined}>
            {siteCinematic ? (
              <SiteCinematicSequence continuous={continuousCanvas} chapterCount={ordinarySections.length}>
                {ordinarySections.map((section, index) => (
                  <SiteCinematicChapter key={section.id} index={index} sectionType={section.type} continuous={continuousCanvas}>
                    <SectionCanvas section={section} theme={theme} isFirst={sections[0]?.id === section.id} interactive={interactive} plan={plan} siteId={siteId} proceduralHero={usesProceduralHero(section)} integratedTypography={section.type === 'hero'} continuousFlow={continuousCanvas} />
                  </SiteCinematicChapter>
                ))}
              </SiteCinematicSequence>
            ) : ordinarySections.map((section) => (
              <SectionCanvas key={section.id} section={section} theme={theme} isFirst={sections[0]?.id === section.id} interactive={interactive} plan={plan} siteId={siteId} />
            ))}
          </div>
        )}
        {!signatureScene && !(siteCinematic && scrollytellingSection) && showMobile && (
          <div className={mode === 'auto' ? 'xl:hidden' : undefined}>
            {siteCinematic ? (
              <SiteCinematicSequence continuous={continuousCanvas} chapterCount={ordinarySections.length}>
                {ordinarySections.map((section, index) => (
                  <SiteCinematicChapter key={section.id} index={index} sectionType={section.type} continuous={continuousCanvas}>
                    <SectionStack
                      section={section}
                      theme={theme}
                      isFirst={mode === 'mobile' && sections[0]?.id === section.id}
                      interactive={interactive}
                      plan={plan}
                      siteId={siteId}
                      proceduralHero={usesProceduralHero(section)}
                      integratedTypography={section.type === 'hero'}
                      continuousFlow={continuousCanvas}
                    />
                  </SiteCinematicChapter>
                ))}
              </SiteCinematicSequence>
            ) : ordinarySections.map((section) => (
              <SectionStack
                key={section.id}
                section={section}
                theme={theme}
                isFirst={mode === 'mobile' && sections[0]?.id === section.id}
                interactive={interactive}
                plan={plan}
                siteId={siteId}
              />
            ))}
          </div>
        )}
      </div>
      {runtimeDelivery === 'client' ? (
        <SiteRuntimeBootstrap motion={motionActive} anchors={interactive && mode === 'auto'} />
      ) : (
        <>
          {/* 정적 내보내기는 독립 HTML 파싱 시 실행되는 기존 인라인 계약을 유지한다. */}
          {motionActive && <script dangerouslySetInnerHTML={{ __html: MOTION_RUNTIME }} />}
          {interactive && mode === 'auto' && <script dangerouslySetInnerHTML={{ __html: ANCHOR_RUNTIME }} />}
        </>
      )}
    </>
  );
}
