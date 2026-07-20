import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, MousePointer2 } from 'lucide-react';

const FULL_FILM_CSS = `
.daboim-full-film { position: relative; background: #07142f; color: #fff; }
[data-landing-full-film-stage] {
  --landing-film-progress: var(--scroll-progress, 0);
  position: relative; isolation: isolate; min-height: 100svh; overflow: clip; background: #07142f;
}
[data-landing-full-film-stage] .daboim-cinematic,
[data-landing-full-film-stage] [data-landing-story-root],
[data-landing-full-film-stage] [data-landing-continuation] { background: transparent !important; }
[data-landing-full-film-stage] [data-lcs-prelude],
[data-landing-full-film-stage] [data-story-chapter] {
  position: relative; z-index: 2; border-color: transparent !important; background: transparent !important;
}
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] {
  --ss-stage-bg: transparent !important; background: transparent !important;
  contain: none !important; overflow: visible !important;
}
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] [data-ss-pin] {
  overflow: visible !important;
}
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] [data-ss-media] {
  position: fixed !important; inset: 0 !important; z-index: 0 !important;
  width: 100vw; height: 100svh !important; min-height: 360px; margin: 0 !important;
  pointer-events: none;
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
[data-landing-full-film-stage] [data-lcs-prelude]::before,
[data-landing-full-film-stage] [data-story-chapter]::before,
[data-landing-full-film-stage] [data-lcs-hero-ambient],
[data-landing-full-film-stage] [data-film-decoration] { display: none !important; }
[data-landing-full-film-stage] [data-signature-id="scrollytelling-manifesto"] [data-ss-act] {
  background: transparent !important;
}
[data-landing-full-film-stage] [data-film-scrim] {
  width: fit-content; max-width: 100%; padding: clamp(22px, 3.2vw, 46px);
  border: 1px solid rgba(255,255,255,.13); border-radius: clamp(22px, 2.4vw, 34px);
  background: linear-gradient(112deg,rgba(3,12,31,.86),rgba(3,12,31,.62) 72%,rgba(3,12,31,.24));
  box-shadow: 0 28px 90px rgba(0,8,28,.26); backdrop-filter: blur(12px);
}
[data-landing-full-film-stage] [data-film-scrim] :is(h1,h2,h3,p,li,a) { color: #fff !important; }
[data-landing-full-film-stage] [data-film-scrim] p,
[data-landing-full-film-stage] [data-film-scrim] li { color: rgba(255,255,255,.76) !important; }
[data-landing-full-film-stage] [data-film-scrim] a { color: #68e8d8 !important; }
[data-landing-full-film-stage] [data-film-scrim="faq-list"] { width: min(768px, 100%); margin-inline: auto; }
[data-landing-full-film-stage] [data-film-scrim="faq-list"] :is(summary,details > div,span) {
  color: rgba(255,255,255,.86) !important;
}
[data-landing-full-film-stage] [data-story-progress-rail] { z-index: 30; }
[data-film-example-badge] {
  position: fixed; z-index: 40; top: 84px; right: max(18px,calc((100vw - 1340px) / 2));
  display: flex; align-items: center; gap: 12px; width: fit-content; max-width: min(680px,calc(100vw - 36px));
  padding: 9px 12px; border: 1px solid rgba(104,232,216,.34); border-radius: 18px;
  background: rgba(3,12,31,.78); box-shadow: 0 14px 42px rgba(0,8,28,.22); backdrop-filter: blur(14px);
  transform: translate3d(0,var(--film-badge-y,0px),0); opacity: var(--film-badge-opacity,.9);
  pointer-events: none;
}
[data-film-example-badge] > * { pointer-events: auto; }
[data-film-example-badge] a {
  display: inline-flex; align-items: center; gap: 6px; color: #68e8d8;
  font-size: 11px; line-height: 1.35; font-weight: 700; letter-spacing: .06em; word-break: keep-all;
}
[data-film-example-badge] p {
  display: inline-flex; align-items: center; gap: 5px; margin: 0; color: rgba(255,255,255,.7);
  font-size: 10px; line-height: 1.35; letter-spacing: .04em; word-break: keep-all;
}
@media (max-width: 767.98px) {
  [data-landing-full-film-stage] [data-film-scrim] {
    width: 100%; padding: 22px; border-radius: 24px; backdrop-filter: blur(9px);
  }
  [data-film-example-badge] {
    top: 76px; right: 12px; left: 12px; display: grid; width: auto; max-width: none;
    gap: 3px; padding: 8px 10px; border-radius: 14px; opacity: var(--film-badge-opacity,.88);
  }
  [data-film-example-badge] a { justify-content: space-between; font-size: 9.5px; }
  [data-film-example-badge] p { font-size: 8.5px; }
}
@media (prefers-reduced-motion: reduce) {
  [data-landing-full-film-stage] [data-signature-media] > video { display: none !important; }
  [data-landing-full-film-stage] [data-signature-media] > img { transform: none !important; }
}
`;

/** 홈 전체 높이를 하나의 production film 진행도 좌표계로 묶는다. */
export function LandingFullFilm({ children }: { children: ReactNode }) {
  return (
    <div className="daboim-full-film">
      <style dangerouslySetInnerHTML={{ __html: FULL_FILM_CSS }} />
      <div
        data-landing-full-film-stage
        data-m-progress
        style={{ '--scroll-progress': 0 } as CSSProperties}
      >
        <aside data-film-example-badge aria-label="AI 영상 홈페이지 예시 안내">
          <Link href="/cases">
            <span>예시 · AI 영상 홈페이지 적용 시 · 적용 사례 보기</span>
            <ArrowRight aria-hidden="true" size={13} />
          </Link>
          <p><MousePointer2 aria-hidden="true" size={11} /> 컴퓨터: 스크롤 반응 · 휴대폰: 부드러운 반복</p>
        </aside>
        {children}
      </div>
    </div>
  );
}
