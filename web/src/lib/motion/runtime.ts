/**
 * [motion-system 2단계] 모션 토큰 — CSS + 의존성 0 바닐라 런타임 (문자열 상수).
 *
 * 두 소비 경로 공용:
 *  ① 호스팅(app/s/[domain]): SiteRenderer가 <style>{MOTION_CSS} + 클라이언트가 MOTION_RUNTIME 로드
 *  ② 정적 내보내기(render-static): HTML에 <style>{MOTION_CSS} + 인라인 <script>{MOTION_RUNTIME}
 * framer-motion·React 없음. 애니메이션 속성은 transform/opacity/clip-path/textContent만 → CLS 0.
 * 스코프: `.anaks-site` 하위만. reduced-motion은 CSS가 전 기법 무효화(최종 상태 즉시 표시).
 */

export const MOTION_CSS = `
.anaks-site { --m-amp: 1; --m-dur-scale: 1; }
.anaks-site [data-m-progress] { --scroll-progress: 0; }
/* cinematic은 progressive enhancement: no-JS/reduced 기본은 정적 poster, ready 이후에만 pin. */
.anaks-site [data-cinematic-layout="desktop"] { height: var(--cinematic-static-height); }
.anaks-site [data-cinematic-layout="desktop"] [data-m-pin] { position: relative; height: 100%; overflow: hidden; }
.anaks-site.m-cinematic-ready [data-cinematic-layout="desktop"] {
  height: var(--cinematic-scroll-height); min-height: 240svh;
}
.anaks-site.m-cinematic-ready [data-cinematic-layout="desktop"] [data-m-pin] {
  position: sticky; top: 0; height: min(100svh, var(--cinematic-static-height));
}
.anaks-site [data-cinematic-layout="mobile"] [data-m-mobile-pin] {
  position: absolute; inset: 0; height: 100%; overflow: hidden; z-index: 0;
}
.anaks-site.m-cinematic-ready [data-cinematic-layout="mobile"] [data-m-mobile-pin] {
  position: sticky; inset: auto; top: 0; height: 100svh; margin-bottom: -100svh;
}
/* scroll-reveal / mask-reveal: 기본 보임. 숨김은 런타임이 .m-hide로만 부여(no-JS=보임) */
.anaks-site [data-m="reveal"].m-hide { opacity: 0; transform: translateY(calc(26px * var(--m-amp))); }
.anaks-site [data-m="reveal"].m-show { opacity: 1; transform: none;
  transition: opacity calc(600ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1),
              transform calc(600ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1); }
.anaks-site [data-m="mask"] { overflow: hidden; }
.anaks-site [data-m="mask"].m-hide { clip-path: inset(0 100% 0 0); }
.anaks-site [data-m="mask"].m-show { clip-path: inset(0 0 0 0);
  transition: clip-path calc(720ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1); }
/* ken-burns: 배경 이미지 슬로우 줌 (콘텐츠 안 가림). 뷰포트 밖은 런타임이 play-state 정지 */
.anaks-site [data-m="kenburns"] { animation: anaks-kenburns calc(22s * var(--m-dur-scale)) ease-in-out infinite alternate; transform-origin: 50% 50%; }
@keyframes anaks-kenburns { from { transform: scale(1); } to { transform: scale(calc(1 + 0.08 * var(--m-amp))); } }
/* ---------- [3단계] Premium ---------- */
/* video-hero: 배경 영상. 기본 opacity 0 → 재생 성공 시에만 노출(런타임). no-JS·reduced-motion·로드실패면
   0 유지 → 뒤의 poster <img>가 그대로 보임(빈 화면 리스크 원천 차단). */
.anaks-site [data-m="videohero"], .anaks-site [data-m="cinematicvideo"] { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity calc(700ms * var(--m-dur-scale)) ease; }
/* split-text: 히어로 헤드라인 단어 등장 (reveal와 동일 hide/show, 인라인 블록) */
.anaks-site [data-m="splitword"] { display: inline-block; white-space: pre; }
.anaks-site [data-m="storyword"] { display: inline-block; white-space: pre; }
.anaks-site.m-cinematic-ready [data-m="storyword"],
.anaks-site.m-cinematic-ready [data-m-story] {
  opacity: var(--story-opacity, 1);
  transform: translate3d(0, calc(var(--story-y, 0px) + var(--cinematic-parallax-y, 0px)), 0);
}
.anaks-site.m-cinematic-ready [data-m-cinematic-layer]:not([data-m-story]) {
  transform: translate3d(0, var(--cinematic-parallax-y, 0px), 0);
}
.anaks-site.m-cinematic-ready [data-m-cinematic-media] {
  transform: scale(var(--cinematic-scale, 1));
  clip-path: inset(var(--cinematic-clip, 0%) round 24px);
  transform-origin: 50% 50%;
}
/* ---------- [SS3] 페이지 관통 다막 무대 ----------
   기본(no-JS/reduced)은 poster + 시맨틱 article 세로 스택. ready에서만 데스크 pin/막 전환으로 향상한다. */
.anaks-site [data-ss-stage] {
  position: relative; height: var(--ss-scroll-height); background: var(--ss-stage-bg);
  contain: layout paint;
}
.anaks-site [data-ss-pin] { position: relative; height: 100%; }
.anaks-site [data-ss-media] { position: absolute; inset: 0 0 auto; height: 100svh; min-height: 360px; overflow: hidden; }
.anaks-site [data-ss-act-list] { position: relative; z-index: 2; }
.anaks-site [data-ss-act] {
  position: relative; min-height: 100svh; display: flex; align-items: center;
  padding: clamp(48px, 8vw, 120px); color: var(--ss-stack-text); background: var(--ss-stack-bg);
}
.anaks-site [data-ss-copy] { width: min(820px, 100%); margin: 0 auto; }
.anaks-site [data-ss-heading] {
  margin: 0; font-family: var(--ss-heading-font); font-size: clamp(2rem, 5vw, 5rem); line-height: 1.12;
  word-break: keep-all; overflow-wrap: anywhere; text-wrap: balance;
}
.anaks-site [data-ss-body] {
  margin: 24px 0 0; max-width: 680px; font-size: clamp(1rem, 1.5vw, 1.35rem); line-height: 1.75;
  word-break: keep-all; overflow-wrap: anywhere; text-wrap: pretty;
}
.anaks-site [data-ss-word] { display: inline-block; white-space: pre; }
.anaks-site.m-scrollytelling-ready [data-ss-stage] { height: var(--ss-scroll-height); }
.anaks-site.m-scrollytelling-ready [data-ss-pin] { position: sticky; top: 0; height: 100svh; overflow: hidden; }
.anaks-site.m-scrollytelling-ready [data-ss-media] { position: absolute; inset: 0; height: auto; min-height: 0; }
.anaks-site.m-scrollytelling-ready [data-ss-act-list] { position: absolute; inset: 0; }
.anaks-site.m-scrollytelling-ready [data-ss-act] {
  position: absolute; inset: 0; min-height: 0; opacity: var(--ss-act-opacity, 1);
  transform: translate3d(0, var(--ss-act-y, 0px), 0); color: var(--ss-text); background: transparent;
  pointer-events: none;
}
.anaks-site.m-scrollytelling-ready [data-ss-copy] {
  padding: clamp(24px, 4vw, 52px);
  border-radius: max(var(--signature-radius, 8px), 18px);
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--ss-stage-bg) 82%, transparent) 0%,
    color-mix(in srgb, var(--ss-stage-bg) 54%, transparent) 68%,
    transparent 100%);
}
.anaks-site.m-scrollytelling-ready [data-ss-word] {
  opacity: var(--ss-word-opacity, 1); transform: translate3d(0, var(--ss-word-y, 0px), 0);
}
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] { height: auto; }
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-pin] { position: relative; top: auto; height: auto; overflow: visible; }
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-media] {
  position: sticky; inset: auto; top: 0; height: 100svh; min-height: 0; margin-bottom: -100svh;
}
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-act-list] { position: relative; inset: auto; }
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-act] {
  position: relative; inset: auto; min-height: 58svh; padding: 48px 20px; pointer-events: auto;
  opacity: 1 !important; transform: none !important;
}
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-word] {
  opacity: 1 !important; transform: none !important;
}
@media (max-width: 767.98px) {
  /* 실제 모바일은 같은 sticky 무대에서 loop 영상 + 진행도 카피를 사용한다.
     video scrub은 capability resolver에서 이미 차단된다. 강제 mode="mobile" 미리보기만 위의 세로 stack이다. */
  .anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="auto"] [data-ss-act] {
    padding: clamp(72px, 12svh, 96px) 20px;
  }
}
.anaks-site.m-scrollytelling-static [data-ss-stage] { height: auto; contain: none; }
.anaks-site.m-scrollytelling-static [data-ss-video] { display: none !important; }
@media (prefers-reduced-motion: reduce) {
  .anaks-site [data-ss-stage] { height: auto !important; contain: none; }
  .anaks-site [data-ss-pin] { height: auto; }
  .anaks-site [data-ss-media] { position: relative; inset: auto; height: var(--ss-static-height); }
  .anaks-site [data-ss-act] { min-height: 0; }
}

/* ---------- motion-signatures v2 ----------
   기본 마크업은 항상 읽히는 세로 문서다. .m-signature-ready는 capability 확인 뒤에만 붙고
   예약된 track geometry 안에서 position/transform/clip만 바꾼다. */
.anaks-site [data-motion-signature] {
  --signature-progress: 0; position: relative; isolation: isolate;
  color: var(--signature-text, inherit); background: var(--signature-bg, transparent);
  font-family: var(--signature-body-font, inherit);
}
.anaks-site [data-signature-heading] {
  margin: 0; font-family: var(--signature-heading-font, inherit); font-size: clamp(2rem, 5vw, 5.5rem);
  line-height: 1.08; letter-spacing: -.035em; word-break: keep-all; overflow-wrap: anywhere; text-wrap: balance;
}
.anaks-site h3[data-signature-heading] { font-size: clamp(1.45rem, 2.8vw, 3rem); letter-spacing: -.025em; }
.anaks-site [data-signature-body] { margin: 1rem 0 0; font-size: clamp(1rem, 1.35vw, 1.25rem); line-height: 1.75; word-break: keep-all; overflow-wrap: anywhere; text-wrap: pretty; }
.anaks-site [data-signature-caption] { color: var(--signature-muted, currentColor); font-size: .9rem; line-height: 1.55; }
.anaks-site [data-signature-media] {
  position: relative; overflow: hidden; margin: 0; border-radius: max(var(--signature-radius, 8px), 18px);
  background: var(--signature-surface, #eee); box-shadow: 0 26px 80px -46px rgba(0,0,0,.55);
}
.anaks-site [data-signature-media] > img,
.anaks-site [data-signature-media] > video { display: block; width: 100%; height: 100%; object-fit: cover; }
.anaks-site [data-signature-media] > video { position: absolute; inset: 0; opacity: 0; transition: opacity 300ms ease; }
.anaks-site [data-signature-media] > figcaption {
  position: absolute; right: 12px; bottom: 12px; left: 12px; z-index: 3; width: fit-content;
  max-width: calc(100% - 24px); padding: .4rem .65rem; border-radius: 999px;
  color: #fff; background: rgba(0,0,0,.62); backdrop-filter: blur(8px);
}
.anaks-site [data-signature-corners="precise"] [data-signature-media] { border-radius: 4px; }
.anaks-site [data-signature-corners="soft"] [data-signature-media] { border-radius: max(var(--signature-radius), 14px); }
.anaks-site [data-signature-corners="rounded"] [data-signature-media] { border-radius: max(var(--signature-radius), 28px); }
.anaks-site [data-signature-art-direction="editorial-luxury"] [data-signature-heading] { letter-spacing: -.05em; }
.anaks-site [data-signature-art-direction="professional-precision"] [data-signature-media],
.anaks-site [data-signature-art-direction="clinical-informational"] [data-signature-media] { box-shadow: 0 20px 52px -44px rgba(0,0,0,.5); }
.anaks-site [data-signature-art-direction="creative-spatial"] [data-signature-media] { box-shadow: 0 36px 96px -48px rgba(0,0,0,.66); }
.anaks-site [data-signature-art-direction="warm-tactile"] [data-signature-media] { box-shadow: 0 28px 72px -48px color-mix(in srgb, var(--signature-primary) 42%, transparent); }
.anaks-site [data-signature-progress-rail] {
  position: absolute; z-index: 12; display: none; overflow: hidden;
  background: color-mix(in srgb, var(--signature-text) 18%, transparent); border-radius: 999px;
}
.anaks-site [data-motion-signature].m-signature-ready [data-signature-progress-rail] { display: block; }
.anaks-site [data-signature-progress-fill] {
  display: block; width: 100%; height: 100%; background: var(--signature-accent);
  transform-origin: 0 0; transform: scaleY(var(--signature-progress, 0));
}

/* cinematic-scrub: no-JS는 poster+copy 한 화면, capability 확인 뒤에만 예약 track을 pin한다. */
.anaks-site [data-signature-id="cinematic-scrub"] { min-height: min(100svh, 900px); }
.anaks-site [data-signature-id="cinematic-scrub"] [data-signature-pin] {
  position: relative; min-height: min(100svh, 900px); display: grid; align-items: end; overflow: hidden;
}
.anaks-site [data-signature-id="cinematic-scrub"] [data-signature-media] {
  position: absolute; inset: 0; width: 100%; height: 100%; aspect-ratio: auto !important; border-radius: 0; box-shadow: none;
}
.anaks-site [data-signature-id="cinematic-scrub"] [data-cinematic-scrim] {
  position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, transparent 22%, rgba(0,0,0,.72) 100%);
}
.anaks-site [data-signature-id="cinematic-scrub"] [data-cinematic-copy] {
  position: relative; z-index: 2; padding: clamp(48px, 9vw, 136px); color: #fff;
}
.anaks-site [data-signature-id="cinematic-scrub"].m-signature-ready { height: var(--signature-track-height); }
.anaks-site [data-signature-id="cinematic-scrub"].m-signature-ready [data-signature-pin] {
  position: sticky; top: 0; height: 100svh; min-height: 0;
}

/* v2 manifesto uses the same proven stage CSS while keeping structured MotionScene content. */
.anaks-site [data-signature-id="scrollytelling-manifesto"] [data-ss-media] [data-signature-media] {
  width: 100%; height: 100%; aspect-ratio: auto !important; border-radius: 0; box-shadow: none;
}

/* 시그니처 뒤 일반 섹션도 같은 홈 흐름 안에서 진행도 안무를 이어 간다.
   기본값은 완성된 정적 문서이며 ready일 때만 예약된 래퍼 안의 transform/opacity를 갱신한다. */
.anaks-site [data-signature-continuation] {
  --continuation-x: 0px; --continuation-y: 0px; --continuation-scale: 1;
  --continuation-opacity: 1; --continuation-light: 0; --continuation-light-x: -18%;
  position: relative; isolation: isolate; overflow: hidden;
}
.anaks-site.m-cinematic-ready [data-signature-continuation] [data-section-type] {
  opacity: var(--continuation-opacity);
  transform: translate3d(var(--continuation-x), var(--continuation-y), 0) scale(var(--continuation-scale));
  transform-origin: 50% 50%;
}
.anaks-site.m-cinematic-ready [data-signature-continuation]::after {
  content: ''; position: absolute; inset: -18%; z-index: 8; pointer-events: none;
  background: linear-gradient(112deg, transparent 35%, rgba(255,255,255,.16) 49%, transparent 63%);
  opacity: var(--continuation-light); transform: translate3d(var(--continuation-light-x),0,0);
  mix-blend-mode: soft-light;
}
@media (max-width: 767.98px) {
  .anaks-site.m-cinematic-ready [data-signature-continuation] [data-section-type] {
    transform: translate3d(0, var(--continuation-y), 0) scale(var(--continuation-scale));
  }
}
@media (prefers-reduced-motion: reduce) {
  .anaks-site [data-signature-continuation] [data-section-type] {
    opacity: 1 !important; transform: none !important;
  }
  .anaks-site [data-signature-continuation]::after { display: none !important; }
}

/* sticky-chapters: no-JS는 chapter별 media/text 세로 문서, desktop enhancement만 media sticky. */
.anaks-site [data-signature-id="sticky-chapters"] [data-signature-chapter] {
  min-height: 70svh; padding: clamp(40px, 7vw, 112px); display: grid; gap: clamp(24px, 5vw, 72px); align-items: start;
}
.anaks-site [data-signature-id="sticky-chapters"] [data-chapter-copy] { align-self: center; }
.anaks-site [data-signature-id="sticky-chapters"] [data-chapter-indicator] {
  display: none; list-style: none; margin: 0; padding: 0;
}
.anaks-site [data-signature-id="sticky-chapters"].m-signature-ready [data-signature-chapter] {
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, .9fr); min-height: 100svh;
}
.anaks-site [data-signature-id="sticky-chapters"] > [data-signature-progress-rail] {
  top: 12svh; right: clamp(16px, 2vw, 34px); bottom: 12svh; width: 3px;
}
.anaks-site [data-signature-id="sticky-chapters"].m-signature-ready [data-chapter-media] {
  position: sticky; top: clamp(56px, 10svh, 112px); opacity: var(--chapter-emphasis, .55);
  transform: scale(var(--chapter-scale, .985)); clip-path: inset(var(--chapter-clip, 2.5%) round max(var(--signature-radius), 18px));
  transition: opacity 260ms var(--signature-easing), transform 260ms var(--signature-easing), clip-path 260ms var(--signature-easing);
}
.anaks-site [data-signature-id="sticky-chapters"].m-signature-ready [data-chapter-media]::after {
  content: ''; position: absolute; inset: -12%; z-index: 2; pointer-events: none;
  background: linear-gradient(112deg, transparent 34%, color-mix(in srgb, var(--signature-accent) 22%, white) 49%, transparent 64%);
  opacity: var(--chapter-light, 0); transform: translate3d(var(--chapter-light-x, -24%),0,0);
}
.anaks-site [data-signature-id="sticky-chapters"].m-signature-ready [data-chapter-copy] {
  opacity: var(--chapter-copy-opacity, .72); transform: translate3d(0,var(--chapter-copy-y, 10px),0);
}
.anaks-site [data-signature-id="sticky-chapters"].m-signature-ready [data-chapter-indicator] {
  position: sticky; top: 50%; z-index: 14; float: right; display: grid; width: 42px; margin: 0 18px -100%; transform: translateY(-50%); gap: 7px;
}
.anaks-site [data-signature-id="sticky-chapters"] [data-chapter-indicator-item] {
  display: flex; justify-content: flex-end; color: var(--signature-muted); font-size: .66rem; font-variant-numeric: tabular-nums;
}
.anaks-site [data-signature-id="sticky-chapters"] [data-chapter-indicator-item]::before {
  content: ''; align-self: center; width: var(--chapter-dot-width, 8px); height: 1px; margin-right: 7px; background: currentColor;
}
.anaks-site [data-signature-id="sticky-chapters"] [data-chapter-indicator-item][data-active] {
  color: var(--signature-accent); font-weight: 800;
}

/* true-card-stack: 기존 IO stacking과 별개인 실제 native sticky stack. */
.anaks-site [data-signature-id="true-card-stack"] [data-card-list] {
  list-style: none; margin: 0; padding: clamp(48px, 8vw, 112px); display: grid; gap: 24px;
}
.anaks-site [data-signature-id="true-card-stack"] [data-stack-card] {
  position: relative; min-height: clamp(260px, 48svh, 520px); padding: clamp(24px, 5vw, 64px);
  border-radius: clamp(18px, 2vw, 32px); background: var(--card-bg, var(--signature-surface, #fff));
  transform-origin: 50% 0;
}
.anaks-site [data-signature-id="true-card-stack"] [data-stack-card]::before {
  content: ''; position: absolute; inset: 0 0 auto; height: 2px; border-radius: inherit;
  background: linear-gradient(90deg, transparent, var(--signature-accent), transparent); opacity: .52;
}
.anaks-site [data-signature-id="true-card-stack"].m-signature-ready [data-card-list] { padding-bottom: clamp(72px, 16svh, 180px); }
.anaks-site [data-signature-id="true-card-stack"].m-signature-ready [data-stack-card] {
  position: sticky; top: calc(56px + var(--card-index, 0) * 14px);
  transform: scale(var(--card-scale, 1)) translate3d(0, var(--card-y, 0px), 0);
  box-shadow: 0 38px 90px -64px rgba(0,0,0,.7);
}

/* portal/curtain/horizontal: SSR track 높이는 scene 수로 확정되고 fallback panel이 그 높이를 채운다. */
.anaks-site [data-signature-id="portal-zoom"],
.anaks-site [data-signature-id="scroll-curtain"],
.anaks-site [data-signature-id="horizontal-story"] { height: auto; }
.anaks-site [data-signature-panel] {
  min-height: 100svh; padding: clamp(48px, 8vw, 120px); display: grid; align-content: center; gap: 28px;
}
.anaks-site [data-signature-id="portal-zoom"].m-signature-ready [data-signature-pin],
.anaks-site [data-signature-id="scroll-curtain"].m-signature-ready [data-signature-pin],
.anaks-site [data-signature-id="horizontal-story"].m-signature-ready [data-signature-pin] {
  position: sticky; top: 0; height: 100svh; overflow: hidden;
}
.anaks-site [data-signature-id="portal-zoom"].m-signature-ready,
.anaks-site [data-signature-id="scroll-curtain"].m-signature-ready,
.anaks-site [data-signature-id="horizontal-story"].m-signature-ready { height: var(--signature-track-height); }
.anaks-site [data-signature-id="portal-zoom"].m-signature-ready [data-signature-panel],
.anaks-site [data-signature-id="scroll-curtain"].m-signature-ready [data-signature-panel] {
  position: absolute; inset: 0; opacity: var(--scene-opacity, 1); pointer-events: var(--scene-pointer, auto);
}
.anaks-site [data-signature-id="portal-zoom"] [data-signature-panel],
.anaks-site [data-signature-id="scroll-curtain"] [data-signature-panel],
.anaks-site [data-signature-id="horizontal-story"] [data-signature-panel] {
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr); align-items: center;
}
.anaks-site [data-signature-panel] [data-signature-media] { max-height: min(68svh, 760px); }
.anaks-site [data-signature-id="portal-zoom"].m-signature-ready [data-portal-media] {
  width: 100%; height: 100%; max-height: none; aspect-ratio: auto !important; border-radius: inherit;
  transform: scale(var(--portal-media-scale, 1.025)); transform-origin: 50% 50%; box-shadow: none;
}
.anaks-site [data-signature-id="portal-zoom"] [data-portal-aperture] { position: relative; }
.anaks-site [data-signature-id="portal-zoom"].m-signature-ready [data-signature-panel] {
  grid-template-columns: 1fr; place-items: center; isolation: isolate;
  background: color-mix(in srgb, var(--signature-bg) 92%, var(--signature-surface));
}
.anaks-site [data-signature-id="portal-zoom"].m-signature-ready [data-portal-aperture] {
  position: absolute; left: 50%; top: 50%; width: min(92vw, 1380px); height: min(84svh, 860px);
  transform: translate3d(-50%,-50%,0) scale(var(--portal-scale, .66));
  clip-path: inset(var(--portal-clip, 11%) round var(--portal-radius, 30px)); overflow: hidden;
  box-shadow: 0 44px 120px -58px color-mix(in srgb, var(--signature-text) 48%, transparent);
}
.anaks-site [data-signature-id="portal-zoom"].m-signature-ready [data-portal-boundary] {
  position: absolute; inset: 0; z-index: 3; pointer-events: none; border-radius: inherit;
  border: 1px solid color-mix(in srgb, var(--signature-text) 28%, transparent);
  box-shadow: inset 0 0 80px color-mix(in srgb, var(--signature-text) 16%, transparent), 0 0 0 1px color-mix(in srgb, var(--signature-accent) 16%, transparent);
  opacity: var(--portal-boundary-opacity, .72);
}
.anaks-site [data-signature-id="portal-zoom"].m-signature-ready [data-scene-copy] {
  position: relative; z-index: 4; width: min(42rem, calc(100vw - 48px)); margin-inline-start: min(42vw, 620px);
  padding: clamp(24px, 4vw, 56px); border: 1px solid color-mix(in srgb, var(--signature-text) 12%, transparent);
  border-radius: max(var(--signature-radius), 18px); color: var(--signature-text);
  background: color-mix(in srgb, var(--signature-bg) 91%, transparent);
  box-shadow: 0 28px 80px -54px color-mix(in srgb, var(--signature-text) 62%, transparent);
  opacity: var(--portal-copy-opacity, 1); transform: translate3d(var(--portal-copy-x, 0px),0,0);
}
.anaks-site [data-signature-id="portal-zoom"][data-signature-corners="precise"] { --portal-radius: 12px; }
.anaks-site [data-signature-id="portal-zoom"][data-signature-corners="soft"] { --portal-radius: 42px; }
.anaks-site [data-signature-id="portal-zoom"][data-signature-corners="spatial"] { --portal-radius: 50% 50% 24% 24% / 18% 18% 12% 12%; }
.anaks-site [data-signature-id="portal-zoom"] [data-portal-media]::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(112deg, color-mix(in srgb, var(--signature-bg) 18%, transparent), transparent 38%, color-mix(in srgb, var(--signature-accent) 10%, transparent));
}
.anaks-site [data-signature-id="scroll-curtain"].m-signature-ready [data-curtain-panel] {
  background: var(--signature-bg);
  transform: translate3d(0, var(--curtain-y, 0%), 0);
  clip-path: inset(0 0 var(--curtain-clip, 0%) 0);
  transition-timing-function: var(--signature-easing);
}
.anaks-site [data-signature-id="scroll-curtain"].m-signature-ready [data-curtain-copy] {
  opacity: var(--curtain-copy-opacity, 1); transform: translate3d(0,var(--curtain-copy-y, 0px),0);
}
.anaks-site [data-signature-id="scroll-curtain"].m-signature-ready [data-curtain-media] {
  transform: scale(var(--curtain-media-scale, 1)); transform-origin: 50% 50%;
}
.anaks-site [data-signature-id="scroll-curtain"] [data-curtain-edge] { display: none; }
.anaks-site [data-signature-id="scroll-curtain"].m-signature-ready [data-curtain-edge] {
  display: block; position: absolute; z-index: 8; left: 0; right: 0; top: calc(100% - var(--curtain-clip, 0%)); height: 2px;
  pointer-events: none; opacity: var(--curtain-edge-opacity, 0);
  background: linear-gradient(90deg, transparent 4%, color-mix(in srgb, var(--signature-accent) 72%, white), transparent 96%);
  box-shadow: 0 -9px 24px color-mix(in srgb, var(--signature-text) 24%, transparent), 0 7px 22px color-mix(in srgb, var(--signature-accent) 20%, transparent);
}
.anaks-site [data-signature-id="scroll-curtain"][data-signature-art-direction="creative-spatial"].m-signature-ready [data-curtain-panel] {
  transform: translate3d(var(--curtain-x, 0%),0,0); clip-path: inset(0 var(--curtain-clip, 0%) 0 0);
}
.anaks-site [data-signature-id="scroll-curtain"][data-signature-art-direction="creative-spatial"].m-signature-ready [data-curtain-edge] {
  left: calc(100% - var(--curtain-clip, 0%)); right: auto; top: 0; bottom: 0; width: 2px; height: auto;
  background: linear-gradient(180deg, transparent 4%, color-mix(in srgb, var(--signature-accent) 72%, white), transparent 96%);
}
.anaks-site [data-signature-id="scroll-curtain"] [data-curtain-panel]::after {
  content: ''; position: absolute; right: 0; bottom: 0; left: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--signature-accent), transparent); opacity: .7;
}

/* mosaic: 저장된 index 순서만 소비하며 기본은 완전 가시. */
.anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-grid] {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(10px, 1.6vw, 24px);
  padding: clamp(24px, 5vw, 72px) clamp(24px, 7vw, 104px) clamp(40px, 7vw, 104px);
}
.anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-tile] { min-width: 0; margin: 0; }
.anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-tile][data-tile-shape="portrait"] { grid-row: span 2; }
.anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-focal] { grid-column: span 2; grid-row: span 2; }
.anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-tile] [data-signature-media] {
  background: color-mix(in srgb, var(--signature-surface) 76%, var(--signature-primary));
  border: 1px solid color-mix(in srgb, var(--signature-text) 10%, transparent);
}
.anaks-site [data-signature-id="mosaic-reveal"].m-signature-ready [data-mosaic-tile] {
  opacity: var(--mosaic-opacity, .24); transform: translate3d(0, var(--mosaic-y, 14px), 0) scale(var(--mosaic-scale, .988));
}
.anaks-site [data-signature-id="mosaic-reveal"].m-signature-ready [data-mosaic-focal] {
  opacity: var(--mosaic-opacity, 1); transform: translate3d(0, var(--mosaic-y, 0px), 0) scale(var(--mosaic-scale, 1));
}
@media (hover: hover) and (pointer: fine) {
  .anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-tile][data-active] img {
    transition: transform 420ms var(--signature-easing);
  }
  .anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-tile][data-active]:hover img {
    transform: scale(1.015);
  }
}

/* path-journey: semantic ol/li 위에 transform-only 진행선. */
.anaks-site [data-signature-id="path-journey"] [data-path-stage] { position: relative; }
.anaks-site [data-signature-id="path-journey"] [data-path-stage]::before {
  content: ''; position: absolute; top: 64px; bottom: 64px; left: 50%; width: 3px;
  background: color-mix(in srgb, var(--signature-text) 14%, transparent);
}
.anaks-site [data-signature-id="path-journey"] [data-path-list] {
  list-style: none; margin: 0; padding: clamp(48px, 8vw, 112px);
}
.anaks-site [data-signature-id="path-journey"] [data-path-line] {
  position: absolute; top: 64px; bottom: 64px; left: 50%; width: 3px; transform-origin: 50% 0;
  transform: scaleY(var(--path-progress, 1)); background: var(--signature-accent); opacity: .82;
}
.anaks-site [data-signature-id="path-journey"] [data-path-milestone] {
  position: relative; width: min(46%, 620px); margin-bottom: 52px; opacity: var(--milestone-opacity, 1);
  transform: translate3d(0, var(--milestone-y, 0px), 0);
}
.anaks-site [data-signature-id="path-journey"] [data-path-milestone] article {
  padding: clamp(22px, 3vw, 38px); border: 1px solid color-mix(in srgb, var(--signature-text) 11%, transparent);
  border-radius: max(var(--signature-radius), 16px); background: color-mix(in srgb, var(--signature-surface) 94%, transparent);
  box-shadow: 0 24px 68px -56px color-mix(in srgb, var(--signature-text) 58%, transparent);
}
.anaks-site [data-signature-id="path-journey"] [data-path-stage][data-path-count="3"] [data-path-list] { max-width: 1240px; margin-inline: auto; }
.anaks-site [data-signature-id="path-journey"] [data-path-stage][data-path-count="3"] [data-path-milestone] {
  width: min(52%, 680px); margin-bottom: clamp(72px, 10vw, 128px);
}
.anaks-site [data-signature-id="path-journey"] [data-path-milestone]:nth-of-type(even) { margin-left: auto; }
.anaks-site [data-signature-id="path-journey"] [data-path-marker] {
  position: absolute; top: .5rem; right: -9.5%; width: 14px; height: 14px; border: 3px solid var(--signature-bg);
  border-radius: 50%; background: var(--signature-muted); transform: scale(var(--milestone-marker-scale, .72));
  box-shadow: 0 0 0 var(--milestone-ring, 0px) color-mix(in srgb, var(--signature-accent) 18%, transparent);
  transition: background-color 180ms linear, box-shadow 180ms linear;
}
.anaks-site [data-signature-id="path-journey"] [data-path-milestone]:nth-of-type(even) [data-path-marker] { right: auto; left: -9.5%; }
.anaks-site [data-signature-id="path-journey"] [data-path-milestone][data-complete] [data-path-marker] { background: var(--signature-accent); }
.anaks-site [data-signature-id="path-journey"] [data-path-milestone][data-current] [data-path-marker] { background: var(--signature-accent); }
.anaks-site [data-signature-id="path-journey"] [data-path-milestone][data-current] article {
  border-color: color-mix(in srgb, var(--signature-accent) 52%, var(--signature-text));
}
.anaks-site [data-signature-id="path-journey"] [data-path-milestone][data-current] [data-signature-heading] {
  font-weight: 800;
}

/* before-after: fallback은 두 실제 사진의 명확한 grid, enhancement만 동일 geometry에 겹친다. */
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-viewport] {
  display: grid; grid-template-columns: 1fr; gap: 0; position: relative;
  aspect-ratio: var(--before-after-ratio, 4 / 3); overflow: hidden; background: var(--signature-surface);
}
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-shell] { padding: clamp(40px, 8vw, 112px); }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-heading] { display: grid; gap: 18px; margin-bottom: 32px; }
.anaks-site [data-before-after-label="actual-case"] {
  position: relative !important; z-index: 20 !important; display: inline-flex !important; width: fit-content !important;
  opacity: 1 !important; visibility: visible !important; color: #fff !important; background: #111 !important;
  border: 2px solid #fff !important; mix-blend-mode: normal !important; filter: none !important;
}
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame] {
  position: relative; grid-area: 1 / 1; min-width: 0; height: 100%; margin: 0; overflow: hidden; aspect-ratio: auto !important;
}
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame="after"] {
  clip-path: inset(0 var(--before-after-clip, 50%) 0 0);
}
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame] img { background: var(--signature-surface); }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame] figcaption {
  position: absolute; top: 12px; left: 12px; z-index: 5; margin: 0; padding: .38rem .62rem;
  border-radius: 999px; color: #fff; background: rgba(17,17,17,.86); font-weight: 700;
}
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame="after"] figcaption { right: 12px; left: auto; }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-range] {
  display: block; width: 100%; height: 44px; margin: 0; opacity: 0; visibility: hidden; pointer-events: none;
  appearance: none; -webkit-appearance: none; background: transparent; cursor: ew-resize; accent-color: var(--signature-accent);
}
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-control] {
  display: grid; align-content: start; gap: 6px; min-height: 82px; margin-top: 22px; opacity: 0; visibility: hidden; font-weight: 700;
}
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-control-row] { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-output] { display: inline-block; width: 4ch; color: var(--signature-accent); font-variant-numeric: tabular-nums; text-align: right; }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-help] { color: var(--signature-muted); font-size: .78rem; font-weight: 500; }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-range]::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--signature-text) 22%, var(--signature-surface)); }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-range]::-webkit-slider-thumb { width: 24px; height: 24px; margin-top: -10px; border: 2px solid var(--signature-text); border-radius: 50%; background: var(--signature-surface); box-shadow: 0 4px 14px color-mix(in srgb, var(--signature-text) 22%, transparent); -webkit-appearance: none; }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-range]::-moz-range-track { height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--signature-text) 22%, var(--signature-surface)); }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-range]::-moz-range-thumb { width: 22px; height: 22px; border: 2px solid var(--signature-text); border-radius: 50%; background: var(--signature-surface); box-shadow: 0 4px 14px color-mix(in srgb, var(--signature-text) 22%, transparent); }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-range]:focus-visible { outline: 3px solid color-mix(in srgb, var(--signature-accent) 72%, transparent); outline-offset: 3px; }
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-viewport] { cursor: ew-resize; touch-action: pan-y; }
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-frame] { grid-area: 1 / 1; height: 100%; }
.anaks-site [data-signature-id="before-after-scrub"] [data-before-after-handle] { display: none; }
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-handle] {
  position: absolute; inset: 0 auto 0 0; z-index: 8;
  display: block; width: 100%;
  transform: translate3d(calc(100% - var(--before-after-clip, 50%)), 0, 0);
  pointer-events: none;
}
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-handle]::before {
  content: ''; position: absolute; inset: 0 auto 0 -2px; width: 4px;
  border-right: 1px solid #111; border-left: 1px solid #111; background: #fff;
}
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-handle] > span {
  position: absolute; top: 50%; left: 0; width: 42px; height: 42px; border: 2px solid #111; border-radius: 50%;
  background: #fff; color: #111; transform: translate(-50%,-50%); box-shadow: 0 8px 24px rgba(0,0,0,.24);
}
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-handle] > span::before,
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-handle] > span::after {
  position: absolute; top: 50%; font-size: 18px; font-weight: 900; line-height: 1; transform: translateY(-56%);
}
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-handle] > span::before { content: '‹'; left: 8px; }
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-handle] > span::after { content: '›'; right: 8px; }
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-control] {
  opacity: 1; visibility: visible;
}
.anaks-site [data-signature-id="before-after-scrub"].m-signature-ready [data-before-after-range] {
  opacity: 1; visibility: visible; pointer-events: auto;
}

/* horizontal-story: rail 변환은 strict capability를 통과한 desktop에서만 ready가 붙는다. */
.anaks-site [data-signature-id="horizontal-story"] [data-horizontal-kicker] {
  margin: 0; padding: clamp(24px, 4vw, 56px) clamp(24px, 5vw, 80px) 0;
  color: var(--signature-muted); font-size: .875rem; font-weight: 700; letter-spacing: .02em;
}
.anaks-site [data-signature-id="horizontal-story"].m-signature-ready [data-horizontal-kicker] {
  position: absolute; top: clamp(24px, 4svh, 48px); left: clamp(24px, 5vw, 80px); z-index: 4; padding: 0;
}
.anaks-site [data-signature-id="horizontal-story"] [data-horizontal-rail] { display: block; }
.anaks-site [data-signature-id="horizontal-story"].m-signature-ready [data-horizontal-rail] {
  height: 100%; display: flex; flex-wrap: nowrap; transform: translate3d(var(--horizontal-x, 0px), 0, 0);
}
.anaks-site [data-signature-id="horizontal-story"].m-signature-ready [data-signature-panel] {
  box-sizing: border-box; flex: 0 0 100%; min-width: 100%; height: 100%; min-height: 0;
  padding: clamp(84px, 11svh, 128px) clamp(42px, 7vw, 112px); overflow: clip;
}
.anaks-site [data-signature-id="horizontal-story"].m-signature-ready [data-horizontal-panel] [data-signature-media] {
  max-height: min(54svh, 620px); transform: scale(var(--horizontal-media-scale, 1)); transform-origin: 50% 50%;
}
.anaks-site [data-signature-id="horizontal-story"].m-signature-ready [data-panel-copy] {
  min-width: 0; opacity: var(--horizontal-copy-opacity, 1); transform: translate3d(var(--horizontal-copy-x, 0px),0,0);
}
.anaks-site [data-signature-id="horizontal-story"] [data-horizontal-indicator] {
  display: none; list-style: none; margin: 0; padding: 0;
}
.anaks-site [data-signature-id="horizontal-story"].m-signature-ready [data-horizontal-indicator] {
  position: absolute; right: clamp(24px, 5vw, 80px); bottom: clamp(34px, 7svh, 72px); left: clamp(24px, 5vw, 80px);
  z-index: 5; display: flex; justify-content: space-between; color: var(--signature-muted); font-size: .68rem; font-variant-numeric: tabular-nums;
}
.anaks-site [data-signature-id="horizontal-story"] [data-horizontal-step][data-current] { color: var(--signature-accent); font-weight: 800; }
.anaks-site [data-signature-id="horizontal-story"] [data-horizontal-step]::before {
  content: ''; display: block; width: 28px; height: 1px; margin-bottom: 6px; background: currentColor;
  transform: scaleX(var(--horizontal-step-scale, .2857)); transform-origin: 0 50%;
}
.anaks-site [data-signature-id="horizontal-story"] [data-signature-progress-rail] {
  right: clamp(24px, 5vw, 80px); bottom: clamp(20px, 5svh, 52px); left: clamp(24px, 5vw, 80px); height: 3px;
}
.anaks-site [data-signature-id="horizontal-story"] [data-signature-progress-fill] {
  transform-origin: 0 50%; transform: scaleX(var(--horizontal-progress, 0));
}

@media (max-width: 1023.98px) {
  .anaks-site [data-signature-id="sticky-chapters"] [data-signature-chapter] { display: block; min-height: 0; }
  .anaks-site [data-signature-id="sticky-chapters"] [data-chapter-media] { position: relative; top: auto; margin-bottom: 28px; opacity: 1; transform: none; }
  .anaks-site [data-signature-id="sticky-chapters"] [data-chapter-copy] { opacity: 1; transform: none; }
  .anaks-site [data-signature-id="sticky-chapters"] [data-chapter-indicator] { display: none; }
  .anaks-site [data-signature-id="portal-zoom"],
  .anaks-site [data-signature-id="scroll-curtain"],
  .anaks-site [data-signature-id="horizontal-story"] { height: auto; }
  .anaks-site [data-signature-id="portal-zoom"] [data-signature-pin],
  .anaks-site [data-signature-id="scroll-curtain"] [data-signature-pin],
  .anaks-site [data-signature-id="horizontal-story"] [data-signature-pin] { position: relative; height: auto; overflow: visible; }
  .anaks-site [data-signature-id="portal-zoom"] [data-signature-panel],
  .anaks-site [data-signature-id="scroll-curtain"] [data-signature-panel],
  .anaks-site [data-signature-id="horizontal-story"] [data-signature-panel] {
    position: relative; inset: auto; min-height: 0; display: grid; grid-template-columns: 1fr;
  }
  .anaks-site [data-signature-id="horizontal-story"] [data-horizontal-rail] {
    display: block !important; max-width: 100%; transform: none !important; overflow: visible;
  }
  .anaks-site [data-signature-id="horizontal-story"] [data-horizontal-indicator] { display: none; }
  .anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-grid] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-tile] { grid-column: auto; grid-row: auto; }
  .anaks-site [data-signature-id="path-journey"] [data-path-line],
  .anaks-site [data-signature-id="path-journey"] [data-path-stage]::before { left: 32px; }
  .anaks-site [data-signature-id="path-journey"] [data-path-stage][data-path-count] [data-path-milestone] {
    box-sizing: border-box; width: 100%; max-width: none; margin-left: 0 !important; padding-left: 44px;
  }
  .anaks-site [data-signature-id="path-journey"] [data-path-marker],
  .anaks-site [data-signature-id="path-journey"] [data-path-milestone]:nth-of-type(even) [data-path-marker] { right: auto; left: 25px; }
}
@media (max-width: 767.98px) {
  .anaks-site [data-signature-id="before-after-scrub"] [data-before-after-viewport] { grid-template-columns: 1fr; aspect-ratio: auto; overflow: visible; }
  .anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame] { grid-area: auto; height: auto; aspect-ratio: var(--before-after-ratio, 4 / 3) !important; }
  .anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame="after"] { clip-path: none; }
  .anaks-site [data-signature-id="before-after-scrub"] [data-before-after-control] { display: none; }
}
/* Dashboard/editor forced-mobile previews obey the same fallback even on a wide host viewport. */
.anaks-site [data-render-mode="mobile"][data-signature-id="sticky-chapters"] [data-signature-chapter] { display: block; min-height: 0; }
.anaks-site [data-render-mode="mobile"][data-signature-id="sticky-chapters"] [data-chapter-media] { position: relative; top: auto; margin-bottom: 28px; opacity: 1; transform: none; }
.anaks-site [data-render-mode="mobile"][data-signature-id="sticky-chapters"] [data-chapter-copy] { opacity: 1; transform: none; }
.anaks-site [data-render-mode="mobile"][data-signature-id="sticky-chapters"] [data-chapter-indicator] { display: none; }
.anaks-site [data-render-mode="mobile"][data-signature-id="portal-zoom"],
.anaks-site [data-render-mode="mobile"][data-signature-id="scroll-curtain"],
.anaks-site [data-render-mode="mobile"][data-signature-id="horizontal-story"] { height: auto; }
.anaks-site [data-render-mode="mobile"] [data-signature-pin] { position: relative; top: auto; height: auto; overflow: visible; }
.anaks-site [data-render-mode="mobile"] [data-signature-panel] { position: relative; inset: auto; min-height: 0; display: grid; grid-template-columns: 1fr; }
.anaks-site [data-render-mode="mobile"][data-signature-id="horizontal-story"] [data-horizontal-rail] {
  display: block !important; max-width: 100%; transform: none !important; overflow: visible;
}
.anaks-site [data-render-mode="mobile"][data-signature-id="horizontal-story"] [data-horizontal-indicator] { display: none; }
.anaks-site [data-render-mode="mobile"][data-signature-id="mosaic-reveal"] [data-mosaic-grid] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.anaks-site [data-render-mode="mobile"][data-signature-id="mosaic-reveal"] [data-mosaic-tile] { grid-column: auto; }
.anaks-site [data-render-mode="mobile"][data-signature-id="path-journey"] [data-path-line] { left: 32px; }
.anaks-site [data-render-mode="mobile"][data-signature-id="path-journey"] [data-path-milestone] { width: 100%; margin-left: 0 !important; padding-left: 44px; }
.anaks-site [data-render-mode="mobile"][data-signature-id="path-journey"] [data-path-marker] { right: auto; left: 25px; }
.anaks-site [data-render-mode="mobile"][data-signature-id="before-after-scrub"] [data-before-after-viewport] { grid-template-columns: 1fr; aspect-ratio: auto; overflow: visible; }
.anaks-site [data-render-mode="mobile"][data-signature-id="before-after-scrub"] [data-before-after-frame] { grid-area: auto; height: auto; aspect-ratio: var(--before-after-ratio, 4 / 3) !important; }
.anaks-site [data-render-mode="mobile"][data-signature-id="before-after-scrub"] [data-before-after-frame="after"] { clip-path: none; }
.anaks-site [data-render-mode="mobile"][data-signature-id="before-after-scrub"] [data-before-after-control] { display: none; }
@media (max-width: 639.98px) {
  .anaks-site [data-signature-id="mosaic-reveal"] [data-mosaic-grid] { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .anaks-site [data-motion-signature] { height: auto !important; }
  .anaks-site [data-motion-signature] [data-signature-pin] { position: relative !important; height: auto !important; overflow: visible !important; }
  .anaks-site [data-motion-signature] [data-signature-panel],
  .anaks-site [data-motion-signature] [data-signature-chapter],
  .anaks-site [data-motion-signature] [data-stack-card],
  .anaks-site [data-motion-signature] [data-mosaic-tile],
  .anaks-site [data-motion-signature] [data-path-milestone] {
    position: relative !important; inset: auto !important; min-height: 0 !important;
    opacity: 1 !important; transform: none !important; clip-path: none !important;
  }
  .anaks-site [data-signature-id="horizontal-story"] [data-horizontal-rail] { display: block !important; transform: none !important; }
  .anaks-site [data-signature-id="before-after-scrub"] [data-before-after-viewport] { grid-template-columns: 1fr !important; aspect-ratio: auto !important; overflow: visible !important; }
  .anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame] { grid-area: auto !important; height: auto !important; aspect-ratio: var(--before-after-ratio, 4 / 3) !important; }
  .anaks-site [data-signature-id="before-after-scrub"] [data-before-after-frame="after"] { clip-path: none !important; }
  .anaks-site [data-signature-id="before-after-scrub"] [data-before-after-control] { display: none !important; }
  .anaks-site [data-signature-progress-rail],
  .anaks-site [data-before-after-handle] { display: none !important; }
  .anaks-site [data-signature-id="cinematic-scrub"] [data-signature-pin] { min-height: min(100svh, 900px) !important; }
}
.anaks-site [data-m="splitword"].m-hide { opacity: 0; transform: translateY(calc(18px * var(--m-amp))); }
.anaks-site [data-m="splitword"].m-show { opacity: 1; transform: none;
  transition: opacity calc(520ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1),
              transform calc(520ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1); }
/* parallax: 레이어 translateY는 런타임이 인라인 transform으로 (GPU 힌트만 CSS) */
/* spotlight: 커서 추적 빛 (다크 섹션 한정 — 계획 단계에서 강제). 커서 좌표는 런타임 --mx/--my */
.anaks-site [data-m="spotlight"] { position: relative; }
.anaks-site [data-m="spotlight"]::before { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(40cqw circle at calc(var(--mx, 0.5) * 100%) calc(var(--my, 0.5) * 100%),
    rgba(255,255,255, calc(0.12 * var(--m-amp))), transparent 60%); }
/* stacking-cards: 카드가 scale+rise로 제자리에 안착(절대 캔버스 모델 내 정직 구현 — 진짜 pin-sticky는
   흐름 레이아웃 프리미티브 필요, 4단계 이월). reveal와 동일 hide/show IO 사용. */
.anaks-site [data-m="stacking"] { position: relative; }
.anaks-site [data-m="stackcard"].m-hide { opacity: 0; transform: translateY(calc(40px * var(--m-amp))) scale(0.96); }
.anaks-site [data-m="stackcard"].m-show { opacity: 1; transform: none;
  transition: opacity calc(680ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1),
              transform calc(680ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1); }
/* marquee: 흐름 띠 (트랙 복제로 심리스 루프, 복제는 aria-hidden). 뷰포트 밖은 런타임이 정지 */
.anaks-site .anaks-mq { overflow: hidden; width: 100%; }
.anaks-site .anaks-mq-track { display: flex; width: max-content; align-items: center; }
.anaks-site [data-m="marquee"] .anaks-mq-track { animation: anaks-marquee calc(32s * var(--m-dur-scale)) linear infinite; }
@keyframes anaks-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) {
  .anaks-site [data-m] { animation: none !important; transition: none !important; }
  .anaks-site [data-m="marquee"] .anaks-mq-track { animation: none !important; }
  .anaks-site [data-m="reveal"].m-hide, .anaks-site [data-m="mask"].m-hide,
  .anaks-site [data-m="splitword"].m-hide, .anaks-site [data-m="stackcard"].m-hide { opacity: 1 !important; transform: none !important; clip-path: none !important; }
  .anaks-site [data-m="spotlight"]::before { display: none !important; }
  .anaks-site [data-m="cinematicvideo"] { display: none !important; }
}
`;

/**
 * 의존성 0 IIFE. data-* 속성만 읽어 동작. JS 미로드 시 콘텐츠는 CSS 기본값(보임).
 * [3단계] 공통 모듈 확장: video(IO 재생/정지·poster 폴백) / pointer(--mx,--my·터치 비활성) /
 * scrollProgress(parallax 레이어·scroll-scrub 비디오 rAF lerp) / hover-video. 전부 뷰포트 밖 rAF 중단,
 * reduced-motion에서 전 모듈 정지(초기 early-return). 정적 내보내기 인라인 포함(2단계 경로 재사용).
 */
export const MOTION_RUNTIME = `(function(){
  try{
    var roots=Array.prototype.slice.call(document.querySelectorAll('.anaks-site'));
    if(!roots.length) return;
    var ownedRoots=window.__anaksMotionRuntimeRoots||[];
    if(window.__anaksMotionRuntimeReady&&window.__anaksMotionDispose&&roots.every(function(root){return ownedRoots.indexOf(root)>=0;}))return;
    if(window.__anaksMotionDispose){ try{ window.__anaksMotionDispose(); }catch(_){} }
    window.__anaksMotionRuntimeReady=true;window.__anaksMotionRuntimeRoots=roots;
    var cleanups=[], observers=[], timers=[], disposed=false;
    var q=function(s){ var out=[]; roots.forEach(function(root){ out=out.concat(Array.prototype.slice.call(root.querySelectorAll(s))); }); return out; };
    var rootOf=function(el){ return el&&el.closest?el.closest('.anaks-site'):null; };
    function listen(target,name,fn,opts){ target.addEventListener(name,fn,opts); cleanups.push(function(){target.removeEventListener(name,fn,opts);}); }
    function observe(io){ observers.push(io); return io; }
    function later(fn,ms){ var id=setTimeout(fn,ms); timers.push(id); return id; }
    function clamp(p){ return Math.min(1,Math.max(0,Number.isFinite(p)?p:0)); }
    function smooth(a,b,p){ if(b<=a)return p>=b?1:0; var t=clamp((p-a)/(b-a)); return t*t*(3-2*t); }
    function clearStage(stage){
      stage.classList.remove('m-signature-ready'); stage.removeAttribute('data-signature-active');
      ['--signature-progress','--phase-establish','--phase-progress','--phase-focal','--phase-settle','--horizontal-x','--horizontal-progress','--path-progress','--before-after-clip'].forEach(function(k){stage.style.removeProperty(k);});
      stage.__anaksPhaseWindows=null;
      stage.__anaksRangeControlled=false;stage.__anaksComparePending=null;stage.__anaksCompareRect=null;stage.__anaksComparePointer=null;
      progressWillChange(stage,false);
      Array.prototype.slice.call(stage.querySelectorAll('[data-active],[data-current],[data-ss-act],[data-ss-word],[data-signature-chapter],[data-chapter-indicator-item],[data-stack-card],[data-signature-panel],[data-portal-aperture],[data-portal-media],[data-scene-copy],[data-curtain-media],[data-curtain-edge],[data-mosaic-tile],[data-path-milestone],[data-horizontal-step],[data-horizontal-panel] [data-signature-media],[data-panel-copy]')).forEach(function(node){
        node.removeAttribute('data-active');node.removeAttribute('data-current');node.removeAttribute('data-complete');['--ss-act-opacity','--ss-act-x','--ss-act-y','--ss-act-scale','--ss-word-opacity','--ss-word-y','--chapter-emphasis','--chapter-scale','--chapter-clip','--chapter-light','--chapter-light-x','--chapter-copy-opacity','--chapter-copy-y','--chapter-dot-width','--card-scale','--card-y','--scene-opacity','--scene-pointer','--portal-scale','--portal-clip','--portal-boundary-opacity','--portal-media-scale','--portal-copy-opacity','--portal-copy-x','--curtain-y','--curtain-x','--curtain-clip','--curtain-copy-opacity','--curtain-copy-y','--curtain-media-scale','--curtain-edge-opacity','--mosaic-opacity','--mosaic-y','--mosaic-scale','--milestone-opacity','--milestone-y','--milestone-marker-scale','--milestone-ring','--horizontal-media-scale','--horizontal-copy-opacity','--horizontal-copy-x','--horizontal-step-scale'].forEach(function(k){node.style.removeProperty(k);});
      });
    }
    function markStatic(root){
      root.classList.remove('m-cinematic-ready'); root.classList.remove('m-scrollytelling-ready'); root.classList.add('m-scrollytelling-static');
      Array.prototype.slice.call(root.querySelectorAll('[data-motion-signature]')).forEach(clearStage);
    }
    function releaseOwnership(){
      if(window.__anaksMotionRuntimeRoots!==roots)return;
      window.__anaksMotionRuntimeReady=false;window.__anaksMotionRuntimeRoots=null;
      window.__anaksMotionDispose=null;window.__anaksProgressDispose=null;window.__anaksCinematicDispose=null;
    }
    function disposeStatic(){roots.forEach(markStatic);releaseOwnership();}
    function publishDispose(fn){window.__anaksMotionDispose=fn;window.__anaksProgressDispose=fn;window.__anaksCinematicDispose=fn;}

    publishDispose(disposeStatic);
    var mm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
    if(mm && mm.matches){ roots.forEach(markStatic); return; }
    var hasIO='IntersectionObserver' in window;
    if(!hasIO){ roots.forEach(markStatic); return; }
    var connection0=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    var saveData0=!!(connection0&&connection0.saveData);
    var reportedCores=navigator.hardwareConcurrency;
    var cores0=typeof reportedCores==='number'&&Number.isFinite(reportedCores)?reportedCores:0;
    var scrollytellingCapable=!saveData0&&cores0>=4;
    roots.forEach(function(root){
      var hasScrollytelling=root.querySelectorAll('[data-ss-stage]').length>0;
      root.classList.toggle('m-cinematic-ready',!saveData0);
      if(hasScrollytelling){
        root.classList.toggle('m-scrollytelling-ready',scrollytellingCapable);
        root.classList.toggle('m-scrollytelling-static',!scrollytellingCapable);
      }
    });
    function ampOf(el){ var root=rootOf(el); return root?(parseFloat(getComputedStyle(root).getPropertyValue('--m-amp'))||1):1; }
    function forcedMobile(stage){ return !!(stage&&stage.getAttribute('data-render-mode')==='mobile'); }
    function finePointer(){ return !!(window.matchMedia&&window.matchMedia('(pointer: fine)').matches); }
    function hoverCapable(){ return !!(window.matchMedia&&window.matchMedia('(hover: hover)').matches); }
    function signatureCanEnhance(stage){
      var id=stage.getAttribute('data-signature-id')||'';
      var modeMobile=forcedMobile(stage); var w=window.innerWidth||0;
      if(saveData0)return false;
      if(id==='horizontal-story') return !modeMobile&&w>=1024&&finePointer()&&hoverCapable()&&!saveData0&&cores0>=4;
      if(id==='sticky-chapters'||id==='portal-zoom'||id==='scroll-curtain') return !modeMobile&&w>=1024;
      if(id==='true-card-stack'||id==='before-after-scrub') return !modeMobile&&w>=768;
      if(id==='cinematic-scrub') return !saveData0;
      if(id==='scrollytelling-manifesto') return scrollytellingCapable;
      if(id==='mosaic-reveal')return !modeMobile&&w>=768;
      return id==='path-journey';
    }
    function refreshSignatureCapabilities(){
      q('[data-motion-signature]').forEach(function(stage){
        var ok=signatureCanEnhance(stage);
        stage.classList.toggle('m-signature-ready',ok);
        if(!ok) clearStage(stage);
      });
    }
    refreshSignatureCapabilities();

    /* reveal/mask/split과 legacy stacking은 JS 이전에 보이고, 초기화 뒤에만 숨김을 부여한다. */
    var reveals=q('[data-m="reveal"]').concat(q('[data-m="mask"]')).concat(q('[data-m="splitword"]')).concat(q('[data-m="stackcard"]'));
    reveals.forEach(function(el){el.classList.add('m-hide');});
    var revealIo=observe(new IntersectionObserver(function(entries){ entries.forEach(function(entry){
      if(!entry.isIntersecting)return; var el=entry.target; revealIo.unobserve(el);
      var delay=parseInt(el.getAttribute('data-m-delay')||'0',10);
      later(function(){ if(disposed)return; el.classList.remove('m-hide'); el.classList.add('m-show'); },delay);
    }); },{rootMargin:'0px 0px -8% 0px',threshold:.08}));
    reveals.forEach(function(el){revealIo.observe(el);});

    /* deprecated count-up만 짧은 one-shot rAF를 유지한다. signature 진행도는 아래 단일 scheduler만 쓴다. */
    var countIo=observe(new IntersectionObserver(function(entries){ entries.forEach(function(entry){
      if(!entry.isIntersecting)return; var el=entry.target; countIo.unobserve(el);
      var to=parseFloat(el.getAttribute('data-m-to')||'0'),pre=el.getAttribute('data-m-prefix')||'',suf=el.getAttribute('data-m-suffix')||'',start=null;
      function step(ts){ if(disposed)return; if(!start)start=ts; var p=Math.min((ts-start)/800,1); el.textContent=pre+Math.round(to*p).toLocaleString()+suf; if(p<1)requestAnimationFrame(step); }
      requestAnimationFrame(step);
    }); },{threshold:.5}));
    q('[data-m="countup"]').forEach(function(el){countIo.observe(el);});

    var loopIo=observe(new IntersectionObserver(function(entries){entries.forEach(function(e){e.target.style.animationPlayState=e.isIntersecting?'running':'paused';e.target.style.willChange=e.isIntersecting?'transform':'auto';});}));
    q('[data-m="kenburns"]').concat(q('[data-m="marquee"] .anaks-mq-track')).forEach(function(el){loopIo.observe(el);});

    function startCinematicLoop(v){
      if(saveData0)return; v.__anaksPlayback='loop'; v.loop=true; v.autoplay=true; v.setAttribute('autoplay',''); v.setAttribute('data-playback-state','loop');
      if(v.__anaksIntersecting){var play=v.play&&v.play();if(play&&play.catch)play.catch(function(){});}
    }
    function canDesktopScrub(v){
      var fine=window.matchMedia&&window.matchMedia('(pointer: fine)').matches;
      var stage=v.closest&&v.closest('[data-landing-full-film-stage],[data-ss-stage],[data-motion-signature]');
      var forcedMobile=stage&&(stage.getAttribute('data-ss-mode')==='mobile'||stage.getAttribute('data-render-mode')==='mobile');
      return v.getAttribute('data-playback')==='scrub'&&!forcedMobile&&!!fine&&window.innerWidth>=768&&!saveData0&&cores0>=4;
    }
    function syncCinematicProgress(el,p){
      var v=el.querySelector('video[data-m-cinematic-video][data-playback="scrub"],video[data-m-scrub]');
      if(!v||v.__anaksPlayback!=='scrub'||!v.duration||v.seeking)return;
      if(v.hasAttribute('data-page-film-video')&&!el.hasAttribute('data-landing-full-film-stage'))return;
      var target=Math.min(v.duration,Math.max(0,p*v.duration)); if(Math.abs((v.currentTime||0)-target)<.025)return;
      v.__anaksSeekStarted=(window.performance&&performance.now)?performance.now():Date.now();
      try{v.currentTime=target;}catch(_){startCinematicLoop(v);}
    }
    function localProgress(node,p){
      var start=parseFloat(node.getAttribute('data-story-start')||'0'),end=parseFloat(node.getAttribute('data-story-end')||'1');
      return end<=start?(p>=start?1:0):clamp((p-start)/(end-start));
    }
    function syncCinematicStory(el,p){
      var root=rootOf(el); if(el.hasAttribute('data-ss-stage')&&(!root||!root.classList.contains('m-scrollytelling-ready')))return;
      var amp0=ampOf(el),stories=el.__anaksStoryEls||(el.__anaksStoryEls=Array.prototype.slice.call(el.querySelectorAll('[data-m="storyword"],[data-m-story]')));
      stories.forEach(function(node){var local=localProgress(node,p);node.style.setProperty('--story-opacity',local.toFixed(4));node.style.setProperty('--story-y',((1-local)*18*amp0).toFixed(2)+'px');});
      var layers=el.__anaksCinematicLayers||(el.__anaksCinematicLayers=Array.prototype.slice.call(el.querySelectorAll('[data-m-cinematic-layer]')));
      layers.forEach(function(layer){var depth=parseFloat(layer.getAttribute('data-m-depth')||'0');layer.style.setProperty('--cinematic-parallax-y',(Math.sin(p*Math.PI)*-24*depth*amp0).toFixed(2)+'px');});
      var phase=clamp(p/.32),media=el.__anaksCinematicMedia||(el.__anaksCinematicMedia=Array.prototype.slice.call(el.querySelectorAll('[data-m-cinematic-media]')));
      media.forEach(function(node){node.style.setProperty('--cinematic-scale',(.92+phase*.08).toFixed(4));node.style.setProperty('--cinematic-clip',((1-phase)*4).toFixed(3)+'%');});
    }
    function syncSignatureContinuation(el,p){
      var index=parseInt(el.getAttribute('data-continuation-index')||'0',10)||0;
      var wave=Math.sin(clamp(p)*Math.PI),direction=index%2===0?1:-1,amp0=ampOf(el);
      el.style.setProperty('--continuation-x',((.5-p)*34*direction*amp0).toFixed(2)+'px');
      el.style.setProperty('--continuation-y',((.5-p)*18*amp0).toFixed(2)+'px');
      el.style.setProperty('--continuation-scale',(1+wave*.025*amp0).toFixed(4));
      el.style.setProperty('--continuation-opacity',(.84+wave*.16).toFixed(4));
      el.style.setProperty('--continuation-light',(wave*.42).toFixed(4));
      el.style.setProperty('--continuation-light-x',((-22+p*44)*direction).toFixed(2)+'%');
    }
    function syncLandingFullFilm(el,p){
      var wave=Math.sin(clamp(p)*Math.PI),amp0=ampOf(el);
      el.style.setProperty('--landing-film-progress',p.toFixed(4));
      el.style.setProperty('--landing-film-scale',(1.035+wave*.025*amp0).toFixed(4));
      el.style.setProperty('--landing-film-y',((.5-p)*14*amp0).toFixed(2)+'px');
      syncCinematicProgress(el,p);
    }
    function syncScrollytelling(el,p){
      var root=rootOf(el); if(!el.hasAttribute('data-ss-stage')||!root||!root.classList.contains('m-scrollytelling-ready'))return;
      var amp0=ampOf(el),acts=el.__anaksActs||(el.__anaksActs=Array.prototype.slice.call(el.querySelectorAll('[data-ss-act]')));
      acts.forEach(function(act,index){
        var start=parseFloat(act.getAttribute('data-act-start')||'0'),end=parseFloat(act.getAttribute('data-act-end')||'1'),span=Math.max(.0001,end-start),fade=Math.min(.025,span*.12),opacity=1;
        if(index===0&&p<=start+fade)opacity=1;else if(index===acts.length-1&&p>=end-fade)opacity=1;else if(p<start-fade||p>end+fade)opacity=0;else if(p<start+fade)opacity=smooth(start-fade,start+fade,p);else if(p>end-fade)opacity=1-smooth(end-fade,end+fade,p);
        opacity=clamp(opacity);var entering=p<(start+end)/2,offset=1-opacity,entrance=act.getAttribute('data-ss-entrance')||'',actX=0,actY=0,actScale=1;
        if(entrance==='from-left')actX=offset*(entering?-76:38)*amp0;
        else if(entrance==='from-right')actX=offset*(entering?76:-38)*amp0;
        else if(entrance==='from-bottom')actY=offset*(entering?68:-34)*amp0;
        else if(entrance==='fade-scale')actScale=.94+opacity*.06;
        else actY=offset*320*(entering?1:-1)*amp0;
        act.style.setProperty('--ss-act-opacity',opacity.toFixed(4));act.style.setProperty('--ss-act-x',actX.toFixed(2)+'px');act.style.setProperty('--ss-act-y',actY.toFixed(2)+'px');act.style.setProperty('--ss-act-scale',actScale.toFixed(4));
        var local=clamp((p-start)/span),words=act.__anaksWords||(act.__anaksWords=Array.prototype.slice.call(act.querySelectorAll('[data-ss-word]')));
        words.forEach(function(word,wordIndex){var count=Math.max(1,words.length),ws=(wordIndex/count)*.62,we=Math.min(1,ws+.28),wp=wordIndex===0?1:(we<=ws?(local>=ws?1:0):clamp((local-ws)/(we-ws)));word.style.setProperty('--ss-word-opacity',wp.toFixed(4));word.style.setProperty('--ss-word-y',((1-wp)*16*amp0).toFixed(2)+'px');});
        var counter=act.querySelector('[data-ss-count]');if(counter){var to=parseFloat(counter.getAttribute('data-count-to')||'0'),decimals=parseInt(counter.getAttribute('data-count-decimals')||'0',10);if(Number.isFinite(to)){var current=to*local;counter.textContent=decimals>0?current.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):Math.round(current).toLocaleString();}}
      });
    }

    function phaseWindow(stage,name,fallback){
      var cache=stage.__anaksPhaseWindows||(stage.__anaksPhaseWindows={}),cached=cache[name];if(cached)return cached;
      var raw=stage.getAttribute('data-phase-'+name)||'',parts=raw.split(',').map(parseFloat),valid=parts.length===2&&Number.isFinite(parts[0])&&Number.isFinite(parts[1])&&parts[0]>=0&&parts[1]<=1&&parts[0]<parts[1];
      cache[name]=valid?[parts[0],parts[1]]:fallback;return cache[name];
    }
    function phaseVars(stage,p){
      var establishWindow=phaseWindow(stage,'establish',[0,.14]),progressWindow=phaseWindow(stage,'progress',[.10,.68]),focalWindow=phaseWindow(stage,'focal',[.28,.80]),settleWindow=phaseWindow(stage,'settle',[.80,1]);
      var phases={
        establish:smooth(establishWindow[0],establishWindow[1],p),
        progress:smooth(progressWindow[0],progressWindow[1],p),
        focal:smooth(focalWindow[0],focalWindow[1],p),
        settle:smooth(settleWindow[0],settleWindow[1],p),
        travel:smooth(progressWindow[0],settleWindow[1],p)
      };
      stage.style.setProperty('--signature-progress',p.toFixed(4));
      stage.style.setProperty('--phase-establish',phases.establish.toFixed(4));
      stage.style.setProperty('--phase-progress',phases.progress.toFixed(4));
      stage.style.setProperty('--phase-focal',phases.focal.toFixed(4));
      stage.style.setProperty('--phase-settle',phases.settle.toFixed(4));
      return phases;
    }
    function sceneOpacity(index,count,p){
      if(count<=1)return 1;
      var overlap=.16/count,opacity=1;
      if(index>0){var enter=index/count;opacity*=smooth(enter-overlap,enter+overlap,p);}
      if(index<count-1){var exit=(index+1)/count;opacity*=1-smooth(exit-overlap,exit+overlap,p);}
      return clamp(opacity);
    }
    function writeBeforeAfterState(stage,value){
      value=clamp(value);var rounded=Math.round(value*100),input=stage.querySelector('[data-before-after-range]'),output=stage.querySelector('[data-before-after-output]');
      stage.style.setProperty('--before-after-clip',((1-value)*100).toFixed(3)+'%');
      if(input){input.value=String(rounded);input.setAttribute('aria-valuetext','이후 사진 '+rounded+'%');}
      if(output)output.textContent=rounded+'%';
    }
    function syncSignature(stage,p,measure){
      if(!stage.classList.contains('m-signature-ready'))return; var phases=phaseVars(stage,p),motionP=phases.travel;
      var id=stage.getAttribute('data-signature-id')||'',nodes,index,count,local,opacity;
      if(id==='sticky-chapters'){
        nodes=Array.prototype.slice.call(stage.querySelectorAll('[data-signature-chapter]'));count=Math.max(1,nodes.length);
        var activeChapter=Math.min(count-1,Math.max(0,Math.round(motionP*(count-1))));
        nodes.forEach(function(node,i){var center=count<=1?0:i/(count-1),distance=Math.min(1,Math.abs(motionP-center)*Math.max(1,count-1)),emphasis=1-smooth(.1,.82,distance),active=i===activeChapter,arrival=1-smooth(.04,.72,distance);node.style.setProperty('--chapter-emphasis',(.58+.42*emphasis).toFixed(4));node.style.setProperty('--chapter-scale',(.977+.023*emphasis).toFixed(4));node.style.setProperty('--chapter-clip',((1-emphasis)*3.2).toFixed(3)+'%');node.style.setProperty('--chapter-light',(active*Math.sin(arrival*Math.PI)*.42).toFixed(4));node.style.setProperty('--chapter-light-x',((-26+arrival*52)).toFixed(2)+'%');node.style.setProperty('--chapter-copy-opacity',(.7+.3*emphasis).toFixed(4));node.style.setProperty('--chapter-copy-y',((1-emphasis)*12).toFixed(2)+'px');node.toggleAttribute('data-active',active);});
        Array.prototype.slice.call(stage.querySelectorAll('[data-chapter-indicator-item]')).forEach(function(item,i){item.toggleAttribute('data-active',i===activeChapter);item.style.setProperty('--chapter-dot-width',(i===activeChapter?22:8)+'px');});
      }else if(id==='true-card-stack'){
        nodes=Array.prototype.slice.call(stage.querySelectorAll('[data-stack-card]'));count=Math.max(1,nodes.length);
        nodes.forEach(function(node,i){local=clamp(motionP*count-i);var covered=i===count-1?0:smooth(.62,1,local);node.style.setProperty('--card-scale',(1-covered*.035).toFixed(4));node.style.setProperty('--card-y',(-covered*8).toFixed(2)+'px');node.toggleAttribute('data-active',local>.18&&local<.96);});
      }else if(id==='portal-zoom'){
        nodes=Array.prototype.slice.call(stage.querySelectorAll('[data-signature-panel]'));count=Math.max(1,nodes.length);
        var portalPosition=motionP*Math.max(0,count-1);
        nodes.forEach(function(node,i){var distance=Math.abs(portalPosition-i),sceneVisible=1-smooth(.42,.72,distance),copyVisible=1-smooth(.24,.48,distance),sceneStart=count<=1?0:(i-.5)/(count-1),sceneEnd=count<=1?1:(i+.5)/(count-1);local=clamp((motionP-sceneStart)/Math.max(.0001,sceneEnd-sceneStart));var established=smooth(0,.24,local),focal=smooth(.2,.66,local),settled=smooth(.76,1,local),aperture=node.querySelector('[data-portal-aperture]'),media=node.querySelector('[data-portal-media]'),copy=node.querySelector('[data-scene-copy]');node.style.setProperty('--scene-opacity',sceneVisible.toFixed(4));node.style.setProperty('--scene-pointer',copyVisible>.55?'auto':'none');node.toggleAttribute('data-active',distance<.5);if(aperture){aperture.style.setProperty('--portal-scale',(.66+.39*focal-.02*settled).toFixed(4));aperture.style.setProperty('--portal-clip',((1-focal)*11).toFixed(3)+'%');aperture.style.setProperty('--portal-boundary-opacity',(.38+.44*Math.sin(Math.min(1,local)*Math.PI)).toFixed(4));}if(media)media.style.setProperty('--portal-media-scale',(1.035-.025*established+.012*Math.sin(local*Math.PI)).toFixed(4));if(copy){copy.style.setProperty('--portal-copy-opacity',copyVisible.toFixed(4));copy.style.setProperty('--portal-copy-x',((1-established)*22-settled*4).toFixed(2)+'px');}});
      }else if(id==='scroll-curtain'){
        nodes=Array.prototype.slice.call(stage.querySelectorAll('[data-curtain-panel]'));count=Math.max(1,nodes.length);
        var curtainSegments=Math.max(1,count-1),curtainPosition=motionP*curtainSegments,curtainCurrent=Math.min(count-1,Math.floor(curtainPosition)),curtainLocal=curtainPosition-curtainCurrent,curtainExit=curtainCurrent<count-1?smooth(.34,.82,curtainLocal):0;
        nodes.forEach(function(node,i){var transition=i<curtainCurrent?1:(i===curtainCurrent?curtainExit:0),incoming=i===curtainCurrent+1?smooth(.62,.9,curtainExit):0,copyVisible=i<curtainCurrent?0:(i===curtainCurrent?(i===count-1?1:1-smooth(.06,.32,curtainExit)):incoming),current=i===curtainCurrent||(i===curtainCurrent+1&&incoming>.5),media=node.querySelector('[data-curtain-media]'),copy=node.querySelector('[data-curtain-copy]'),edge=node.querySelector('[data-curtain-edge]');node.style.setProperty('--scene-opacity','1');node.style.setProperty('--scene-pointer',copyVisible>.55?'auto':'none');node.style.setProperty('--curtain-y',(-transition*6).toFixed(3)+'%');node.style.setProperty('--curtain-x',(-transition*4.5).toFixed(3)+'%');node.style.setProperty('--curtain-clip',(transition*100).toFixed(3)+'%');node.toggleAttribute('data-active',current);if(copy){copy.style.setProperty('--curtain-copy-opacity',copyVisible.toFixed(4));copy.style.setProperty('--curtain-copy-y',((1-copyVisible)*10).toFixed(2)+'px');}if(media)media.style.setProperty('--curtain-media-scale',(1-transition*.012+(i===curtainCurrent+1?(1-incoming)*.018:0)).toFixed(4));if(edge)edge.style.setProperty('--curtain-edge-opacity',(Math.sin(transition*Math.PI)*.86).toFixed(4));});
      }else if(id==='mosaic-reveal'){
        nodes=Array.prototype.slice.call(stage.querySelectorAll('[data-mosaic-tile]'));count=Math.max(1,nodes.length);
        var mosaicRevealP=Math.max(phases.establish*.52,phases.progress),mosaicMaxGroup=Math.max(1,Math.ceil((count-1)/2));
        nodes.forEach(function(node,i){var order=parseInt(node.getAttribute('data-reveal-order')||String(i),10),rank=Number.isFinite(order)?order:i,group=parseInt(node.getAttribute('data-reveal-group')||'0',10);local=rank===0?1:smooth(.04+(Math.max(1,group)-1)/mosaicMaxGroup*.5,.3+(Math.max(1,group)-1)/mosaicMaxGroup*.5,mosaicRevealP);node.style.setProperty('--mosaic-opacity',(rank===0?1:.24+.76*local).toFixed(4));node.style.setProperty('--mosaic-y',((1-local)*14).toFixed(2)+'px');node.style.setProperty('--mosaic-scale',(.988+.012*local).toFixed(4));node.toggleAttribute('data-active',local>.98);});
      }else if(id==='path-journey'){
        stage.style.setProperty('--path-progress',motionP.toFixed(4));nodes=Array.prototype.slice.call(stage.querySelectorAll('[data-path-milestone]'));count=Math.max(1,nodes.length);
        var journeyCurrent=Math.min(count-1,Math.max(0,Math.round(motionP*Math.max(0,count-1)))),journeyAmp=stage.getAttribute('data-signature-art-direction')==='clinical-informational'?6:14;
        nodes.forEach(function(node,i){var center=count<=1?0:i/(count-1),complete=i<journeyCurrent,current=i===journeyCurrent;local=smooth(Math.max(0,center-.12),Math.min(1,center+.12),motionP);node.style.setProperty('--milestone-opacity',(current?1:(complete ? .96 : .88)).toFixed(4));node.style.setProperty('--milestone-y',(complete||current?0:(1-local)*journeyAmp).toFixed(2)+'px');node.style.setProperty('--milestone-marker-scale',(current?1.12:(complete ? .9 : .76)).toFixed(4));node.style.setProperty('--milestone-ring',(current?8:0)+'px');node.toggleAttribute('data-active',current);node.toggleAttribute('data-current',current);node.toggleAttribute('data-complete',complete);});
      }else if(id==='before-after-scrub'){
        var compareInput=stage.querySelector('[data-before-after-range]'),comparePending=stage.__anaksComparePending,compareValue=comparePending!=null?comparePending:(stage.__anaksRangeControlled&&compareInput?clamp(parseFloat(compareInput.value||'50')/100):motionP);writeBeforeAfterState(stage,compareValue);stage.__anaksComparePending=null;
      }else if(id==='horizontal-story'){
        var rail=stage.querySelector('[data-horizontal-rail]');count=parseInt((rail&&rail.getAttribute('data-panel-count'))||'1',10);var width=measure&&measure.width?measure.width:0,held=0;if(count>1){if(motionP>=.96)held=1;else if(motionP>.04){var horizontalPosition=clamp((motionP-.04)/.92)*(count-1),horizontalIndex=Math.min(count-2,Math.floor(horizontalPosition)),horizontalLocal=horizontalPosition-horizontalIndex;held=(horizontalIndex+smooth(.2,.8,horizontalLocal))/(count-1);}}var horizontalPanelPosition=held*Math.max(0,count-1),horizontalCurrent=Math.min(count-1,Math.max(0,Math.round(horizontalPanelPosition)));stage.style.setProperty('--horizontal-progress',held.toFixed(4));stage.style.setProperty('--horizontal-x',(-held*width*Math.max(0,count-1)).toFixed(2)+'px');nodes=Array.prototype.slice.call(stage.querySelectorAll('[data-horizontal-panel]'));nodes.forEach(function(node,i){var distance=Math.min(1,Math.abs(i-horizontalPanelPosition)),weight=1-distance,current=i===horizontalCurrent,media=node.querySelector('[data-signature-media]'),copy=node.querySelector('[data-panel-copy]');node.toggleAttribute('data-current',current);if(media)media.style.setProperty('--horizontal-media-scale',(.985+.015*weight).toFixed(4));if(copy){copy.style.setProperty('--horizontal-copy-opacity',(.76+.24*weight).toFixed(4));copy.style.setProperty('--horizontal-copy-x',((i-horizontalPanelPosition)*12).toFixed(2)+'px');}});Array.prototype.slice.call(stage.querySelectorAll('[data-horizontal-step]')).forEach(function(step,i){var distance=Math.min(1,Math.abs(i-horizontalPanelPosition)),weight=1-distance;step.toggleAttribute('data-current',i===horizontalCurrent);step.style.setProperty('--horizontal-step-scale',(.2857+.7143*weight).toFixed(4));});
      }else if(id==='cinematic-scrub'){
        syncCinematicProgress(stage,motionP);syncCinematicStory(stage,p);
      }else if(id==='scrollytelling-manifesto'){
        syncCinematicProgress(stage,p);syncScrollytelling(stage,p);
      }
    }
    q('[data-before-after-range]').forEach(function(input){
      var stage=input.closest('[data-signature-id="before-after-scrub"]');if(!stage)return;
      listen(input,'input',function(){var value=clamp(parseFloat(input.value||'50')/100);stage.__anaksRangeControlled=true;stage.__anaksComparePending=value;if(progressActive.indexOf(stage)<0&&progressForced.indexOf(stage)<0)progressForced.push(stage);scheduleProgress();});
      listen(input,'change',function(){stage.__anaksRangeControlled=true;});
    });
    q('[data-before-after-viewport]').forEach(function(viewport){
      var stage=viewport.closest('[data-signature-id="before-after-scrub"]'),input=stage&&stage.querySelector('[data-before-after-range]');if(!stage||!input)return;
      function queueCompare(clientX){var rect=stage.__anaksCompareRect;if(!rect||!rect.width)return;stage.__anaksRangeControlled=true;stage.__anaksComparePending=clamp((clientX-rect.left)/rect.width);if(progressActive.indexOf(stage)<0&&progressForced.indexOf(stage)<0)progressForced.push(stage);scheduleProgress();}
      listen(viewport,'pointerdown',function(event){if(event.button!==undefined&&event.button!==0)return;stage.__anaksComparePointer=event.pointerId;stage.__anaksCompareRect=viewport.getBoundingClientRect();try{viewport.setPointerCapture(event.pointerId);}catch(_){}queueCompare(event.clientX);});
      listen(viewport,'pointermove',function(event){if(stage.__anaksComparePointer!==event.pointerId)return;queueCompare(event.clientX);});
      function releasePointer(event){if(stage.__anaksComparePointer!==event.pointerId)return;stage.__anaksComparePointer=null;stage.__anaksCompareRect=null;try{viewport.releasePointerCapture(event.pointerId);}catch(_){}}
      listen(viewport,'pointerup',releasePointer);listen(viewport,'pointercancel',releasePointer);
    });

    /* video는 poster 위에서 재생 성공 뒤에만 보인다. saveData면 load/play 경로 자체를 만들지 않는다. */
    if(!saveData0){
      q('video[data-m="videohero"]').forEach(function(v){
        v.muted=true;v.defaultMuted=true;v.setAttribute('playsinline','');
        listen(v,'playing',function(){v.style.opacity='1';});listen(v,'error',function(){v.style.opacity='0';if(v.pause)v.pause();});
        var pio=observe(new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){var play=v.play&&v.play();if(play&&play.catch)play.catch(function(){});}else if(v.pause)v.pause();});},{threshold:.1}));pio.observe(v);
      });
    }
    var cinematicVideos=!saveData0?q('video[data-m-cinematic-video],video[data-m-scrub]'):[];
    cinematicVideos=cinematicVideos.filter(function(v){var root=rootOf(v);if(v.hasAttribute('data-ss-video')&&(!root||!root.classList.contains('m-scrollytelling-ready'))){v.__anaksPlayback='poster';v.setAttribute('data-playback-state','poster');v.style.opacity='0';if(v.pause)v.pause();return false;}return true;});
    cinematicVideos.forEach(function(v){
      v.muted=true;v.defaultMuted=true;v.setAttribute('playsinline','');v.__anaksIntersecting=false;v.__anaksPlayback=canDesktopScrub(v)?'scrub':'loop';v.setAttribute('data-playback-state',v.__anaksPlayback);
      if(v.__anaksPlayback==='scrub'){v.loop=false;v.autoplay=false;v.removeAttribute('autoplay');if(v.pause)v.pause();}
      var reveal=function(){v.style.opacity='1';},failPoster=function(){v.__anaksPlayback='poster';v.style.opacity='0';if(v.pause)v.pause();};
      listen(v,'loadeddata',reveal);listen(v,'playing',reveal);listen(v,'error',failPoster);listen(v,'seeked',function(){reveal();if(v.__anaksPlayback!=='scrub'||v.__anaksSeekStarted==null)return;var now=(window.performance&&performance.now)?performance.now():Date.now();if(now-v.__anaksSeekStarted>350)v.__anaksSlowSeeks=(v.__anaksSlowSeeks||0)+1;else v.__anaksSlowSeeks=0;v.__anaksSeekStarted=null;if(v.__anaksSlowSeeks>=2)startCinematicLoop(v);});
    });
    if(cinematicVideos.length){
      var cinemaIo=observe(new IntersectionObserver(function(entries){entries.forEach(function(e){var v=e.target;v.__anaksIntersecting=e.isIntersecting;if(!e.isIntersecting){if(v.pause)v.pause();return;}if(v.readyState===0){v.preload='metadata';if(v.load)v.load();}if(v.__anaksPlayback==='loop')startCinematicLoop(v);else if(v.__anaksPlayback==='scrub'){if(v.pause)v.pause();later(function(){if(v.__anaksPlayback==='scrub'&&!v.duration)startCinematicLoop(v);},5000);}});},{threshold:.1}));
      cinematicVideos.forEach(function(v){cinemaIo.observe(v);});
    }
    if(!saveData0&&finePointer()){
      q('video[data-m="hovervideo"]').forEach(function(v){v.muted=true;v.defaultMuted=true;v.setAttribute('playsinline','');listen(v,'mouseenter',function(){var play=v.play&&v.play();if(play&&play.catch)play.catch(function(){});});listen(v,'mouseleave',function(){if(v.pause){v.pause();try{v.currentTime=0;}catch(_){}}});});
      q('[data-m="spotlight"]').forEach(function(sec){listen(sec,'pointermove',function(e){var r=sec.getBoundingClientRect();if(!r.width||!r.height)return;sec.style.setProperty('--mx',((e.clientX-r.left)/r.width).toFixed(4));sec.style.setProperty('--my',((e.clientY-r.top)/r.height).toFixed(4));});});
    }

    /* 하나의 shared dirty-flag rAF scheduler: 먼저 모든 layout read, 그 뒤 write. 연속 loop 없음. */
    // Keep the original progress root projection explicit for legacy SS4 diagnostics; rebuild extends it with v2 roots.
    var progressEls = q('[data-m-progress]').filter(function(){return true;});
    var progressActive=[],progressForced=[],progressTick=false,progressRoots=[],progressIo=null;
    function progressWillChange(el,active){
      var nodes=Array.prototype.slice.call(el.querySelectorAll('[data-m="storyword"],[data-m-story],[data-m-cinematic-layer],[data-m-cinematic-media],[data-ss-act],[data-ss-word],[data-chapter-media],[data-stack-card],[data-portal-media],[data-curtain-panel],[data-mosaic-tile],[data-path-milestone],[data-horizontal-rail],[data-m-depth],[data-section-type]'));
      nodes.forEach(function(node){
        if(!active){node.style.willChange='auto';return;}
        var clip=node.hasAttribute('data-m-cinematic-media')||node.hasAttribute('data-portal-media')||node.hasAttribute('data-curtain-panel');
        var opacity=node.hasAttribute('data-m-story')||node.getAttribute('data-m')==='storyword'||node.hasAttribute('data-ss-act')||node.hasAttribute('data-ss-word')||node.hasAttribute('data-mosaic-tile')||node.hasAttribute('data-path-milestone');
        node.style.willChange=clip?'transform, clip-path':opacity?'transform, opacity':'transform';
      });
    }
    function scrollRootOf(el){var p=el.parentElement;while(p&&p!==document.body&&p!==document.documentElement){var oy='';try{oy=getComputedStyle(p).overflowY||'';}catch(_){}if(/auto|scroll|overlay/.test(oy)&&p.scrollHeight>p.clientHeight)return p;p=p.parentElement;}return null;}
    function progressCandidates(){
      var fullFilm=Array.prototype.slice.call(document.querySelectorAll('[data-landing-full-film-stage]'));
      var all=q('[data-m-progress]').concat(q('[data-m="parallax"]')).concat(q('[data-m="scrollscrub"]')).concat(q('[data-motion-signature]')).concat(fullFilm),seen=[];
      return all.filter(function(el){if(seen.indexOf(el)>=0)return false;seen.push(el);var root=rootOf(el);if(el.hasAttribute('data-ss-stage')&&(!root||!root.classList.contains('m-scrollytelling-ready')))return false;if(el.hasAttribute('data-motion-signature')&&!el.classList.contains('m-signature-ready'))return false;return true;});
    }
    function readProgress(el){var scrollRoot=el.__anaksScrollRoot,r=el.getBoundingClientRect(),rr=scrollRoot?scrollRoot.getBoundingClientRect():{top:0},vh=scrollRoot?scrollRoot.clientHeight:(window.innerHeight||document.documentElement.clientHeight||1),travel=Math.max(1,r.height-vh),top=r.top-rr.top,p=clamp(-top/travel),viewportP=clamp((vh-top)/(vh+r.height));return{el:el,rect:r,vh:vh,p:p,viewportP:viewportP,width:r.width};}
    function writeProgress(state){
      var el=state.el,continuation=el.hasAttribute('data-signature-continuation'),fullFilm=el.hasAttribute('data-landing-full-film-stage');
      var p=continuation||el.getAttribute('data-signature-id')==='mosaic-reveal'||el.getAttribute('data-signature-id')==='path-journey'?state.viewportP:state.p;
      el.style.setProperty('--scroll-progress',p.toFixed(4));
      if(fullFilm){
        syncLandingFullFilm(el,p);
      }else if(continuation){
        syncSignatureContinuation(el,p);
      }else if(el.getAttribute('data-m')==='parallax'){
        var rel=((state.rect.top+state.rect.height/2)-state.vh/2)/(state.vh/2+state.rect.height/2),amp0=ampOf(el);Array.prototype.slice.call(el.querySelectorAll('[data-m-depth]')).forEach(function(layer){var depth=parseFloat(layer.getAttribute('data-m-depth')||'0');layer.style.transform='translate3d(0,'+(rel*24*depth*amp0*-1).toFixed(2)+'px,0)';});
      }else if(el.getAttribute('data-m')==='scrollscrub'){
        syncCinematicProgress(el,p);
      }else if(el.hasAttribute('data-motion-signature')){
        syncSignature(el,p,state);
      }else{
        syncCinematicProgress(el,p);syncCinematicStory(el,p);syncScrollytelling(el,p);
      }
    }
    function progressFrame(){progressTick=false;var targets=progressActive.concat(progressForced.filter(function(el){return progressActive.indexOf(el)<0;}));progressForced.length=0;var reads=targets.map(readProgress);reads.forEach(writeProgress);}
    function scheduleProgress(){if(progressTick||disposed)return;progressTick=true;requestAnimationFrame(progressFrame);}
    function removeRootListeners(){progressRoots.forEach(function(root){(root||window).removeEventListener('scroll',scheduleProgress);});progressRoots.length=0;}
    function listenRoot(root){if(progressRoots.indexOf(root)>=0)return;progressRoots.push(root);(root||window).addEventListener('scroll',scheduleProgress,{passive:true});}
    function rebuildProgressNodes(){
      progressEls.forEach(function(el){progressWillChange(el,false);});refreshSignatureCapabilities();removeRootListeners();if(progressIo)progressIo.disconnect();progressActive.length=0;progressForced.length=0;progressEls=progressCandidates();
      progressIo=observe(new IntersectionObserver(function(entries){entries.forEach(function(entry){var i=progressActive.indexOf(entry.target);if(entry.isIntersecting){if(i<0)progressActive.push(entry.target);entry.target.setAttribute('data-signature-active','true');progressWillChange(entry.target,true);}else{if(i>=0)progressActive.splice(i,1);entry.target.removeAttribute('data-signature-active');progressWillChange(entry.target,false);progressForced.push(entry.target);}});scheduleProgress();},{rootMargin:'100% 0px',threshold:0}));
      progressEls.forEach(function(el){el.__anaksScrollRoot=scrollRootOf(el);listenRoot(el.__anaksScrollRoot);progressIo.observe(el);progressForced.push(el);});scheduleProgress();
    }
    rebuildProgressNodes();
    var resizeQueued=false;
    listen(window,'resize',function(){if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(function(){resizeQueued=false;q('[data-signature-id="before-after-scrub"]').forEach(function(stage){stage.__anaksCompareRect=null;});rebuildProgressNodes();});},{passive:true});

    function disposeAll(){
      if(disposed)return;disposed=true;cleanups.forEach(function(off){try{off();}catch(_){}});observers.forEach(function(io){try{io.disconnect();}catch(_){}});timers.forEach(clearTimeout);removeRootListeners();
      roots.forEach(function(root){root.classList.remove('m-cinematic-ready');root.classList.remove('m-scrollytelling-ready');Array.prototype.slice.call(root.querySelectorAll('[data-motion-signature]')).forEach(clearStage);});
      q('video').forEach(function(v){if(v.pause)v.pause();});reveals.forEach(function(el){el.classList.remove('m-hide');el.classList.add('m-show');});releaseOwnership();
    }
    publishDispose(disposeAll);
  }catch(_){window.__anaksMotionRuntimeReady=false;window.__anaksMotionRuntimeRoots=null;/* 모션 실패는 정적 콘텐츠에 영향 없음 */}
})();`;
