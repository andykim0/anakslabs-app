import type { CSSProperties, ReactNode } from 'react';

const STORY_CSS = `
[data-landing-continuation] {
  --story-progress: var(--scroll-progress, 0);
  position: relative; isolation: isolate; overflow: clip; background: transparent;
}
[data-story-progress-rail] {
  position: absolute; z-index: 20; top: clamp(300px, 28vw, 460px); bottom: 220px;
  left: max(10px, calc((100vw - 1340px) / 2)); width: 2px; overflow: hidden;
  border-radius: 999px; background: linear-gradient(to bottom,rgba(23,77,218,.12),rgba(3,191,169,.2));
  pointer-events: none;
}
[data-story-progress-fill] {
  display: block; width: 100%; height: 100%; transform: scaleY(var(--story-progress));
  transform-origin: 50% 0; background: linear-gradient(to bottom,#174dda,#08afc5 52%,#03bfa9);
  box-shadow: 0 0 18px rgba(8,175,197,.38);
}
[data-story-chapter] { position: relative; isolation: isolate; }
[data-story-chapter]::before {
  position: absolute; inset: 0; z-index: 0; content: ''; pointer-events: none; opacity: .7;
  background: radial-gradient(circle at 7% 16%,rgba(23,77,218,.065),transparent 24%),
              radial-gradient(circle at 92% 84%,rgba(3,191,169,.055),transparent 22%);
}
[data-story-chapter]::after {
  position: absolute; z-index: 3; top: clamp(52px, 6vw, 86px);
  left: max(20px, calc((100vw - 1340px) / 2 - 15px));
  display: grid; width: 30px; height: 30px; place-items: center; content: attr(data-story-chapter);
  border: 1px solid rgba(23,77,218,.2); border-radius: 999px; background: rgba(248,251,255,.9);
  color: #174dda; font: 600 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing: .08em; box-shadow: 0 8px 24px rgba(11,23,54,.08); pointer-events: none;
}
[data-story-chapter] > * { position: relative; z-index: 1; }
@media (max-width: 1279.98px) {
  [data-story-chapter]::after { display: none; }
}
@media (max-width: 767.98px) {
  [data-story-progress-rail] { left: 7px; width: 1px; opacity: .7; }
  [data-story-chapter]::before { opacity: .46; }
}
@media (prefers-reduced-motion: reduce) {
  [data-story-progress-fill] { transform: scaleY(1); }
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
