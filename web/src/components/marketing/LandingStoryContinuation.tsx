import type { CSSProperties, ReactNode } from 'react';

const STORY_CSS = `
[data-landing-story-root] {
  position: relative; isolation: isolate; z-index: 6; background: #f8fbff; color: #0b1736;
}
[data-landing-story-root]::before {
  position: absolute; z-index: 0; top: -150px; right: 0; left: 0; height: 152px;
  content: ''; pointer-events: none;
  background: linear-gradient(to bottom,rgba(248,251,255,0),#f8fbff 92%);
}
[data-landing-continuation] {
  --story-progress: var(--scroll-progress, 0);
  position: relative; isolation: isolate; z-index: 1; overflow: clip;
  background: linear-gradient(180deg,#f8fbff 0%,#eef5ff 36%,#f8fbff 68%,#edf5ff 100%);
}
[data-landing-continuation]::before {
  position: absolute; z-index: 0; inset: 0; content: ''; pointer-events: none;
  opacity: .88;
  background:
    radial-gradient(circle at calc(16% + var(--story-motif-x,0%)) 12%,rgba(23,77,218,.11),transparent 18%),
    radial-gradient(circle at calc(82% - var(--story-motif-x,0%)) 44%,rgba(8,175,197,.09),transparent 20%),
    radial-gradient(circle at calc(20% + var(--story-motif-x,0%)) 76%,rgba(3,191,169,.09),transparent 19%);
}
[data-story-progress-rail] {
  position: absolute; z-index: 1; top: clamp(300px, 28vw, 460px); bottom: 220px;
  left: max(18px, calc((100vw - 1340px) / 2)); width: 2px; overflow: hidden;
  border-radius: 999px; background: linear-gradient(to bottom,rgba(23,77,218,.12),rgba(3,191,169,.2));
  pointer-events: none;
}
[data-story-progress-fill] {
  display: block; width: 100%; height: 100%; transform: scaleY(var(--story-progress));
  transform-origin: 50% 0; background: linear-gradient(to bottom,#174dda,#08afc5 52%,#03bfa9);
  box-shadow: 0 0 18px rgba(8,175,197,.38);
}
[data-story-chapter] {
  position: relative; isolation: isolate; z-index: 2; border-color: transparent !important; background: transparent !important;
}
[data-story-chapter]::before {
  position: absolute; inset: -10% 0; z-index: 0; content: ''; pointer-events: none;
  opacity: var(--story-chapter-light,.58);
  background: radial-gradient(circle at var(--story-light-x,12%) var(--story-light-y,42%),rgba(58,214,211,.12),transparent 24%);
}
[data-story-chapter]::after {
  position: absolute; z-index: 4; top: clamp(52px, 6vw, 86px);
  left: calc(max(18px, calc((100vw - 1340px) / 2)) - 18px);
  display: grid; width: 36px; height: 36px; place-items: center; content: attr(data-story-chapter);
  border: 1px solid rgba(23,77,218,.24); border-radius: 999px; background: #f8fbff;
  color: #174dda; font: 600 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing: .08em; box-shadow: 0 0 0 4px #f8fbff,0 8px 24px rgba(11,23,54,.1); pointer-events: none;
}
[data-story-chapter] > * { position: relative; z-index: 1; }
[data-story-chapter="08"] {
  margin-top: -140px; padding-top: 140px;
  background: linear-gradient(180deg,rgba(23,77,218,0) 0%,rgba(23,77,218,.82) 32%,rgba(8,175,197,.94) 55%,#07142f 100%) !important;
}
[data-story-chapter="08"]::before {
  opacity: .72;
  background: radial-gradient(circle at var(--story-light-x,78%) var(--story-light-y,28%),rgba(255,255,255,.2),transparent 27%);
}
.anaks-site.m-cinematic-ready [data-landing-continuation] [data-story-chapter] > * {
  opacity: var(--story-chapter-opacity,1);
  transform: translate3d(var(--story-chapter-x,0px),var(--story-chapter-y,0px),0) scale(var(--story-chapter-scale,1));
  transform-origin: 50% 50%;
}
@media (max-width: 1290px) {
  [data-story-chapter] > :not([data-story-decoration]) { padding-left: 52px; }
}
@media (max-width: 767.98px) {
  [data-story-progress-rail] { width: 2px; opacity: .7; }
  [data-story-chapter]::before { opacity: .46; }
}
@media (prefers-reduced-motion: reduce) {
  [data-story-progress-fill] { transform: scaleY(1); }
  [data-landing-continuation]::before { opacity: .64; }
  .anaks-site [data-landing-continuation] [data-story-chapter] > * {
    opacity: 1 !important; transform: none !important;
  }
}
`;

export function LandingStoryContinuation({ children }: { children: ReactNode }) {
  return (
    <div className="anaks-site" data-landing-story-root>
      <div
        data-landing-continuation
        data-m-progress
        style={{ '--scroll-progress': 0 } as CSSProperties}
      >
        <style dangerouslySetInnerHTML={{ __html: STORY_CSS }} />
        <div aria-hidden="true" data-story-progress-rail>
          <span data-story-progress-fill />
        </div>
        {children}
      </div>
    </div>
  );
}
