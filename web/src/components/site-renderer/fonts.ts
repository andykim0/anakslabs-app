/**
 * 사이트 테마 폰트 로딩.
 *
 * Google Fonts css2 API는 해당 패밀리에 없는 weight를 요청하면
 * 요청 전체가 400으로 실패한다(strict). 그래서:
 *  1) 자주 쓰는 패밀리는 실제 지원 weight 목록을 매핑해 두고,
 *  2) 모르는 패밀리는 보수적으로 400;700만 요청하며,
 *  3) 패밀리당 <link> 1개로 분리해 한 패밀리의 실패가 나머지를 죽이지 않게 한다.
 *
 * Pretendard는 Google Fonts에 없으므로 테마가 참조하면 jsDelivr CDN CSS를 로드.
 */
import type { SiteTheme } from '@/lib/types/site';

export const PRETENDARD_CSS_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

/** css2 :wght@ 축 값 — 패밀리별 실제 지원 weight */
const FAMILY_WEIGHTS: Record<string, string> = {
  // 한글 세리프/명조
  'Noto Serif KR': '200;300;400;500;600;700;800;900',
  'Nanum Myeongjo': '400;700;800',
  'Gowun Batang': '400;700',
  'Song Myung': '400',
  Hahmlet: '100;200;300;400;500;600;700;800;900',
  // 한글 산세리프/고딕
  'Noto Sans KR': '100;200;300;400;500;600;700;800;900',
  'Nanum Gothic': '400;700;800',
  'IBM Plex Sans KR': '100;200;300;400;500;600;700',
  'Gothic A1': '100;200;300;400;500;600;700;800;900',
  'Gowun Dodum': '400',
  Sunflower: '300;500;700',
  // 한글 디스플레이/손글씨
  'Black Han Sans': '400',
  'Do Hyeon': '400',
  Jua: '400',
  'Nanum Pen Script': '400',
  'East Sea Dokdo': '400',
  // 라틴 세리프
  'Playfair Display': '400;500;600;700;800;900',
  'Cormorant Garamond': '300;400;500;600;700',
  'Libre Baskerville': '400;700',
  'EB Garamond': '400;500;600;700;800',
  'Crimson Pro': '200;300;400;500;600;700;800;900',
  'Bodoni Moda': '400;500;600;700;800;900',
  Fraunces: '100;200;300;400;500;600;700;800;900',
  'Abril Fatface': '400',
  Italiana: '400',
  Marcellus: '400',
  Prata: '400',
  // 라틴 산세리프
  'DM Sans': '100;200;300;400;500;600;700;800;900',
  'Space Grotesk': '300;400;500;600;700',
  Archivo: '100;200;300;400;500;600;700;800;900',
  Manrope: '200;300;400;500;600;700;800',
  Sora: '100;200;300;400;500;600;700;800',
  Inter: '100;200;300;400;500;600;700;800;900',
  // 라틴 디스플레이 (design-knowledge 페어링에서 사용 — 단일 웨이트 폰트 주의)
  'Bebas Neue': '400',
  Caveat: '400;500;600;700',
  Cinzel: '400;500;600;700;800;900',
  Fredoka: '300;400;500;600;700',
  Lora: '400;500;600;700',
  Outfit: '100;200;300;400;500;600;700;800;900',
  Syne: '400;500;600;700;800',
  'Barlow Condensed': '100;200;300;400;500;600;700;800;900',
};

const DEFAULT_WEIGHTS = '400;700';

function weightsFor(family: string): string {
  if (FAMILY_WEIGHTS[family]) return FAMILY_WEIGHTS[family];
  const lower = family.toLowerCase();
  for (const [name, weights] of Object.entries(FAMILY_WEIGHTS)) {
    if (name.toLowerCase() === lower) return weights;
  }
  return DEFAULT_WEIGHTS;
}

function encodeFamily(family: string): string {
  return family
    .trim()
    .split(/\s+/)
    .map((word) => encodeURIComponent(word))
    .join('+');
}

/** googleFonts 패밀리 목록 → 패밀리당 css2 stylesheet URL 1개 */
export function googleFontUrls(families: string[] | undefined): string[] {
  if (!families?.length) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of families) {
    const family = raw.trim();
    if (!family) continue;
    const key = family.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(
      // CWV first: a cold font response must not replace laid-out fallback glyphs and create CLS.
      // Cached/fast responses still win the short optional block period; slow responses wait for
      // the next navigation instead of shifting live Korean copy.
      `https://fonts.googleapis.com/css2?family=${encodeFamily(family)}:wght@${weightsFor(family)}&display=optional`,
    );
  }
  return urls;
}

/** 테마가 Pretendard를 참조하면 CDN CSS 로드 필요 */
export function needsPretendard(theme: SiteTheme): boolean {
  return /pretendard/i.test(`${theme.fonts.heading} ${theme.fonts.body}`);
}
