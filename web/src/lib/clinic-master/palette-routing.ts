import { createHash } from 'node:crypto';
import { hexToHsl } from '@/lib/design/quality-standards';
import { parseColorsFromCss } from '@/lib/import/extract-palette';
import type { ClinicAccentPreset } from '@/lib/types/site';
import { CLINIC_ACCENT_TOKENS } from './tokens';

export interface ClinicPaletteProjection {
  version: 1;
  kind: 'css' | 'logo';
  sourceSha256: string;
  accentPreset: ClinicAccentPreset;
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

/**
 * 원문 HTML이 메모리에 있을 때만 실행하는 최소 projection. 로고 SVG를 우선하고,
 * 아니면 inline/style/meta CSS를 사용한다. 원문·색 배열은 CrawlArtifact에 남지 않는다.
 */
export function projectClinicPaletteFromHtml(
  html: string,
): ClinicPaletteProjection | null {
  const logoSvg = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/giu)]
    .map((match) => match[0])
    .filter((svg) => /(?:logo|brand)/iu.test(svg.slice(0, 500)));
  if (logoSvg.length > 0) {
    const logo = projection('logo', logoSvg.join('\n'));
    if (logo) return logo;
  }

  const cssEvidence = [
    ...[...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/giu)].map((match) => match[0]),
    ...[...html.matchAll(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/giu)].map((match) => match[0]),
    ...[...html.matchAll(
      /<meta\b[^>]*name\s*=\s*(?:"theme-color"|'theme-color')[^>]*>/giu,
    )].map((match) => match[0]),
  ];
  return cssEvidence.length > 0
    ? projection('css', cssEvidence.join('\n'))
    : null;
}
