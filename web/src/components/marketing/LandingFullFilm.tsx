import type { ReactNode } from 'react';

const FULL_FILM_CSS = `
.daboim-full-film { position: relative; isolation: isolate; background: #f8fbff; color: #0b1736; }
[data-landing-full-film-stage] {
  position: relative; isolation: isolate; min-height: 100svh; overflow: clip; background: #07142f;
}
[data-landing-full-film-stage] .daboim-cinematic { background: transparent !important; }
[data-landing-full-film-stage] [data-lcs-prelude],
[data-landing-full-film-stage] [data-story-chapter] {
  position: relative; z-index: 2;
}
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] {
  --ss-stage-bg: transparent !important; background: transparent !important;
  contain: none !important; overflow: visible !important;
}
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] [data-ss-pin] {
  overflow: visible !important;
}
[data-landing-full-film-stage] .daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-media] {
  position: fixed !important; inset: 0 !important; z-index: 0 !important;
  width: 100vw; height: 100svh !important; min-height: 360px; margin: 0 !important;
  opacity: var(--upper-film-opacity,1); pointer-events: none;
}
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] [data-signature-media] {
  width: 100%; height: 100%; border-radius: 0; background: #07142f; box-shadow: none;
}
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] [data-signature-media] > img,
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] [data-signature-media] > video {
  width: 100%; height: 100%; object-fit: cover;
  transform: translate3d(0,0,0);
  transform-origin: 50% 50%;
}
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] [data-ss-act] {
  background: transparent !important;
}
[data-landing-full-film-stage] [data-landing-story-root] {
  position: relative; z-index: 6; background: #f8fbff;
}
[data-landing-full-film-stage] [data-story-progress-rail] { z-index: 1; }
@media (prefers-reduced-motion: reduce) {
  [data-landing-full-film-stage] .daboim-cinematic [data-signature-id="scrollytelling-manifesto"] [data-ss-media] {
    position: relative !important; inset: auto !important; width: 100%; height: var(--ss-static-height) !important;
  }
  [data-landing-full-film-stage] [data-signature-media] > video { display: none !important; }
  [data-landing-full-film-stage] [data-signature-media] > img { transform: none !important; }
}
`;

/** 상단 필름과 후속 DOM 모션을 하나의 경계 없는 랜딩 경험으로 묶는다. */
export function LandingFullFilm({ children }: { children: ReactNode }) {
  return (
    <div className="daboim-full-film">
      <style dangerouslySetInnerHTML={{ __html: FULL_FILM_CSS }} />
      <div data-landing-full-film-stage>{children}</div>
    </div>
  );
}
