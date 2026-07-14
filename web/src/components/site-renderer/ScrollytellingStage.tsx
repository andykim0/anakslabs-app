import type { CSSProperties } from 'react';
import type { ScrollytellingAct, Section, SiteTheme } from '@/lib/types/site';
import { safeMediaSrc } from '@/lib/safe-url';
import { resolveScrimWithOverride } from '@/lib/design/scrim';
import { cqw } from './scale';

function bandFor(act: ScrollytellingAct, index: number, count: number): [number, number] {
  return act.band ?? [index / count, index === count - 1 ? 1 : (index + 1) / count];
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function StatHeading({ text }: { text: string }) {
  const match = /^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(text);
  if (!match) return <>{text}</>;
  const value = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(value)) return <>{text}</>;
  const decimals = match[2].includes('.') ? match[2].split('.')[1].length : 0;
  return (
    <>
      {match[1]}
      <span data-ss-count data-count-to={String(value)} data-count-decimals={String(decimals)}>{match[2]}</span>
      {match[3]}
    </>
  );
}

function ActHeading({ act }: { act: ScrollytellingAct }) {
  if (act.kind === 'stat') return <StatHeading text={act.heading} />;
  const parts = words(act.heading);
  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} data-ss-word aria-hidden="true">
          {part}{index < parts.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

/**
 * [SS3] 영상 하나를 데스크 scrub·모바일 loop가 공유하는 반응형 다막 무대.
 * 모든 act는 SSR article/h2/p로 존재하고 JS는 data-* 진행도 스타일만 향상한다.
 */
export function ScrollytellingStage({
  section,
  theme,
  isFirst = false,
  mode = 'auto',
}: {
  section: Section;
  theme: SiteTheme;
  isFirst?: boolean;
  mode?: 'desktop' | 'mobile' | 'auto';
}) {
  const acts = section.acts ?? [];
  const video = section.background.video;
  if (acts.length < 3 || !video?.src || !video.poster) return null;
  const scrim = resolveScrimWithOverride(
    theme.palette,
    section.background.image?.overlayColor,
    section.background.image?.overlayOpacity,
  );
  const vars = {
    '--scroll-progress': 0,
    '--ss-scroll-height': `${Math.max(3, acts.length) * 100}svh`,
    '--ss-static-height': cqw(section.height),
    '--ss-stage-bg': section.background.color ?? theme.palette.background,
    '--ss-stack-bg': theme.palette.surface,
    '--ss-stack-text': theme.palette.text,
    '--ss-text': scrim.textColor,
    '--ss-heading-font': theme.fonts.heading,
  } as CSSProperties;

  return (
    <section
      id={section.id}
      data-section-type={section.type}
      data-m="scrollytelling"
      data-m-progress
      data-ss-stage
      data-ss-mode={mode}
      aria-label={section.name}
      style={vars}
    >
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: '.anaks-site [data-ss-stage]{height:auto!important;contain:none}' }} />
      </noscript>
      <div data-ss-pin>
        <div data-ss-media data-m-cinematic-media>
          {/* poster는 영구 LCP 기저. video는 IO 진입 전 preload none. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={safeMediaSrc(video.poster)}
            alt=""
            aria-hidden="true"
            loading={isFirst ? 'eager' : 'lazy'}
            fetchPriority={isFirst ? 'high' : undefined}
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <video
            data-m="cinematicvideo"
            data-m-cinematic-video="true"
            data-playback="scrub"
            src={safeMediaSrc(video.src)}
            muted
            playsInline
            preload="none"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, backgroundColor: scrim.overlayColor, opacity: scrim.overlayOpacity }}
          />
        </div>

        <div data-ss-act-list>
          {acts.map((act, index) => {
            const [start, end] = bandFor(act, index, acts.length);
            const headingId = `${section.id}-act-${index + 1}`;
            return (
              <article
                key={headingId}
                data-ss-act
                data-act-kind={act.kind ?? 'text'}
                data-act-start={start.toFixed(4)}
                data-act-end={end.toFixed(4)}
                aria-labelledby={headingId}
              >
                <div data-ss-copy>
                  <h2 id={headingId} data-ss-heading aria-label={act.heading}>
                    <ActHeading act={act} />
                  </h2>
                  <p data-ss-body>{act.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
