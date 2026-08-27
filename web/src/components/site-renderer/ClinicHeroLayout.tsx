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
  /*
   * split stacks, and the copy reads first. The photograph used to be pulled above it with
   * order:-1, which spent 40vh of a 390x844 phone before the practice's name appeared: the whole
   * first viewport was a picture, and the H1, the opening line and the booking CTA were all below
   * the fold. Source order is already plate-then-photo, so the reorder is simply dropped; the
   * photo keeps its bounded height so it cannot take the screen back on the way down.
   */
  [data-clinic-hero-mode="split"] [data-clinic-hero-split] {
    grid-template-columns: 1fr;
    min-height: 0;
  }
  [data-clinic-hero-mode="split"] [data-clinic-hero-photo] { height: 40vh; }
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
`
/**
 * The licensed-imagery caption sits at the foot of the photograph column. Its base type lives in
 * CLINIC_FLOW_CSS, which every clinic page emits; only this placement belongs to this file.
 */
+ `
[data-clinic-hero-mode] [data-clinic-hero-photo] { display: grid; align-content: end; }
[data-clinic-hero-mode] [data-clinic-hero-photo] [data-clinic-stock-disclosure] {
  position: relative;
  z-index: 1;
  padding-inline: 1rem;
  padding-block: .5rem;
  background: color-mix(in srgb, var(--clinic-background, #FFFFFF) 88%, transparent);
}
`
/**
 * ONE BAND ABOVE THE FIRST WORD, not three.
 *
 * Measured on the issued 390-wide preview before this rule: the header ended at 132 and the
 * kicker began at 316 — 184px of empty white, which is not one deliberate gap but three paddings
 * stacked, none of which knows about the others:
 *
 *   64px  the clinic mobile section rhythm, `.anaks-site[data-clinic-master] section[data-section-type]`
 *         in SiteRenderer's CLINIC_MASTER_CSS. It carries `!important` and matches EVERY clinic
 *         section, so `[data-clinic-flow-section^="hero."] { padding-block: 0 }` — which does win
 *         on desktop — loses to it on a phone and the hero silently gets a body section's rhythm.
 *         This was read off the live page with CSSOM rather than reasoned about: the first
 *         explanation written here blamed ordinary specificity and was wrong, and the rule that
 *         followed from it did not fire.
 *   40px  [data-clinic-hero-plate]'s own block padding.
 *   80px  [data-clinic-flow-hero-copy]'s padding-block, which exists for the LEGACY hero, where
 *         the copy sits directly on the photograph and needs its own inset. Inside a plate that
 *         already has padding it is doubled inset for no reason.
 *
 * The plate is the element that carries the background, so the plate owns the band: 72px, once.
 * The section keeps none and the inner copy keeps none.
 *
 * The first rule below therefore has to match `!important` with `!important`, at the same
 * specificity as the rhythm rule it is answering (0,2,1 — one class, one attribute, one type) and
 * later in source order, which it is: SiteRenderer emits CLINIC_MASTER_CSS before this file's CSS.
 * Anything weaker is silently ignored, which is exactly what happened the first time.
 *
 * 72 rather than 40 or 96: 40 crowds the practice's name against a sticky header, 96 gives most
 * of the saving back. 72 is the 64px the section rhythm already uses at this breakpoint plus the
 * half-step that clears the header edge, and it lifts everything below it by 112px — which is
 * what puts Enamel's booking CTA (bottom 891 on an 844-tall screen) back inside the fold rather
 * than one scroll under it.
 *
 * Scoped to [data-clinic-hero-mode], the en-US D2 hero. The legacy hero the KR clinics render
 * carries no such attribute and keeps its bytes. Desktop (>900px) is untouched: every rule here
 * is inside the same breakpoint at which this layout already stacks.
 */
+ `
@media (max-width: 900px) {
  .anaks-site[data-clinic-master] section[data-clinic-hero-mode] { padding-block: 0 !important; }
  [data-clinic-hero-mode] [data-clinic-hero-plate] { padding-block: 72px; }
  [data-clinic-hero-mode] [data-clinic-flow-hero-copy] { padding-block: 0; }
}
`;

export function ClinicHeroLayoutSection({
  section,
  decision,
  heading,
  isFirst,
  surfaceStyle,
  sectionAttributes,
  imageDisclosure,
  children,
}: {
  section: Section;
  decision: ClinicHeroLayoutDecision;
  heading: string;
  isFirst: boolean;
  surfaceStyle?: CSSProperties;
  sectionAttributes?: Record<string, string>;
  /** Operator sourcing note for the hero picture. A caption on the image, never body copy. */
  imageDisclosure?: string;
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
      {imageDisclosure ? (
        <p data-clinic-stock-disclosure>{imageDisclosure}</p>
      ) : null}
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
