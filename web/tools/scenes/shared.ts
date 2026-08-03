import { readFile } from 'node:fs/promises';
import path from 'node:path';

const FONT_PACKAGE_ROOT = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'node_modules',
  '@fontsource-variable',
  'noto-sans-kr',
);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

type UnknownRecord = Record<string, unknown>;

export interface ScenePalette {
  background: string;
  surface: string;
  primary: string;
  accent: string;
  text: string;
}

export const SUPPORTED_FONT = 'noto-sans-kr' as const;

export function asStrictRecord(value: unknown, label: string, allowedKeys: readonly string[]): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}은 객체여야 합니다.`);
  }
  const record = value as UnknownRecord;
  const unknownKeys = Object.keys(record).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) throw new Error(`${label}에 알 수 없는 키가 있습니다: ${unknownKeys.join(', ')}`);
  return record;
}

export function exactText(record: UnknownRecord, key: string, maxLength: number): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    throw new Error(`${key}은 1..${maxLength}자 문자열이어야 합니다.`);
  }
  if (value !== value.trim()) throw new Error(`${key}의 앞뒤 공백은 허용하지 않습니다.`);
  return value;
}

export function supportedFont(record: UnknownRecord): typeof SUPPORTED_FONT {
  if (record.font !== SUPPORTED_FONT) {
    throw new Error(`font는 ${SUPPORTED_FONT}만 지원합니다.`);
  }
  return SUPPORTED_FONT;
}

export function scenePalette(value: unknown): ScenePalette {
  const record = asStrictRecord(
    value,
    'palette',
    ['background', 'surface', 'primary', 'accent', 'text'],
  );
  const color = (key: keyof ScenePalette): string => {
    const candidate = record[key];
    if (typeof candidate !== 'string' || !COLOR_PATTERN.test(candidate)) {
      throw new Error(`palette.${key}는 #RRGGBB 색상이어야 합니다.`);
    }
    return candidate.toLowerCase();
  };
  return {
    background: color('background'),
    surface: color('surface'),
    primary: color('primary'),
    accent: color('accent'),
    text: color('text'),
  };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

function unicodeRangeContains(unicodeRange: string, codePoint: number): boolean {
  return unicodeRange.split(',').some((segment) => {
    const [startValue, endValue] = segment.trim().replace(/^U\+/iu, '').split('-');
    const start = Number.parseInt(startValue ?? '', 16);
    const end = endValue ? Number.parseInt(endValue, 16) : start;
    return Number.isFinite(start) && Number.isFinite(end) && codePoint >= start && codePoint <= end;
  });
}

/**
 * Embeds only Fontsource unicode chunks touched by this scene's literal text.
 * The returned CSS has no URL dependency, so a generated scene remains a
 * single deterministic HTML file even on a network-isolated render worker.
 */
export async function embeddedKoreanFontCss(literalText: string): Promise<string> {
  const unicodeMap = JSON.parse(
    await readFile(path.join(FONT_PACKAGE_ROOT, 'unicode.json'), 'utf8'),
  ) as Record<string, string>;
  const codePoints = [...new Set(Array.from(literalText, (character) => character.codePointAt(0)!))];
  const matchingChunks = Object.entries(unicodeMap).filter(([, unicodeRange]) =>
    codePoints.some((codePoint) => unicodeRangeContains(unicodeRange, codePoint)),
  );
  if (matchingChunks.length === 0) throw new Error('씬 텍스트에 맞는 Noto Sans KR 폰트 청크가 없습니다.');

  const rules = await Promise.all(matchingChunks.map(async ([chunk, unicodeRange]) => {
    const fileStem = chunk.startsWith('[') ? chunk.slice(1, -1) : chunk;
    const fontFile = path.join(FONT_PACKAGE_ROOT, 'files', `noto-sans-kr-${fileStem}-wght-normal.woff2`);
    const encoded = (await readFile(fontFile)).toString('base64');
    return `@font-face{font-family:"Anaks Labs Noto Sans KR";font-style:normal;font-display:block;font-weight:100 900;src:url(data:font/woff2;base64,${encoded}) format("woff2-variations");unicode-range:${unicodeRange};}`;
  }));
  return rules.join('\n');
}

export function documentShell(input: {
  compositionId: string;
  width: number;
  height: number;
  duration: number;
  fontCss: string;
  styles: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${input.width}, height=${input.height}" />
    <style>
      ${input.fontCss}
      ${input.styles}
    </style>
  </head>
  <body>
    <main id="root" data-composition-id="${input.compositionId}" data-no-timeline data-start="0" data-duration="${input.duration}" data-fps="30" data-width="${input.width}" data-height="${input.height}">
      ${input.body}
    </main>
  </body>
</html>\n`;
}
