/**
 * 설문 → 디자인 후보 3안 블루프린트 (1차 가공의 결정적 절반).
 *
 * - mock AiService: mockHeroUrl(정적 SVG)을 그대로 heroImageUrl로 사용
 * - supabase AiService: heroImagePrompt로 Gemini 히어로 이미지를 생성해 교체
 *
 * 팔레트/폰트는 설문의 tone·colorPreference를 반영하되 3안이 서로 뚜렷이 다르게
 * (photo 다크 / 3d_render / photo 라이트) 구성한다 — SPEC 부록 C 8원칙 준수.
 */
import type { CandidateStyle, SurveyInput } from '@/lib/types/domain';
import type { SiteTheme } from '@/lib/types/site';

export interface CandidateBlueprint {
  id: string;
  label: string;
  style: CandidateStyle;
  description: string;
  theme: SiteTheme;
  /** 실모드: Gemini 히어로 이미지 생성 프롬프트 */
  heroImagePrompt: string;
  /** mock 모드: 정적 히어로 자산 */
  mockHeroUrl: string;
}

// ---------- 색 유틸 ----------

function normalizeHex(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m) return `#${m[1].toLowerCase()}`;
  const m3 = /^#?([0-9a-f]{3})$/i.exec(hex.trim());
  if (m3) {
    const [r, g, b] = m3[1].toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** a→b 방향으로 t(0~1)만큼 혼합 */
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

const lighten = (hex: string, t: number) => mixHex(hex, '#ffffff', t);
const darken = (hex: string, t: number) => mixHex(hex, '#000000', t);

// ---------- 설문 해석 ----------

/** colorPreference 자유 텍스트 → 브랜드 대표색 hex */
export function parseBrandColor(colorPreference: string): string {
  const hexMatch = /#[0-9a-f]{6}|#[0-9a-f]{3}/i.exec(colorPreference);
  if (hexMatch) {
    const normalized = normalizeHex(hexMatch[0]);
    if (normalized) return normalized;
  }
  const t = colorPreference.toLowerCase();
  const table: Array<[RegExp, string]> = [
    [/버건디|와인|자주/, '#7a2e35'],
    [/빨강|레드|적색/, '#a03428'],
    [/주황|오렌지|테라코타/, '#c0703c'],
    [/앰버|골드|금색|황금/, '#b08d57'],
    [/노랑|옐로|머스터드/, '#c9a227'],
    [/민트|초록|그린|올리브/, '#2f7d6d'],
    [/청록|틸|터콰이즈/, '#22757a'],
    [/네이비|남색/, '#2e4159'],
    [/파랑|블루|하늘/, '#3c5f7d'],
    [/보라|퍼플|바이올렛|라벤더/, '#6b5a8e'],
    [/핑크|분홍|로즈/, '#b0607a'],
    [/갈색|브라운|카멜|베이지/, '#8a6a4c'],
    [/차콜|검정|블랙|먹색/, '#3a362f'],
    [/은색|실버|그레이|회색/, '#6e6e72'],
  ];
  for (const [re, hex] of table) {
    if (re.test(t)) return hex;
  }
  return '#b08d57'; // 기본: 절제된 앰버 골드
}

/** 다크 배경 위에서 primary가 묻히지 않게 보정 */
function primaryOnDark(brand: string): string {
  const lum = luminance(brand);
  if (lum < 90) return lighten(brand, 0.45);
  if (lum < 130) return lighten(brand, 0.2);
  return brand;
}

/** 라이트 배경 위에서 primary가 날아가지 않게 보정 */
function primaryOnLight(brand: string): string {
  const lum = luminance(brand);
  if (lum > 170) return darken(brand, 0.4);
  if (lum > 130) return darken(brand, 0.2);
  return brand;
}

function isLightTone(tone: string): boolean {
  return /친근|밝|깔끔|미니멀|산뜻|캐주얼|따뜻|편안/.test(tone);
}

// ---------- 블루프린트 빌더 ----------

export function buildCandidateBlueprints(survey: SurveyInput): CandidateBlueprint[] {
  const brand = parseBrandColor(survey.colorPreference);
  const biz = survey.businessName;
  const scene = `${survey.industry}, ${survey.purpose}`;

  const darkPhoto: CandidateBlueprint = {
    id: 'cand-photo-dark',
    label: '무광의 밤 — 딥 다크',
    style: 'photo',
    description: `어두운 배경 위에 ${biz}의 대표색을 절제해서 얹은 방향. 사진의 질감과 여백으로 무게감을 만듭니다.`,
    theme: {
      fonts: {
        heading: "'Song Myung', 'Noto Serif KR', serif",
        body: "'IBM Plex Sans KR', 'Apple SD Gothic Neo', sans-serif",
        googleFonts: ['Song Myung', 'IBM Plex Sans KR'],
      },
      palette: {
        background: '#14110d',
        surface: '#1e1a15',
        text: '#efe8db',
        muted: '#94897a',
        primary: primaryOnDark(brand),
        accent: mixHex(brand, '#7a2e2e', 0.45),
      },
      radius: 2,
      customCss: `::selection{background:${primaryOnDark(brand)};color:#14110d}`,
    },
    heroImagePrompt:
      `Moody dark editorial hero photograph for a Korean small business website. Business: ${biz}. Context: ${scene}. ` +
      `Dominant color ${brand}, deep charcoal shadows, cinematic side lighting, generous negative space on the left for headline text, no words, no logos. 16:10.`,
    mockHeroUrl: '/mock/candidate-dark.svg',
  };

  const render3d: CandidateBlueprint = {
    id: 'cand-3d-render',
    label: '소프트 클레이 — 3D 렌더',
    style: '3d_render',
    description: `${biz}의 오브제를 부드러운 3D 렌더로 재해석한 방향. 파스텔 볼륨감으로 친근하지만 값싸 보이지 않게.`,
    theme: {
      fonts: {
        heading: "'Hahmlet', 'Noto Serif KR', serif",
        body: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
        googleFonts: ['Hahmlet', 'Noto Sans KR'],
      },
      palette: {
        background: '#efe9e0',
        surface: '#faf7f2',
        text: '#26211b',
        muted: '#8d8378',
        primary: primaryOnLight(darken(brand, 0.08)),
        accent: mixHex(brand, '#d98e63', 0.5),
      },
      radius: 16,
    },
    heroImagePrompt:
      `Soft 3D clay render hero image for a Korean small business website. Business: ${biz}. Context: ${scene}. ` +
      `Rounded matte 3D objects representing the business, warm beige studio backdrop, subtle ${brand} accents, soft global illumination, isometric-ish composition, no text. 16:10.`,
    mockHeroUrl: '/mock/candidate-3d.svg',
  };

  const lightPhoto: CandidateBlueprint = {
    id: 'cand-photo-light',
    label: '화이트 스페이스 — 라이트 미니멀',
    style: 'photo',
    description: `밝은 여백 위에 ${biz}의 색 하나만 남긴 방향. 덜어낼수록 오래가는 미니멀 구성입니다.`,
    theme: {
      fonts: {
        heading: "'Gowun Batang', 'Noto Serif KR', serif",
        body: "'Pretendard', 'Noto Sans KR', sans-serif",
        googleFonts: ['Gowun Batang', 'Noto Sans KR'],
      },
      palette: {
        background: '#f8f7f4',
        surface: '#ffffff',
        text: '#1c1b18',
        muted: '#8a877e',
        primary: primaryOnLight(brand),
        accent: mixHex(brand, '#e4a11b', 0.4),
      },
      radius: 10,
    },
    heroImagePrompt:
      `Bright minimal editorial hero photograph for a Korean small business website. Business: ${biz}. Context: ${scene}. ` +
      `Airy natural daylight, off-white background, one ${brand} accent element, lots of clean negative space for headline text, no words. 16:10.`,
    mockHeroUrl: '/mock/candidate-light.svg',
  };

  // 톤이 밝은 계열이면 라이트 안을 첫 번째로 — 항상 photo/3d_render/photo 구성 유지
  return isLightTone(survey.tone)
    ? [lightPhoto, render3d, darkPhoto]
    : [darkPhoto, render3d, lightPhoto];
}
