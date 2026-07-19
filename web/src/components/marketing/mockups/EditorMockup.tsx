'use client';

/**
 * [마케팅] 하나로 이어지는 캔버스에서 직접 다듬는 과정을 보여주는 에디터 목업.
 * CSS 타임라인 하나를 IO/visibility로 재생·정지하며 React 프레임 업데이트는 하지 않는다.
 */
import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { MousePointer2 } from 'lucide-react';
import { EDITOR_MOCKUP_CSS, editorMockupStyles as styles } from './EditorMockup.styles';

export const EDITOR_DEMO_DURATION_MS = 8_000;

const SECTIONS = ['히어로', '소개', '메뉴', '문의'] as const;

type EditorDemoStyle = CSSProperties & { '--editor-demo-duration': string };

export function EditorMockup({ className }: { className?: string }) {
  const demoRef = useRef<HTMLElement>(null);
  const captionId = useId();
  const canvasHeadingId = useId();

  useEffect(() => {
    const demo = demoRef.current;
    if (!demo || typeof window.IntersectionObserver !== 'function') return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let isIntersecting = false;

    const syncPlayback = () => {
      const canPlay = isIntersecting && !document.hidden && !reducedMotion.matches;
      demo.dataset.enhanced = reducedMotion.matches ? 'false' : 'true';
      demo.dataset.playing = canPlay ? 'true' : 'false';
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry?.isIntersecting ?? false;
        syncPlayback();
      },
      { rootMargin: '0px', threshold: 0.2 },
    );

    const handleVisibilityChange = () => syncPlayback();
    const handleMotionChange = () => syncPlayback();

    demo.dataset.enhanced = reducedMotion.matches ? 'false' : 'true';
    demo.dataset.playing = 'false';
    observer.observe(demo);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    reducedMotion.addEventListener('change', handleMotionChange);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      reducedMotion.removeEventListener('change', handleMotionChange);
      delete demo.dataset.enhanced;
      delete demo.dataset.playing;
    };
  }, []);

  const demoStyle: EditorDemoStyle = {
    '--editor-demo-duration': `${EDITOR_DEMO_DURATION_MS}ms`,
  };

  return (
    <>
      <style data-editor-demo-css>{EDITOR_MOCKUP_CSS}</style>
      <figure
        ref={demoRef}
        data-editor-demo="continuous-canvas"
        aria-labelledby={captionId}
        className={`${styles.demo}${className ? ` ${className}` : ''}`}
        style={demoStyle}
      >
        <figcaption id={captionId} className="sr-only">
          하나로 이어지는 홈페이지 캔버스에서 메뉴 영역을 고르고, 이미지 블록을 옮기고, 문구와 색을 직접 다듬는 예시
        </figcaption>

        <div className={styles.workspace}>
          <nav className={styles.sectionRail} aria-label="편집할 홈페이지 영역">
            <p className={styles.railLabel}>페이지 구성</p>
            <ol className={styles.sectionList}>
              {SECTIONS.map((section, index) => (
                <li key={section}>
                  <span
                    className={`${styles.sectionItem} ${
                      index === 0 ? styles.heroSection : index === 2 ? styles.menuSection : ''
                    }`}
                  >
                    <span className={styles.sectionDot} aria-hidden="true" />
                    {section}
                  </span>
                </li>
              ))}
            </ol>

            <div className={styles.blockLibrary} role="group" aria-label="추가할 블록">
              <span className={styles.railLabel}>블록</span>
              <span className={styles.imageSource}>
                <span className={styles.imageGlyph} aria-hidden="true" />
                이미지
              </span>
            </div>
          </nav>

          <section className={styles.canvas} aria-labelledby={canvasHeadingId}>
            <h3 id={canvasHeadingId} className="sr-only">
              메뉴 영역 편집 화면
            </h3>

            <header className={styles.canvasToolbar}>
              <span className={styles.toolbarStatus} aria-hidden="true">
                <span className={styles.heroToolbarLabel}>히어로</span>
                <span className={styles.menuToolbarLabel}>메뉴</span>
              </span>
              <span className={styles.savedStatus}>저장됨</span>
            </header>

            <div className={styles.canvasBody}>
              <p className={styles.canvasEyebrow}>SEASON MENU</p>
              <div className={styles.typingLine}>
                <span className={styles.typingText}>여름 메뉴를 소개해요</span>
                <span className={styles.typingCaret} aria-hidden="true" />
              </div>

              <div className={styles.contentGrid}>
                <div className={styles.copyLines} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <figure className={styles.imageSlot}>
                  <div className={styles.imageBlock} aria-hidden="true">
                    <span className={styles.imageSun} />
                    <span className={styles.imageHill} />
                  </div>
                  <figcaption>대표 이미지</figcaption>
                </figure>
              </div>
            </div>

            <aside className={styles.palette} aria-label="홈페이지 강조 색">
              <span className={styles.paletteLabel}>강조 색</span>
              <ul>
                <li>
                  <span className={`${styles.paletteChip} ${styles.blueChip}`}>
                    <span className="sr-only">파란색</span>
                  </span>
                </li>
                <li>
                  <span className={`${styles.paletteChip} ${styles.mintChip}`}>
                    <span className="sr-only">민트색</span>
                  </span>
                </li>
                <li>
                  <span className={`${styles.paletteChip} ${styles.goldChip}`}>
                    <span className="sr-only">금색</span>
                  </span>
                </li>
              </ul>
            </aside>
          </section>

          <span className={styles.dragGhost} aria-hidden="true">
            <span className={styles.imageGlyph} />
            이미지 블록
          </span>
          <MousePointer2 className={styles.cursor} aria-hidden="true" />
        </div>
      </figure>
    </>
  );
}
