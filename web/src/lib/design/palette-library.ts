/**
 * [R1] 팔레트 라이브러리 — 고객이 실제 미리보기로 고르는 큐레이션 색 풀.
 *
 * 배경: 컴맹 소상공인은 색 코드를 못 고른다. 그래서 색은 우리가 큐레이션한 충분한 풀로 갖고,
 * 고객은 스와치/미리보기를 보고 고르기만 한다. 신규 색 자산을 만들지 않고 기존 CURATED_PALETTES(30)를
 * seed 스키마로 승격한다(중복 신설 금지). 각 항목은 {primary, secondary} 시드로 derivePalette를 거쳐
 * 6토큰 + 본문 AA(4.5:1, 함수 내부 자가교정)를 결정적으로 산출한다 — 생성 파이프라인과 동일 경로.
 *
 * seed shape는 ReferenceSample.paletteSeed와 동일( {primary, secondary?} ) — 신규 shape 금지.
 */
import { CURATED_PALETTES } from '@/lib/ai/design-knowledge-data';
import { derivePalette, type DerivedPalette } from '@/lib/design/quality-standards';

export interface PaletteLibraryEntry {
  id: string;
  /** 한국어 표시명 */
  label: string;
  /** 무드/톤 태그 (설문 톤·컬러 선호와 부분일치) */
  tone: string[];
  /** 업종 매칭 어휘 (R3 갤러리 업종 커버리지·추천 정렬용) */
  industries: string[];
  /** 다크 배경 여부 — derivePalette opts.dark로 전달 */
  dark: boolean;
  /** derivePalette 시드 (colorPreference/secondaryColor 파생과 동일 경로) */
  seed: { primary: string; secondary?: string };
  /** 대표 스와치 = 실제 파생 6토큰의 [primary, background, surface, text] (WYSIWYG 미리보기) */
  swatch: [string, string, string, string];
}

/** 라이브러리 항목 → derivePalette 6토큰(AA 자가교정). 생성 시 이 색이 실제 사용된다. */
export function derivedPaletteFor(entry: PaletteLibraryEntry): DerivedPalette {
  return derivePalette(entry.seed.primary, entry.seed.secondary, { dark: entry.dark });
}

/** CURATED_PALETTES(30) 승격 — 각 큐레이션 팔레트의 primary/accent를 시드로. ≥24 충족(중복 신설 0). */
export const PALETTE_LIBRARY: PaletteLibraryEntry[] = CURATED_PALETTES.map((cp) => {
  const seed = { primary: cp.palette.primary, secondary: cp.palette.accent };
  const d = derivePalette(seed.primary, seed.secondary, { dark: cp.dark });
  return {
    id: cp.id,
    label: cp.name,
    tone: cp.mood,
    industries: cp.industries,
    dark: cp.dark,
    seed,
    swatch: [d.primary, d.background, d.surface, d.text],
  };
});

export function paletteEntryById(id: string): PaletteLibraryEntry | undefined {
  return PALETTE_LIBRARY.find((e) => e.id === id);
}

/** 업종 어휘 부분일치로 추천 팔레트 정렬(없으면 원본 순서). R5 선택 UI 기본 추천용. */
export function palettesForIndustry(industry: string): PaletteLibraryEntry[] {
  const q = industry.trim();
  if (!q) return PALETTE_LIBRARY;
  const matched = PALETTE_LIBRARY.filter((e) => e.industries.some((k) => q.includes(k) || k.includes(q)));
  const rest = PALETTE_LIBRARY.filter((e) => !matched.includes(e));
  return [...matched, ...rest];
}
