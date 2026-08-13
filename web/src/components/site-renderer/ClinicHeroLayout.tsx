import type { CSSProperties, ReactNode } from 'react';
import type { ClinicHeroLayoutDecision, Section } from '@/lib/types/site';

/**
 * [D2] The en-US clinic hero, in the two layouts that never put text on a washed photograph.
 *
 * This is a separate DOM path on purpose. The legacy hero nests its copy inside
 * [data-clinic-flow-hero-media], whose ::after paints a white gradient across the whole picture —
 * a rule the ko-KR hero depends on and drives with its own variable. Rather than teach that rule
 * an exception, neither layout here emits that element at all, so the gradient has nothing to
 * match and the KR path keeps its bytes.
 *
 * NAMING TRAP, deliberately spelled out: the text plate reads var(--clinic-background), which is
 * where TEMPLATE-SYSTEM §2's `--surface` slot lands. The CSS variable called --clinic-surface is
 * §2's `--surface-2`, which has never been through the 12:1 ink gate and must not sit behind body
 * text. The names invert between the two vocabularies; the gate is what decides.
 */
export const CLINIC_HERO_LAYOUT_CSS = `
[data-clinic-hero-mode] { position: relative; overflow: hidden; }
[data-clinic-hero-mode] [data-clinic-hero-plate] {
  background: var(--clinic-background, #FFFFFF);
  display: grid; align-content: center;
  padding: clamp(2.5rem, 5vw, 5rem) clamp(1.5rem, 4vw, 4rem);
}
[data-clinic-hero-mode] [data-clinic-hero-photo] { position: relative; overflow: hidden; }
[data-clinic-hero-mode] [data-clinic-hero-photo] > img {
  display: block; width: 100%; height: 100%; object-fit: cover;
}

/* split — the photograph keeps its own column and is shown unwashed at its own size. */
[data-clinic-hero-mode="split"] [data-clinic-hero-split] {
  display: grid;
  grid-template-columns: 52fr 48fr;
  min-height: clamp(30rem, 62vh, 44rem);
}
[data-clinic-hero-mode="split"] [data-clinic-hero-plate] {
  width: min(100%, calc(var(--clinic-container-max, 1140px) / 2));
  justify-self: end;
}

/* fullbleed-panel — only for a photograph large enough to carry the full width honestly. */
[data-clinic-hero-mode="fullbleed-panel"] [data-clinic-hero-fullbleed] {
  position: relative;
  min-height: clamp(32rem, 70vh, 48rem);
  display: grid;
  align-items: end;
}
[data-clinic-hero-mode="fullbleed-panel"] [data-clinic-hero-photo] {
  position: absolute; inset: 0;
}
[data-clinic-hero-mode="fullbleed-panel"] [data-clinic-hero-plate] {
  position: relative;
  width: min(100%, 46rem);
  margin: clamp(1.5rem, 4vw, 3.5rem);
  border-radius: var(--clinic-radius-md, 4px);
}

@media (max-width: 900px) {
  /* split stacks: the photograph reads first, then the copy, and neither covers the other. */
  [data-clinic-hero-mode="split"] [data-clinic-hero-split] {
    grid-template-columns: 1fr;
    min-height: 0;
  }
  [data-clinic-hero-mode="split"] [data-clinic-hero-photo] { order: -1; height: 40vh; }
  [data-clinic-hero-mode="split"] [data-clinic-hero-plate] {
    width: 100%; justify-self: stretch;
  }
  [data-clinic-hero-mode="fullbleed-panel"] [data-clinic-hero-plate] {
    width: auto; margin: 0; border-radius: 0;
  }
  [data-clinic-hero-mode="fullbleed-panel"] [data-clinic-hero-fullbleed] {
    min-height: clamp(26rem, 60vh, 34rem);
  }
}
`;

export function ClinicHeroLayoutSection({
  section,
  decision,
  heading,
  isFirst,
  surfaceStyle,
  sectionAttributes,
  children,
}: {
  section: Section;
  decision: ClinicHeroLayoutDecision;
  heading: string;
  isFirst: boolean;
  surfaceStyle?: CSSProperties;
  sectionAttributes?: Record<string, string>;
  children: ReactNode;
}) {
  const image = section.background.image;
  /* No scrim, no gradient, no overlay element. The picture is shown as the practice took it. */
  const photo = image ? (
    <div data-clinic-hero-photo>
      {/* The clinic source compiler only places prospect or pinned licensed imagery here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt={`${heading} practice`}
        loading={isFirst ? 'eager' : 'lazy'}
        fetchPriority={isFirst ? 'high' : undefined}
        decoding="async"
      />
    </div>
  ) : null;

  return (
    <section
      id={section.id}
      data-anchor={section.id}
      data-section-type={section.type}
      data-clinic-flow-section={`hero.${decision.mode}`}
      data-clinic-archetype={`hero.${decision.mode}`}
      data-clinic-hero-mode={decision.mode}
      {...sectionAttributes}
      aria-label={section.name}
      style={surfaceStyle}
    >
      {decision.mode === 'split' ? (
        <div data-clinic-hero-split>
          <div data-clinic-hero-plate>{children}</div>
          {photo}
        </div>
      ) : (
        <div data-clinic-hero-fullbleed>
          {photo}
          <div data-clinic-hero-plate>{children}</div>
        </div>
      )}
    </section>
  );
}
