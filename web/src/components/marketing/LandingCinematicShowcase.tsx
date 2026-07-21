import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, MousePointer2 } from 'lucide-react';
import type { ScrollytellingManifestoScene, SiteTheme } from '@/lib/types/site';
import {
  resolveMotionArtDirectionProfile,
  type MotionContext,
} from '@/lib/motion/signatures';
import { MOTION_CSS } from '@/lib/motion/runtime';
import type {
  ScrollytellingCompositionOverride,
  ScrollytellingCompositionPattern,
} from '@/lib/motion/scrollytelling-composition';
import { LandingScanner } from '@/components/landing/LandingScanner';
import {
  MotionSignatureRenderer,
  type ScrollytellingActLink,
} from '@/components/site-renderer/MotionSignatureRenderer';
import { LandingCinematicRuntime } from './LandingCinematicRuntime';

const POSTER_SRC = '/daboim-visibility-film-poster.webp';

const ACTS = [
  {
    eyebrow: '01 · SEARCH',
    heading: '손님이 검색하면, 가게를 찾기 쉽게.',
    body: '네이버·구글이 가게 이름, 지역, 서비스와 페이지 내용을 찾을 수 있게 정리합니다.',
    start: 0,
    end: 0.2,
  },
  {
    eyebrow: '02 · ANSWER',
    heading: '“주차 되나요?”에 홈페이지가 바로 답하게.',
    body: '영업시간, 주차, 예약처럼 손님이 자주 묻는 내용을 질문과 답으로 또렷하게 적습니다.',
    start: 0.2,
    end: 0.4,
  },
  {
    eyebrow: '03 · GENERATIVE',
    heading: 'AI에게 물어봐도, 공식 정보를 확인하기 쉽게.',
    body: '가게 이름, 지역, 서비스와 공식 연락처를 한뜻으로 정리해 AI가 정보를 덜 헷갈리게 합니다.',
    start: 0.4,
    end: 0.6,
  },
  {
    eyebrow: '04 · CINEMATIC',
    heading: '이 움직임을 사장님 홈페이지에도.',
    body: '컴퓨터에서는 스크롤에 맞춰 장면이 바뀌고, 휴대폰에서는 부드럽게 반복됩니다. 움직임을 줄인 기기에서는 사진과 글이 그대로 보입니다.',
    start: 0.6,
    end: 0.8,
  },
  {
    eyebrow: '05 · MADE WITH DABOIM',
    heading: '지금 보고 계신 이 홈페이지가 다보임으로 만든 예시입니다.',
    body: '업종마다 필요한 내용과 장면을 어떻게 다르게 담는지 적용 사례에서 확인해 보세요.',
    start: 0.8,
    end: 1,
  },
] as const;

const LANDING_COMPOSITION_PATTERN = 'alternate-lr' satisfies ScrollytellingCompositionPattern;
const LANDING_COMPOSITION_OVERRIDES = ACTS.map(() => ({ tone: 'ink' } as const)) satisfies readonly ScrollytellingCompositionOverride[];
const LANDING_ACT_LINKS = [null, null, null, null, { href: '/cases', label: '적용 사례 보기' }] satisfies readonly (ScrollytellingActLink | null)[];

const LANDING_THEME = {
  fonts: {
    heading: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
    body: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
  },
  palette: {
    background: '#07142F',
    surface: '#0B1736',
    text: '#FFFFFF',
    muted: '#C3CEE2',
    primary: '#68E8D8',
    accent: '#174DDA',
  },
  radius: 28,
} satisfies SiteTheme;

const LANDING_SCENE = {
  signatureId: 'scrollytelling-manifesto',
  pageId: 'marketing-home',
  sectionId: 'landing-manifesto-stage',
  media: {
    id: 'daboim-visibility-film',
    kind: 'video',
    src: '/daboim-visibility-film-scrub.mp4',
    poster: POSTER_SRC,
    alt: '다보임 홈페이지가 손님에게 발견되는 흐름을 표현한 시네마틱 필름',
    width: 1920,
    height: 1080,
    focalPoint: { x: 0.5, y: 0.48 },
    provenance: 'curated',
  },
  acts: ACTS.map((act, index) => ({
    id: `landing-act-${index + 1}`,
    heading: act.heading,
    body: act.body,
    kind: 'text' as const,
    band: [act.start, act.end] as [number, number],
  })),
} satisfies ScrollytellingManifestoScene;

const LANDING_MOTION_CONTEXT = {
  purposeId: 'company_brand',
  templateId: 'default',
  industryClass: 'brand',
  classificationSource: 'server',
  availableSections: [{
    pageId: LANDING_SCENE.pageId,
    sectionId: LANDING_SCENE.sectionId,
    type: 'hero',
    itemCount: ACTS.length,
    mediaCount: 1,
  }],
  assets: [],
  tier: 'premium',
  entitlement: { videoAddon: true },
  playback: {
    javascript: true,
    viewportWidth: 1440,
    finePointer: true,
    hover: true,
    reducedMotion: false,
    saveData: false,
    hardwareConcurrency: 8,
    intersectionObserver: true,
    renderMode: 'auto',
  },
  theme: LANDING_THEME,
  contentDensity: 'balanced',
  motionIntensity: 'normal',
} satisfies MotionContext;

const LANDING_ART_DIRECTION = resolveMotionArtDirectionProfile(
  'scrollytelling-manifesto',
  LANDING_MOTION_CONTEXT,
  LANDING_SCENE,
);

const LANDING_VIDEO_SOURCES = [
  { src: '/daboim-visibility-film-mobile.mp4', type: 'video/mp4', media: '(max-width: 767.98px)' },
  { src: '/daboim-visibility-film-scrub.mp4', type: 'video/mp4' },
] as const;

const STAGE_CSS = `
[data-landing-manifesto] [data-film-example-badge] {
  position: fixed; z-index: 40; top: 84px; right: max(18px,calc((100vw - 1340px) / 2));
  display: flex; align-items: center; gap: 12px; width: fit-content; max-width: min(680px,calc(100vw - 36px));
  padding: 9px 12px; border: 1px solid rgba(104,232,216,.34); border-radius: 18px;
  background: rgba(3,12,31,.78); box-shadow: 0 14px 42px rgba(0,8,28,.22); backdrop-filter: blur(14px);
  transform: translate3d(0,var(--film-badge-y,0px),0); opacity: var(--film-badge-opacity,.9);
  pointer-events: none;
}
[data-landing-manifesto] [data-film-example-badge] > * { pointer-events: auto; }
[data-landing-manifesto][data-upper-film-ended] [data-film-example-badge] { pointer-events: none; }
[data-landing-manifesto][data-upper-film-ended] [data-film-example-badge] > * { pointer-events: none; }
[data-landing-manifesto] [data-film-example-badge] a {
  display: inline-flex; align-items: center; gap: 6px; color: #68e8d8;
  font-size: 11px; line-height: 1.35; font-weight: 700; letter-spacing: .06em; word-break: keep-all;
}
[data-landing-manifesto] [data-film-example-badge] p {
  display: inline-flex; align-items: center; gap: 5px; margin: 0; color: rgba(255,255,255,.7);
  font-size: 10px; line-height: 1.35; letter-spacing: .04em; word-break: keep-all;
}
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-copy] {
  position: relative; isolation: isolate; width: min(800px, 67vw); max-width: none !important;
  margin: 0; padding: 0 !important; border: 0 !important; border-radius: 0 !important;
  background: none !important; box-shadow: none !important; backdrop-filter: none !important;
}
.daboim-cinematic [data-ss-copy]::before {
  position: absolute; z-index: -1; inset: -26% -18%; content: ''; pointer-events: none;
  opacity: var(--ss-scrim-opacity, .88); filter: blur(16px);
  background: radial-gradient(ellipse at var(--ss-scrim-x, 30%) 50%,var(--ss-scrim-core),transparent 72%);
}
.daboim-cinematic [data-ss-act][data-ss-tone="ink"] {
  --ss-scrim-core: rgba(248,251,255,.86); color: #07142f;
}
.daboim-cinematic [data-ss-act][data-ss-tone="light"] {
  --ss-scrim-core: rgba(3,12,31,.76); color: #fff;
}
.daboim-cinematic [data-ss-act][data-ss-composition="left"] {
  align-items: center; justify-content: flex-start; --ss-scrim-x: 24%;
}
.daboim-cinematic [data-ss-act][data-ss-composition="left"] [data-ss-copy] {
  text-align: left; transform-origin: 0 50%;
}
.daboim-cinematic [data-ss-act][data-ss-composition="right"] {
  align-items: center; justify-content: flex-end; --ss-scrim-x: 76%;
}
.daboim-cinematic [data-ss-act][data-ss-composition="right"] [data-ss-copy] {
  text-align: right;
  transform-origin: 100% 50%;
}
.daboim-cinematic [data-ss-act][data-ss-composition="right"] :is([data-ss-body],[data-ss-act-link]) { margin-left: auto; }
.daboim-cinematic [data-ss-act][data-ss-composition="center"] {
  align-items: center; justify-content: center;
}
.daboim-cinematic [data-ss-act][data-ss-composition="center"] [data-ss-copy] {
  width: min(1040px, 82vw); text-align: center; transform-origin: 50% 50%; --ss-scrim-x: 50%;
}
.daboim-cinematic [data-ss-act][data-ss-composition="center"] :is([data-ss-heading],[data-ss-body],[data-ss-act-link]) {
  margin-inline: auto;
}
.daboim-cinematic.m-scrollytelling-ready [data-ss-act][data-ss-composition] { transform: none; }
.daboim-cinematic.m-scrollytelling-ready [data-ss-act][data-ss-composition] [data-ss-copy] {
  opacity: var(--ss-act-opacity, 1);
  transform: translate3d(var(--ss-act-x, 0px),var(--ss-act-y, 0px),0) scale(var(--ss-act-scale, 1));
}
.daboim-cinematic.m-scrollytelling-ready [data-ss-word] {
  transform: translate3d(var(--ss-word-x,0px),var(--ss-word-y,0px),0);
}
.daboim-cinematic [data-ss-act-link] {
  display: inline-flex; width: fit-content; align-items: center; gap: 8px; margin-top: 28px;
  color: inherit; font-size: clamp(1rem,1.35vw,1.2rem); font-weight: 750; text-decoration: underline;
  text-decoration-thickness: 1px; text-underline-offset: 7px;
}
.daboim-cinematic [data-ss-heading] {
  max-width: 940px; color: inherit; font-size: clamp(2.25rem, 5.25vw, 5.25rem);
  letter-spacing: -.057em; text-wrap: balance;
  text-shadow: 0 1px 1px rgba(255,255,255,.4), 0 16px 44px rgba(255,255,255,.34);
}
.daboim-cinematic [data-ss-act][data-ss-tone="light"] [data-ss-heading] {
  text-shadow: 0 2px 3px rgba(0,8,28,.36), 0 18px 48px rgba(0,8,28,.48);
}
.daboim-cinematic [data-ss-body] { color: color-mix(in srgb,currentColor 78%,transparent); }
.daboim-cinematic.m-scrollytelling-static [data-signature-id="scrollytelling-manifesto"] {
  height: auto !important; contain: none;
}
.daboim-cinematic.m-scrollytelling-static [data-signature-id="scrollytelling-manifesto"] [data-ss-pin] {
  height: auto; overflow: visible;
}
.daboim-cinematic.m-scrollytelling-static [data-signature-id="scrollytelling-manifesto"] [data-ss-media] {
  position: relative; inset: auto; height: var(--ss-static-height); min-height: 0;
}
.daboim-cinematic.m-scrollytelling-static [data-signature-id="scrollytelling-manifesto"] [data-ss-act] {
  min-height: min(58svh, 560px); padding-block: clamp(56px, 6vw, 88px);
  border-top: 1px solid rgba(255,255,255,.08);
}
@media (max-width: 767.98px) {
  [data-landing-manifesto] [data-film-example-badge] {
    top: 76px; right: 12px; left: 12px; display: grid; width: auto; max-width: none;
    gap: 3px; padding: 8px 10px; border-radius: 14px;
  }
  [data-landing-manifesto] [data-film-example-badge] a { justify-content: space-between; font-size: 9.5px; }
  [data-landing-manifesto] [data-film-example-badge] p { font-size: 8.5px; }
  .daboim-cinematic [data-ss-heading] { font-size: clamp(2.15rem, 11vw, 4.25rem); }
  .daboim-cinematic [data-ss-act][data-ss-composition] [data-ss-copy] { width: 100%; max-width: 100% !important; }
  .daboim-cinematic [data-ss-act][data-ss-composition="left"] { align-items: flex-end; justify-content: center; }
  .daboim-cinematic [data-ss-act][data-ss-composition="right"] { align-items: flex-start; justify-content: center; }
  .daboim-cinematic [data-ss-act][data-ss-composition="center"] { align-items: center; justify-content: center; }
  .daboim-cinematic [data-ss-copy]::before { inset: -18% -10%; filter: blur(12px); }
  .daboim-cinematic.m-scrollytelling-ready [data-ss-stage][data-ss-mode="auto"] [data-ss-act] {
    padding: 164px 20px 72px;
  }
  .daboim-cinematic.m-scrollytelling-static [data-signature-id="scrollytelling-manifesto"] [data-ss-act] {
    min-height: min(58svh, 500px); padding-block: 56px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-act] {
    padding-block: clamp(56px, 6vw, 88px);
  }
}
`;

const NO_JS_STAGE_CSS = `
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"]{height:auto!important;contain:none}
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-pin]{height:auto;overflow:visible}
[data-landing-full-film-stage] .daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-media]{position:relative!important;inset:auto!important;width:100%;height:var(--ss-static-height)!important;min-height:0}
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-act]{min-height:min(58svh,560px);padding-block:clamp(56px,6vw,88px)}
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-video]{display:none!important}
`;

export function LandingCinematicShowcase() {
  return (
    <div
      data-landing-manifesto
      data-m-progress
      className="anaks-site daboim-cinematic"
      style={{ minHeight: 0, backgroundColor: 'transparent', '--scroll-progress': 0 } as CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: `${MOTION_CSS}\n${STAGE_CSS}` }} />

      <aside data-film-example-badge aria-label="AI 영상 홈페이지 예시 안내">
        <Link href="/cases">
          <span>예시 · AI 영상 홈페이지 적용 시 · 적용 사례 보기</span>
          <ArrowRight aria-hidden="true" size={13} />
        </Link>
        <p><MousePointer2 aria-hidden="true" size={11} /> 컴퓨터: 스크롤 반응 · 휴대폰: 부드러운 반복</p>
      </aside>

      <div data-lcs-prelude className="relative isolate overflow-hidden">
        <LandingScanner />
      </div>

      <MotionSignatureRenderer
        scene={LANDING_SCENE}
        theme={LANDING_THEME}
        artDirection={LANDING_ART_DIRECTION}
        mode="auto"
        isFirst
        compositionPattern={LANDING_COMPOSITION_PATTERN}
        compositionOverrides={LANDING_COMPOSITION_OVERRIDES}
        scrollytellingActLinks={LANDING_ACT_LINKS}
        responsiveVideoSources={LANDING_VIDEO_SOURCES}
      />
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: NO_JS_STAGE_CSS }} />
      </noscript>
      <LandingCinematicRuntime />
    </div>
  );
}
