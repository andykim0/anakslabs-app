/**
 * What a generated article cover is allowed to be.
 *
 * `post-cover.ts` states the rule this file inherits: a cover may not depict a service the clinic
 * has not declared, because an implant photo on a practice that does not place implants is a false
 * claim made in pictures. A *generated* image cannot be checked against a declaration at all — the
 * model decides what appears — so the only safe subject is no subject: colour, light and geometry
 * built from the practice's own brand tokens.
 *
 * Hence the prompt below refuses, explicitly and in the prompt text itself, people, faces, hands,
 * teeth, instruments, clinical rooms, logos and lettering. What is left is a brand plate, which is
 * what the slot is for: it identifies the article as this practice's without asserting anything.
 * Nothing here reads the article's title, summary, tags or body — same reason as `post-cover.ts`,
 * and it also keeps one site's covers from converging on whatever the month's topics were.
 */

/** 21:9 is the hero ratio the template reserves; the adapter takes this string verbatim. */
export const CONTENT_COVER_ASPECT_RATIO = '21:9' as const;

/** Storage prefix, so generated covers are identifiable in the bucket and in the registry. */
export const CONTENT_COVER_STORAGE_PREFIX = 'content-covers' as const;

/**
 * Nano Banana list price at the time of writing, in USD per image, for the operator note the
 * console prints. It is documentation of a cost, never an input to a decision.
 */
export const CONTENT_COVER_USD_PER_IMAGE = 0.039;

export interface ContentCoverPalette {
  background: string;
  surface: string;
  primary: string;
  accent: string;
}

function hex(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  return /^#[0-9a-fA-F]{6}$/u.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

/**
 * The four colours the plate is built from, normalised.
 *
 * Clinic newbuild themes ship a four-colour palette and leave `accent`/`primary` undefined at
 * runtime, which is the same defect `blogAccent` works around in the renderer. Falling through to
 * a colour that always exists keeps the prompt token-derived instead of emitting the string
 * "undefined" into it.
 */
export function contentCoverPalette(palette: {
  background?: string;
  surface?: string;
  primary?: string;
  accent?: string;
  text?: string;
}): ContentCoverPalette {
  const background = hex(palette.background, '#ffffff');
  const surface = hex(palette.surface, background);
  const primary = hex(palette.primary ?? palette.accent ?? palette.text, '#1f2937');
  const accent = hex(palette.accent ?? palette.primary ?? palette.text, primary);
  return { background, surface, primary, accent };
}

/**
 * The generation prompt. Pure and exported so a test can assert the refusals are still in it —
 * the prohibitions are the safety property, not decoration, and a reworded prompt that quietly
 * drops "no text" ships lettering onto a clinic's masthead.
 */
export function contentCoverPrompt(input: { palette: ContentCoverPalette }): string {
  const { background, surface, primary, accent } = input.palette;
  return [
    'An abstract editorial header plate for a healthcare practice article.',
    `Build the image only from these colours: ${primary} as the dominant field, ${accent} for`,
    `highlights, ${surface} and ${background} for light. Soft directional light from the upper`,
    'right, a calm gradient field, and restrained geometric line work — concentric arcs and thin',
    'connecting strokes at low contrast. Wide cinematic composition with generous empty space on',
    'the left third.',
    'Absolutely no text, letters, numerals, words, watermarks, signatures or logos of any kind.',
    'No people, faces, hands, bodies, teeth, mouths, medical instruments, equipment, treatment',
    'rooms, clinical settings, or anything depicting a medical procedure or its result.',
    'No photographic realism and no recognisable objects: this is a non-representational',
    'background plate.',
  ].join(' ');
}

export interface ContentPostCover {
  assetId: string;
  url: string;
  width?: number;
  height?: number;
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function dimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 20_000
    ? value
    : undefined;
}

/**
 * The public boundary for a stored cover.
 *
 * A malformed cover never fails the post: covers are decoration and the article is the product, so
 * anything that does not parse cleanly is dropped and the template paints its tokenised fallback —
 * which is a finished state, not a degraded one. This is deliberately the opposite of the document
 * gate, where a malformed field takes the whole post private.
 */
export function projectContentPostCover(input: {
  assetId?: string | null;
  url?: string | null;
  width?: unknown;
  height?: unknown;
}): ContentPostCover | null {
  const assetId = input.assetId?.trim() ?? '';
  const url = input.url?.trim() ?? '';
  if (!UUID.test(assetId) || !url || !isHttpUrl(url)) return null;
  const width = dimension(input.width);
  const height = dimension(input.height);
  return {
    assetId,
    url,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}
