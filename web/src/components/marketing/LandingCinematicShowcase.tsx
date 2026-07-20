import type { ScrollytellingManifestoScene, SiteTheme } from '@/lib/types/site';
import {
  resolveMotionArtDirectionProfile,
  type MotionContext,
} from '@/lib/motion/signatures';
import { MOTION_CSS } from '@/lib/motion/runtime';
import { LandingScanner } from '@/components/landing/LandingScanner';
import {
  MotionSignatureRenderer,
  type ScrollytellingActComposition,
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
    composition: { placement: 'lower-left', entrance: 'from-left' },
  },
  {
    eyebrow: '02 · ANSWER',
    heading: '“주차 되나요?”에 홈페이지가 바로 답하게.',
    body: '영업시간, 주차, 예약처럼 손님이 자주 묻는 내용을 질문과 답으로 또렷하게 적습니다.',
    start: 0.2,
    end: 0.4,
    composition: { placement: 'right-aligned', entrance: 'from-right' },
  },
  {
    eyebrow: '03 · GENERATIVE',
    heading: 'AI에게 물어봐도, 공식 정보를 확인하기 쉽게.',
    body: '가게 이름, 지역, 서비스와 공식 연락처를 한뜻으로 정리해 AI가 정보를 덜 헷갈리게 합니다.',
    start: 0.4,
    end: 0.6,
    composition: { placement: 'center-large', entrance: 'fade-scale' },
  },
  {
    eyebrow: '04 · CINEMATIC',
    heading: '이 움직임을 사장님 홈페이지에도.',
    body: '컴퓨터에서는 스크롤에 맞춰 장면이 바뀌고, 휴대폰에서는 부드럽게 반복됩니다. 움직임을 줄인 기기에서는 사진과 글이 그대로 보입니다.',
    start: 0.6,
    end: 0.8,
    composition: { placement: 'top-band-bottom-assist', entrance: 'from-bottom' },
  },
  {
    eyebrow: '05 · MADE WITH DABOIM',
    heading: '지금 보고 계신 이 홈페이지가 다보임으로 만든 예시입니다.',
    body: '업종마다 필요한 내용과 장면을 어떻게 다르게 담는지 적용 사례에서 확인해 보세요.',
    start: 0.8,
    end: 1,
    composition: { placement: 'center-large', entrance: 'fade-scale' },
  },
] as const;

const LANDING_ACT_COMPOSITIONS = ACTS.map((act) => act.composition) satisfies readonly ScrollytellingActComposition[];
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
  { src: '/daboim-visibility-film.webm', type: 'video/webm', media: '(max-width: 767.98px)' },
  { src: '/daboim-visibility-film-scrub.mp4', type: 'video/mp4' },
] as const;

const STAGE_CSS = `
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-copy] {
  padding-inline: clamp(24px, 7vw, 108px);
}
.daboim-cinematic.m-scrollytelling-ready [data-signature-id="scrollytelling-manifesto"] [data-ss-copy] {
  padding: clamp(24px, 4vw, 52px);
  border: 1px solid rgba(255,255,255,.12); border-radius: clamp(22px, 2vw, 30px);
  background: linear-gradient(108deg,rgba(3,12,31,.84),rgba(3,12,31,.54) 68%,rgba(3,12,31,.16));
  box-shadow: 0 28px 80px rgba(0,8,28,.24);
}
.daboim-cinematic [data-ss-act][data-ss-composition="lower-left"] {
  align-items: flex-end; justify-content: flex-start;
}
.daboim-cinematic [data-ss-act][data-ss-composition="lower-left"] [data-ss-copy] {
  width: min(720px, 66vw); max-width: none !important; margin: 0;
  transform-origin: 0 100%;
}
.daboim-cinematic [data-ss-act][data-ss-composition="right-aligned"] {
  align-items: center; justify-content: flex-end;
}
.daboim-cinematic [data-ss-act][data-ss-composition="right-aligned"] [data-ss-copy] {
  width: min(760px, 68vw); max-width: none !important; margin: 0; text-align: right;
  transform-origin: 100% 50%;
  background: linear-gradient(252deg,rgba(3,12,31,.88),rgba(3,12,31,.58) 68%,rgba(3,12,31,.16));
}
.daboim-cinematic [data-ss-act][data-ss-composition="right-aligned"] [data-ss-body] { margin-left: auto; }
.daboim-cinematic [data-ss-act][data-ss-composition="center-large"] {
  align-items: center; justify-content: center;
}
.daboim-cinematic [data-ss-act][data-ss-composition="center-large"] [data-ss-copy] {
  width: min(1080px, 84vw); max-width: none !important; margin: 0; text-align: center;
  transform-origin: 50% 50%;
  background: radial-gradient(circle at 50% 48%,rgba(3,12,31,.86),rgba(3,12,31,.56) 64%,rgba(3,12,31,.18));
}
.daboim-cinematic [data-ss-act][data-ss-composition="center-large"] :is([data-ss-heading],[data-ss-body]) {
  margin-inline: auto;
}
.daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] {
  align-items: stretch; justify-content: stretch; padding-top: max(156px,11vw); padding-bottom: clamp(64px,7vw,96px);
}
.daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] [data-ss-copy] {
  display: flex; flex: 1; min-height: 0; width: 100%; max-width: none !important;
  flex-direction: column; justify-content: space-between; gap: 32px; margin: 0; padding: 0;
  border: 0; background: transparent; box-shadow: none; transform-origin: 50% 100%;
}
.daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] [data-ss-heading],
.daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] [data-ss-body] {
  width: fit-content; padding: clamp(20px, 3vw, 38px); border: 1px solid rgba(255,255,255,.12);
  border-radius: clamp(20px, 2vw, 28px); background: rgba(3,12,31,.76); box-shadow: 0 24px 70px rgba(0,8,28,.22);
}
.daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] [data-ss-heading] { max-width: min(1040px, 86vw); }
.daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] [data-ss-body] { align-self: flex-end; margin: 0; }
.daboim-cinematic.m-scrollytelling-ready [data-ss-act][data-ss-composition] { transform: none; }
.daboim-cinematic.m-scrollytelling-ready [data-ss-act][data-ss-composition] [data-ss-copy] {
  opacity: var(--ss-act-opacity, 1);
  transform: translate3d(var(--ss-act-x, 0px),var(--ss-act-y, 0px),0) scale(var(--ss-act-scale, 1));
}
.daboim-cinematic [data-ss-act-link] {
  display: inline-flex; width: fit-content; align-items: center; gap: 8px; margin-top: 28px;
  color: #68e8d8; font-size: clamp(1rem,1.35vw,1.2rem); font-weight: 700; text-decoration: none;
}
.daboim-cinematic [data-ss-act][data-ss-composition="center-large"] [data-ss-act-link] { margin-inline: auto; }
.daboim-cinematic [data-ss-heading] {
  max-width: 860px; color: #fff; font-size: clamp(2.25rem, 5.5vw, 5.5rem);
  letter-spacing: -.055em; text-wrap: balance;
}
.daboim-cinematic [data-ss-body] { color: rgba(255,255,255,.76); }
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
  .daboim-cinematic [data-ss-heading] { font-size: clamp(2.15rem, 11vw, 4.25rem); }
  .daboim-cinematic [data-ss-copy] { padding-inline: 24px; }
  .daboim-cinematic [data-ss-act][data-ss-composition] [data-ss-copy] { width: 100%; max-width: none !important; }
  .daboim-cinematic [data-ss-act][data-ss-composition="lower-left"] { align-items: flex-end; justify-content: center; }
  .daboim-cinematic [data-ss-act][data-ss-composition="right-aligned"] { align-items: flex-start; justify-content: center; }
  .daboim-cinematic [data-ss-act][data-ss-composition="right-aligned"] [data-ss-copy] { text-align: right; }
  .daboim-cinematic [data-ss-act][data-ss-composition="center-large"] [data-ss-heading] { font-size: clamp(2.7rem, 13vw, 4.4rem); }
  .daboim-cinematic.m-scrollytelling-ready [data-ss-stage][data-ss-mode="auto"] [data-ss-act] {
    padding: 164px 20px 72px;
  }
  .daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] [data-ss-copy] {
    min-height: 0; padding: 0;
  }
  .daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] [data-ss-heading],
  .daboim-cinematic [data-ss-act][data-ss-composition="top-band-bottom-assist"] [data-ss-body] { max-width: 100%; padding: 20px; }
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
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-media]{position:relative;inset:auto;height:var(--ss-static-height);min-height:0}
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-act]{min-height:min(58svh,560px);padding-block:clamp(56px,6vw,88px)}
.daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-video]{display:none!important}
`;

export function LandingCinematicShowcase() {
  return (
    <div
      data-landing-manifesto
      className="anaks-site daboim-cinematic"
      style={{ minHeight: 0, backgroundColor: 'transparent' }}
    >
      <style dangerouslySetInnerHTML={{ __html: `${MOTION_CSS}\n${STAGE_CSS}` }} />

      <div data-lcs-prelude className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          data-lcs-hero-ambient
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_76%_30%,rgba(3,209,184,.18),transparent_24%),radial-gradient(circle_at_18%_70%,rgba(23,77,218,.13),transparent_32%),linear-gradient(135deg,#F8FBFF_8%,#EEF5FF_54%,#EAFBF7)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(23,77,218,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(23,77,218,.045)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]"
        />
        <LandingScanner consoleMedia="interface" />
      </div>

      <MotionSignatureRenderer
        scene={LANDING_SCENE}
        theme={LANDING_THEME}
        artDirection={LANDING_ART_DIRECTION}
        mode="auto"
        isFirst
        pageFilm
        scrollytellingCompositions={LANDING_ACT_COMPOSITIONS}
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
