import { createHash } from 'node:crypto';
import { hexToHsl } from '@/lib/design/quality-standards';
import { parseColorsFromCss } from '@/lib/import/extract-palette';
import type { ClinicAccentPreset } from '@/lib/types/site';
import {
  CLINIC_PALETTE_ORIGINS,
  type ClinicPaletteOrigin,
} from '@/lib/us-demo/clinic-palette';
import { CLINIC_ACCENT_TOKENS } from './tokens';

/** Enough to carry §2-2's five origins with a little room, and far short of a colour dump. */
export const CLINIC_PALETTE_RAW_CANDIDATE_LIMIT = 8;

export interface ClinicPaletteRawCandidate {
  origin: ClinicPaletteOrigin;
  hex: string;
}

export interface ClinicPaletteProjection {
  version: 1;
  kind: 'css' | 'logo';
  sourceSha256: string;
  accentPreset: ClinicAccentPreset;
  /**
   * §2-2 candidates in priority order. Hex strings only — no raw CSS, no logo bytes. Omitted when
   * the page offered nothing chromatic, which keeps a legacy artifact byte-identical.
   */
  rawCandidates?: ClinicPaletteRawCandidate[];
}

const CLEAN_HUE_WINDOWS = Object.freeze([
  [15, 55],
  [105, 230],
] as const);

function hueInCleanRange(hue: number): boolean {
  return CLEAN_HUE_WINDOWS.some(([min, max]) => hue >= min && hue <= max);
}

function rgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbDistance(left: string, right: string): number {
  const a = rgb(left);
  const b = rgb(right);
  return (
    (a[0] - b[0]) ** 2
    + (a[1] - b[1]) ** 2
    + (a[2] - b[2]) ** 2
  );
}

function chromaticCandidates(colors: readonly string[]) {
  return colors.flatMap((hex, index) => {
    const hsl = hexToHsl(hex);
    return hsl && hsl.s >= 0.18 && hsl.l >= 0.12 && hsl.l <= 0.9
      ? [{ hex: hex.toUpperCase(), hsl, index }]
      : [];
  });
}

/**
 * 색 근거가 있으면 clean preset 하나만 반환한다. 의료 범위 밖의 채도색은 자유색으로
 * 끌고 오지 않고 clean-blue로 fail closed 한다.
 */
export function routeClinicAccentPreset(
  colors: readonly string[],
): ClinicAccentPreset {
  const chromatic = chromaticCandidates(colors);
  const clean = chromatic.filter(({ hsl }) => (
    hsl.l >= 0.18
    && hsl.l <= 0.72
    && hueInCleanRange(hsl.h)
  ));
  if (clean.length === 0) return 'clean-blue';
  clean.sort((left, right) => (
    right.hsl.s - left.hsl.s
    || Math.abs(left.hsl.l - 0.45) - Math.abs(right.hsl.l - 0.45)
    || left.index - right.index
  ));
  const source = clean[0].hex;
  return (Object.entries(CLINIC_ACCENT_TOKENS) as [
    ClinicAccentPreset,
    string,
  ][]).sort((left, right) => (
    rgbDistance(source, left[1]) - rgbDistance(source, right[1])
    || left[0].localeCompare(right[0])
  ))[0][0];
}

function projection(
  kind: ClinicPaletteProjection['kind'],
  source: string,
): ClinicPaletteProjection | null {
  const colors = parseColorsFromCss(source);
  if (chromaticCandidates(colors).length === 0) return null;
  return {
    version: 1,
    kind,
    sourceSha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    accentPreset: routeClinicAccentPreset(colors),
  };
}

function logoMarkup(html: string): string[] {
  return [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/giu)]
    .map((match) => match[0])
    .filter((svg) => /(?:logo|brand)/iu.test(svg.slice(0, 500)));
}

function styleRules(html: string): { selector: string; body: string }[] {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)]
    .flatMap((block) => [...block[1].matchAll(/([^{}]+)\{([^{}]*)\}/gu)])
    .map((rule) => ({ selector: rule[1], body: rule[2] }));
}

/** `background` and `background-color`; the shorthand is where a CTA usually keeps its colour. */
function backgroundValues(body: string): string {
  return [...body.matchAll(/background(?:-color)?\s*:\s*([^;}]+)/giu)]
    .map((match) => match[1])
    .join(' ');
}

/** Bare `color`, never the tail of `background-color` or `border-color`. */
function foregroundValues(body: string): string {
  return [...body.matchAll(/(?:^|[;{\s])color\s*:\s*([^;}]+)/giu)]
    .map((match) => match[1])
    .join(' ');
}

/**
 * §2-2, in priority order: the logo is the one colour a brand chose, then the CTA it paints, then
 * links, then headings, then the declared theme colour. Only chromatic values are carried — a grey
 * handed to §2-3's saturate step would come back as a hue the practice never picked.
 */
export function clinicPaletteRawCandidates(html: string): ClinicPaletteRawCandidate[] {
  const rules = styleRules(html);
  const selected = (
    test: RegExp,
    read: (body: string) => string,
  ) => rules.filter((rule) => test.test(rule.selector)).map((rule) => read(rule.body)).join(' ');
  const inlineButtons = [...html.matchAll(
    /<[^>]*class\s*=\s*(?:"[^"]*(?:btn|button|cta)[^"]*"|'[^']*(?:btn|button|cta)[^']*')[^>]*>/giu,
  )].map((match) => match[0]).join(' ');

  const byOrigin: { origin: ClinicPaletteOrigin; source: string }[] = [
    { origin: 'logo', source: logoMarkup(html).join('\n') },
    {
      origin: 'cta',
      source: `${selected(/\b(?:btn|button|cta)\b/iu, backgroundValues)} ${inlineButtons}`,
    },
    { origin: 'link', source: selected(/(?:^|[\s,>+~])a(?:[.:#[\s,]|$)|\blink\b/iu, foregroundValues) },
    { origin: 'heading', source: selected(/\bh[1-4]\b/iu, foregroundValues) },
    {
      origin: 'theme-color',
      source: [...html.matchAll(
        /<meta\b[^>]*name\s*=\s*(?:"theme-color"|'theme-color')[^>]*>/giu,
      )].map((match) => match[0]).join(' '),
    },
  ];

  return mergeClinicPaletteRawCandidates(byOrigin.map(({ origin, source }) => (
    chromaticCandidates(parseColorsFromCss(source)).map(({ hex }) => ({ origin, hex }))
  )));
}

/**
 * One practice's colour is a property of the site, not of whichever page the projection happened
 * to be taken from: a logo mark can sit on the contact page and nowhere else. Batches are folded
 * back into §2-2 order, deduplicated by hex, and capped.
 */
export function mergeClinicPaletteRawCandidates(
  batches: readonly (readonly ClinicPaletteRawCandidate[])[],
): ClinicPaletteRawCandidate[] {
  const out: ClinicPaletteRawCandidate[] = [];
  const seen = new Set<string>();
  for (const origin of CLINIC_PALETTE_ORIGINS) {
    for (const candidate of batches.flat()) {
      if (candidate.origin !== origin || seen.has(candidate.hex)) continue;
      seen.add(candidate.hex);
      out.push(candidate);
      if (out.length >= CLINIC_PALETTE_RAW_CANDIDATE_LIMIT) return out;
    }
  }
  return out;
}

/**
 * 원문 HTML이 메모리에 있을 때만 실행하는 최소 projection. 로고 SVG를 우선하고,
 * 아니면 inline/style/meta CSS를 사용한다. 원문·색 배열은 CrawlArtifact에 남지 않는다.
 */
export function projectClinicPaletteFromHtml(
  html: string,
): ClinicPaletteProjection | null {
  const withCandidates = (
    result: ClinicPaletteProjection | null,
  ): ClinicPaletteProjection | null => {
    if (!result) return null;
    const rawCandidates = clinicPaletteRawCandidates(html);
    return rawCandidates.length > 0 ? { ...result, rawCandidates } : result;
  };

  const logoSvg = logoMarkup(html);
  if (logoSvg.length > 0) {
    const logo = projection('logo', logoSvg.join('\n'));
    if (logo) return withCandidates(logo);
  }

  const cssEvidence = [
    ...[...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/giu)].map((match) => match[0]),
    ...[...html.matchAll(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/giu)].map((match) => match[0]),
    ...[...html.matchAll(
      /<meta\b[^>]*name\s*=\s*(?:"theme-color"|'theme-color')[^>]*>/giu,
    )].map((match) => match[0]),
  ];
  return cssEvidence.length > 0
    ? withCandidates(projection('css', cssEvidence.join('\n')))
    : null;
}
