import type { CSSProperties } from 'react';
import { Check, MousePointer2 } from 'lucide-react';
import { MOTION_CSS } from '@/lib/motion/runtime';
import { LandingCinematicRuntime } from './LandingCinematicRuntime';

const ACTS = [
  {
    eyebrow: '01 · SEARCH',
    heading: '검색엔진이 먼저 구조를 읽습니다.',
    body: '페이지 제목과 설명, 시맨틱 HTML, 사이트맵을 화면 뒤의 실제 문서 구조로 함께 만듭니다.',
    start: 0,
    end: 0.25,
  },
  {
    eyebrow: '02 · ANSWER',
    heading: '질문의 답이 되는 문장을 설계합니다.',
    body: 'FAQ와 직접 답변 문장을 배치해 검색의 답변 영역이 핵심 정보를 집어가기 좋은 형태로 정리합니다.',
    start: 0.25,
    end: 0.5,
  },
  {
    eyebrow: '03 · GENERATIVE',
    heading: 'AI가 사업 정보를 이해할 단서를 남깁니다.',
    body: '사업 주체와 지역, 서비스 정보를 텍스트와 구조화 데이터로 일치시켜 생성형 AI가 참고하기 쉬운 기반을 만듭니다.',
    start: 0.5,
    end: 0.75,
  },
  {
    eyebrow: '04 · CINEMATIC',
    heading: '이 움직임까지 실제 홈페이지에 적용됩니다.',
    body: '데스크톱에서는 스크롤이 영상의 재생 위치를 제어하고, 모바일에서는 안정적인 루프로 전환됩니다. 정적인 포스터와 본문은 언제나 남습니다.',
    start: 0.75,
    end: 1,
  },
] as const;

const STAGE_CSS = `
.daboim-cinematic [data-ss-media] { background: #07142f; }
.daboim-cinematic [data-ss-copy] { padding-inline: clamp(24px, 7vw, 108px); }
.daboim-cinematic [data-ss-heading] {
  max-width: 860px; color: #fff; font-size: clamp(2.25rem, 5.5vw, 5.5rem);
  letter-spacing: -.055em; text-wrap: balance;
}
.daboim-cinematic [data-ss-body] { color: rgba(255,255,255,.76); }
.daboim-cinematic [data-lcs-eyebrow] {
  margin: 0 0 18px; color: #68e8d8; font: 600 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .16em;
}
.daboim-cinematic:not(.m-scrollytelling-ready) [data-ss-heading] { color: #0b1736; }
.daboim-cinematic:not(.m-scrollytelling-ready) [data-ss-body] { color: #5f6b7c; }
.daboim-cinematic:not(.m-scrollytelling-ready) [data-lcs-eyebrow] { color: #174dda; }
.daboim-cinematic.m-scrollytelling-ready [data-lcs-film-ui] { opacity: 1; }
@media (max-width: 767.98px) {
  .daboim-cinematic [data-ss-heading] { font-size: clamp(2.15rem, 11vw, 4.25rem); }
  .daboim-cinematic [data-ss-copy] { padding-inline: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .daboim-cinematic [data-lcs-film-ui] { display: none; }
}
`;

const stageVars = {
  '--scroll-progress': 0,
  '--m-amp': 1,
  '--m-dur-scale': 1,
  '--ss-scroll-height': `${ACTS.length * 100}svh`,
  '--ss-static-height': 'min(72svh, 820px)',
  '--ss-stage-bg': '#07142f',
  '--ss-stack-bg': '#f8fbff',
  '--ss-stack-text': '#0b1736',
  '--ss-text': '#ffffff',
  '--ss-heading-font': "'Pretendard', system-ui, sans-serif",
} as CSSProperties;

export function LandingCinematicShowcase() {
  return (
    <section aria-labelledby="landing-cinematic-title" className="border-y border-[#1B3158] bg-[#07142F]">
      <div className="mx-auto max-w-7xl px-5 pt-20 pb-12 text-white sm:px-8 md:pt-28">
        <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] text-[#68E8D8] uppercase">
              LIVE CINEMATIC SCROLL · ADD-ON PREVIEW
            </p>
            <h2 id="landing-cinematic-title" className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
              설명보다 먼저,
              <br />직접 스크롤해 보세요.
            </h2>
          </div>
          <div className="max-w-md">
            <p className="text-sm leading-7 text-white/68">
              지금 보이는 무대가 영상 애드온에 적용되는 실제 스크롤 스크럽 방식입니다. 새 영상을 생성한 데모가 아니라 기존 Daboim 1080p 필름을 같은 런타임으로 재생합니다.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 font-mono text-[9px] tracking-[0.11em] text-white/80">
              <MousePointer2 className="h-3 w-3 text-[#68E8D8]" /> DESKTOP: SCROLL TO SCRUB · MOBILE: PINNED LOOP
            </p>
          </div>
        </div>
      </div>

      <div className="anaks-site daboim-cinematic" style={{ minHeight: 0, backgroundColor: '#07142f' }}>
        <style dangerouslySetInnerHTML={{ __html: `${MOTION_CSS}\n${STAGE_CSS}` }} />
        <section
          data-m="scrollytelling"
          data-m-progress
          data-ss-stage
          data-ss-mode="auto"
          aria-label="Daboim SEO, AEO, GEO 시네마틱 스크롤 기능 시연"
          style={stageVars}
        >
          <noscript>
            <style dangerouslySetInnerHTML={{ __html: '.daboim-cinematic [data-ss-stage]{height:auto!important;contain:none}' }} />
          </noscript>
          <div data-ss-pin>
            <div data-ss-media data-m-cinematic-media>
              {/* 포스터는 항상 DOM에 남고 영상은 뷰포트 진입 전 preload하지 않는다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/daboim-visibility-film-poster.webp"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <video
                data-m="cinematicvideo"
                data-m-cinematic-video="true"
                data-ss-video
                data-playback="scrub"
                src="/daboim-visibility-film-scrub.mp4"
                poster="/daboim-visibility-film-poster.webp"
                muted
                playsInline
                preload="none"
                aria-hidden="true"
                className="hidden md:block"
              />
              <video
                data-m="cinematicvideo"
                data-m-cinematic-video="true"
                data-ss-video
                data-playback="loop"
                src="/daboim-visibility-film.webm"
                poster="/daboim-visibility-film-poster.webp"
                muted
                playsInline
                preload="none"
                aria-hidden="true"
                className="md:hidden"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,12,31,.76),rgba(3,12,31,.22)_58%,rgba(3,12,31,.42))]" />
              <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,20,47,.16),transparent_55%,rgba(7,20,47,.72))]" />

              <div
                data-lcs-film-ui
                className="absolute top-5 right-5 left-5 z-10 flex items-center justify-between opacity-0 transition-opacity duration-500"
              >
                <span className="rounded-full border border-white/20 bg-[#07142F]/55 px-3 py-1.5 font-mono text-[9px] tracking-[0.13em] text-white backdrop-blur-md">
                  DABOIM CINEMATIC ENGINE · 1080P
                </span>
                <span className="hidden items-center gap-1.5 rounded-full border border-[#68E8D8]/25 bg-[#082D39]/65 px-3 py-1.5 font-mono text-[9px] text-[#8AF4E7] backdrop-blur-md sm:inline-flex">
                  <Check className="h-3 w-3" /> LIVE SCRUB
                </span>
              </div>
            </div>

            <div data-ss-act-list>
              {ACTS.map((act) => (
                <article
                  key={act.eyebrow}
                  data-ss-act
                  data-act-kind="text"
                  data-act-start={act.start.toFixed(4)}
                  data-act-end={act.end.toFixed(4)}
                >
                  <div data-ss-copy>
                    <p data-lcs-eyebrow>{act.eyebrow}</p>
                    <h3 data-ss-heading>{act.heading}</h3>
                    <p data-ss-body>{act.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <LandingCinematicRuntime />
      </div>
    </section>
  );
}
