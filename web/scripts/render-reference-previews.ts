/**
 * [R4] 레퍼런스 갤러리 미리보기 렌더 — 각 갤러리 항목의 실제 파생 팔레트 + 뼈대(히어로 형태·밀도)를
 * 결정적 무드카드 SVG로 그려 webp로 저장한다(AI 이미지 생성 아님 — 우리 자산 렌더).
 *
 * 실현성(R0 정찰): SiteRenderer의 '충실한' 스크린샷은 컨테이너 쿼리(cqw)+100dvh+임의 customCss 때문에
 * 헤드리스 브라우저(puppeteer/playwright)가 필요한데 저장소에 없다(satori/resvg는 컨테이너 쿼리 미지원).
 * → 인프라 사유로 '충실 스크린샷'은 보류하고, 대안으로 실제 파생색·히어로 형태·섹션 밀도를 반영한
 * 무드카드를 sharp(librsvg)로 래스터한다. 헤드리스가 추가되면 이 스크립트의 SVG 생성부를 render-static
 * HTML 스크린샷으로 교체하면 된다(파일 경로·개수 계약 동일).
 *
 * 실행:  node --import tsx web/scripts/render-reference-previews.ts
 * 산출:  web/public/reference/{id}.webp  (각 ≤150KB, 데스크톱 16:10)
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { REFERENCE_GALLERY, type ReferenceDesign } from '@/lib/design/reference-gallery';
import { paletteEntryById, derivedPaletteFor } from '@/lib/design/palette-library';
import { skeletonById, type HeroVariant } from '@/lib/data/skeletons';

const W = 1200;
const H = 750;
const OUT_DIR = join(process.cwd(), 'public', 'reference');

/** heroVariant → 히어로 텍스트 바(kicker/title/sub/CTA) 수평 정렬 원점 */
function heroBars(variant: HeroVariant, color: string, cta: string): string {
  const barW = 420;
  const x = variant === 'centered' ? (W - barW) / 2 : variant === 'split' ? W - barW - 90 : 90;
  const anchor = variant === 'centered' ? 'middle' : variant === 'split' ? 'end' : 'start';
  const bx = (w: number) => (anchor === 'middle' ? x + (barW - w) / 2 : anchor === 'end' ? x + barW - w : x);
  return `
    <rect x="${bx(120)}" y="150" width="120" height="14" rx="7" fill="${color}" opacity="0.75"/>
    <rect x="${bx(barW)}" y="185" width="${barW}" height="40" rx="8" fill="${color}"/>
    <rect x="${bx(barW - 90)}" y="235" width="${barW - 90}" height="40" rx="8" fill="${color}"/>
    <rect x="${bx(300)}" y="300" width="300" height="22" rx="6" fill="${color}" opacity="0.7"/>
    <rect x="${bx(150)}" y="345" width="150" height="40" rx="10" fill="${cta}"/>`;
}

/** density → 하단 섹션 블록 수 */
function densityBlocks(density: string, surface: string, primary: string): string {
  const rows = density === 'rich' ? 3 : density === 'standard' ? 2 : 1;
  let out = '';
  for (let r = 0; r < rows; r += 1) {
    const y = 470 + r * 90;
    for (let c = 0; c < 3; c += 1) {
      const x = 90 + c * 350;
      out += `<rect x="${x}" y="${y}" width="320" height="70" rx="10" fill="${surface}"/>`;
      out += `<rect x="${x + 20}" y="${y + 20}" width="60" height="30" rx="6" fill="${primary}" opacity="0.5"/>`;
    }
  }
  return out;
}

function svgFor(design: ReferenceDesign): string {
  const entry = paletteEntryById(design.paletteId)!;
  const p = derivedPaletteFor(entry);
  const skel = skeletonById(design.skeletonId)!;
  const heroTextColor = entry.dark ? p.text : p.background;
  // 히어로 밴드(상단 55%): primary→surface 그라디언트 + 스크림 느낌 오버레이
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${p.background}"/>
    <defs><linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.primary}"/><stop offset="1" stop-color="${p.surface}"/>
    </linearGradient></defs>
    <rect x="0" y="0" width="${W}" height="430" fill="url(#hero)"/>
    <rect x="0" y="0" width="${W}" height="430" fill="${entry.dark ? '#000' : p.text}" opacity="0.28"/>
    ${heroBars(skel.heroVariant, heroTextColor, p.accent)}
    ${densityBlocks(skel.density, p.surface, p.primary)}
    <!-- 팔레트 스와치 스트립 -->
    <g>${[p.primary, p.accent, p.surface, p.text].map((c, i) => `<rect x="${90 + i * 44}" y="700" width="36" height="36" rx="8" fill="${c}" stroke="${p.muted}" stroke-width="1"/>`).join('')}</g>
  </svg>`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0;
  let maxKb = 0;
  for (const design of REFERENCE_GALLERY) {
    const svg = svgFor(design);
    const buf = await sharp(Buffer.from(svg)).resize(600, 375).webp({ quality: 80 }).toBuffer();
    const kb = buf.length / 1024;
    maxKb = Math.max(maxKb, kb);
    await sharp(buf).toFile(join(OUT_DIR, `${design.id}.webp`));
    ok += 1;
  }
  console.log(`[R4] 레퍼런스 미리보기 ${ok}/${REFERENCE_GALLERY.length}개 생성 → public/reference/ (최대 ${maxKb.toFixed(1)}KB)`);
  console.log('[R4] 주: 충실 SiteRenderer 스크린샷은 헤드리스 브라우저(부재)가 필요 — 무드카드로 대체(실제 파생색·히어로형·밀도 반영).');
}

main().catch((e) => {
  console.error('[R4] 실패:', e);
  process.exit(1);
});
