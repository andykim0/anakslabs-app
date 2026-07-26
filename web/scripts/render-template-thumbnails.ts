/**
 * TPL 마케팅 정적 썸네일 렌더러.
 * 실행: node --import tsx scripts/render-template-thumbnails.ts
 * 산출: public/templates/interior/{templateId}.webp
 *
 * 런타임 SiteRenderer를 /templates 카드마다 띄우지 않기 위해, 카탈로그에 pin된
 * DNA 색·히어로 배열·정보 리듬만 결정적 SVG로 투영한 뒤 WebP로 굽는다.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { NAMED_TEMPLATE_CATALOG } from '@/lib/design/templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type { NamedTemplate } from '@/lib/design/templates/types';

const WIDTH = 720;
const HEIGHT = 450;
const OUTPUT_DIRECTORY = join(process.cwd(), 'public', 'templates', 'interior');

function textBars(
  x: number,
  y: number,
  width: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
): string {
  const anchor = align === 'left' ? x : align === 'center' ? x + width / 2 : x + width;
  const barX = (barWidth: number) => (
    align === 'left'
      ? anchor
      : align === 'center'
        ? anchor - barWidth / 2
        : anchor - barWidth
  );
  return [
    [width * 0.28, 8, 0.68],
    [width, 24, 1],
    [width * 0.78, 24, 1],
    [width * 0.58, 12, 0.58],
  ].map(([barWidth, barHeight, opacity], index) => (
    `<rect x="${barX(barWidth)}" y="${y + index * 36}" width="${barWidth}" height="${barHeight}" rx="${Math.min(8, barHeight / 2)}" fill="${color}" opacity="${opacity}"/>`
  )).join('');
}

function heroComposition(
  template: NamedTemplate,
  colors: { background: string; surface: string; primary: string; accent: string; text: string },
): string {
  const id = template.recipe.heroLayoutId;
  const media = (x: number, y: number, width: number, height: number) => (
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="url(#atmosphere)"/>`
  );
  if (id === 'hero.split-left') {
    return `${textBars(54, 68, 280, colors.text)}${media(390, 34, 276, 210)}`;
  }
  if (id === 'hero.split-right') {
    return `${media(54, 34, 276, 210)}${textBars(390, 68, 276, colors.text, 'right')}`;
  }
  if (id === 'hero.text-only-bold') {
    return textBars(54, 46, 610, colors.text);
  }
  if (id === 'hero.image-below') {
    return `${textBars(54, 32, 420, colors.text)}${media(54, 174, 612, 72)}`;
  }
  if (id === 'hero.asymmetric-offset') {
    return `${media(430, 20, 236, 226)}${textBars(54, 92, 330, colors.text)}`;
  }
  if (id === 'hero.overlay-bottom-left') {
    return `${media(26, 18, 668, 228)}${textBars(58, 92, 330, colors.background)}`;
  }
  return `${media(26, 18, 668, 228)}${textBars(175, 72, 370, colors.background, 'center')}`;
}

function informationRhythm(
  template: NamedTemplate,
  colors: { surface: string; primary: string; accent: string; text: string },
): string {
  const id = template.recipe.sectionLayoutIds.features;
  if (id === 'features.numbered-list' || id === 'features.sticky-heading-two-column') {
    return [0, 1, 2].map((index) => (
      `<rect x="${54 + index * 205}" y="${292 + index * 7}" width="178" height="74" rx="10" fill="${colors.surface}"/>`
      + `<rect x="${70 + index * 205}" y="${310 + index * 7}" width="34" height="8" rx="4" fill="${colors.primary}"/>`
      + `<rect x="${70 + index * 205}" y="${330 + index * 7}" width="112" height="7" rx="3.5" fill="${colors.text}" opacity=".42"/>`
    )).join('');
  }
  if (id === 'features.zigzag-media' || id === 'features.featured-first') {
    return [
      `<rect x="54" y="286" width="280" height="102" rx="14" fill="${colors.surface}"/>`,
      `<rect x="354" y="306" width="312" height="82" rx="14" fill="${colors.primary}" opacity=".24"/>`,
      `<rect x="374" y="326" width="150" height="10" rx="5" fill="${colors.text}" opacity=".48"/>`,
      `<rect x="374" y="348" width="220" height="8" rx="4" fill="${colors.text}" opacity=".26"/>`,
    ].join('');
  }
  return [0, 1, 2].map((index) => (
    `<rect x="${54 + index * 205}" y="292" width="178" height="96" rx="16" fill="${colors.surface}"/>`
    + `<rect x="${70 + index * 205}" y="310" width="42" height="42" rx="10" fill="${index === 1 ? colors.accent : colors.primary}" opacity=".72"/>`
    + `<rect x="${70 + index * 205}" y="364" width="112" height="7" rx="3.5" fill="${colors.text}" opacity=".38"/>`
  )).join('');
}

function svgFor(template: NamedTemplate): string {
  const theme = tokenSetToSiteTheme(expandTokens(
    template.recipe.designDna.dnaId,
    template.recipe.designDna.hueSeed,
    template.recipe.designDna.overrides,
  ));
  const colors = theme.palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="atmosphere" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colors.primary}"/>
        <stop offset=".55" stop-color="${colors.accent}"/>
        <stop offset="1" stop-color="${colors.surface}"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.background}"/>
    <rect width="${WIDTH}" height="264" fill="${colors.surface}"/>
    ${heroComposition(template, colors)}
    ${informationRhythm(template, colors)}
    <rect x="54" y="416" width="612" height="2" rx="1" fill="${colors.primary}" opacity=".3"/>
    <rect x="54" y="428" width="128" height="6" rx="3" fill="${colors.text}" opacity=".22"/>
  </svg>`;
}

async function main() {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  let maximumBytes = 0;
  for (const template of NAMED_TEMPLATE_CATALOG) {
    const output = await sharp(Buffer.from(svgFor(template)))
      .webp({ quality: 82, smartSubsample: true })
      .toBuffer();
    maximumBytes = Math.max(maximumBytes, output.byteLength);
    await sharp(output).toFile(join(OUTPUT_DIRECTORY, `${template.id}.webp`));
  }
  console.log(
    `[TPL] 정적 썸네일 ${NAMED_TEMPLATE_CATALOG.length}개 생성 · 최대 ${(maximumBytes / 1024).toFixed(1)}KiB`,
  );
}

main().catch((error) => {
  console.error('[TPL] 정적 썸네일 생성 실패:', error);
  process.exitCode = 1;
});
