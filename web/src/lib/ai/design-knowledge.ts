/**
 * 디자인 지식 큐레이션 모듈 — 설문(SurveyInput) → 디자인 브리프 3안 선택 (결정적, API 불필요).
 *
 * 출처 및 라이선스 (파생·큐레이션본):
 * - frontend-design 스킬 (Apache-2.0, © Anthropic):
 *   DESIGN_PRINCIPLES_PROMPT 는 해당 스킬의 원칙을 우리말로 재서술한 것 (원문 복사 아님).
 * - ui-ux-pro-max 스킬 데이터 (MIT, © NextLevelBuilder):
 *   팔레트/폰트/스타일/랜딩 패턴 데이터는 design-knowledge-data.ts 에 큐레이션 (CSV 원본의 발췌·손질본).
 *
 * 런타임 의존성 0 — 순수 데이터 + 순수 함수. mock 모드에서도 그대로 동작한다.
 * Math.random 금지: 같은 설문 입력이면 항상 같은 결과 (설문 문자열 해시 기반 변주만 사용).
 */
import type { SiteTheme, SectionType } from '@/lib/types/site';
import type { SurveyInput } from '@/lib/types/domain';
import {
  CURATED_PALETTES,
  FONT_PAIRINGS,
  LEGACY_FONT_PAIRINGS,
  STYLE_DIRECTIONS,
  LANDING_PATTERNS,
  type CuratedPalette,
  type FontPairing,
  type StyleDirection,
  type LandingPattern,
} from './design-knowledge-data';
import { povForStyle } from '@/lib/design/quality-standards';
import { toneText } from '@/lib/onboarding/tone';

// 데이터·타입 재노출 — 소비자는 이 모듈 하나만 import 하면 된다.
export {
  CURATED_PALETTES,
  FONT_PAIRINGS,
  LEGACY_FONT_PAIRINGS,
  STYLE_DIRECTIONS,
  LANDING_PATTERNS,
  type CuratedPalette,
  type FontPairing,
  type StyleDirection,
  type LandingPattern,
};

// ---------- 1. 디자인 원칙 프롬프트 (frontend-design 의 정신을 우리말로 재서술) ----------

export const DESIGN_PRINCIPLES_PROMPT = `You are the lead designer at a small design studio. The client pays for a visual identity that cannot be confused with another business. Create a design that could only come from this brief.

1. Start with a point of view. Build from this business's materials, tools, space, and voice rather than the industry average. The hero should make one claim by showing the most distinctive real aspect of the business.

2. Avoid overused display defaults. Do not use Inter, Roboto, Arial, Helvetica, system-ui, Open Sans, or Noto Sans alone for hero headings. Pair a distinctive display face with a readable body face and define scale, weight, and tracking. Keep a working fallback chain for every source language.

3. Keep the palette restrained. Use five or six named roles for background, surface, body, muted text, primary, and accent. Do not assemble a rainbow of unrelated colors.

4. Create hierarchy with size and space. Make the primary element clearly large and keep supporting elements quiet. Use numbers, labels, and dividers only when the content actually has that structure.

5. Keep copy specific. Do not stack adjectives. State one concrete, sourced fact in a short active sentence. Do not use hype, emoji, or exclamation points. A button label must name the action that happens, such as "Book an appointment" or "View services."

6. Take one aesthetic risk. Choose one memorable signature element and keep everything around it disciplined. Put boldness in one place.

Avoid three defaults unless the brief explicitly calls for them: cream with high-contrast serif and terracotta; black with one fluorescent accent; or a dense newspaper grid with hairline rules. The language of the brief always wins.`;

// ---------- 2. 디자인 브리프 ----------

/** 1차 가공(디자인 후보 3안) 한 안을 구성하는 선택 결과 */
export interface DesignBrief {
  style: StyleDirection;
  palette: CuratedPalette;
  fonts: FontPairing;
  pattern: LandingPattern;
  /** 한국어 후보명 (예: '다크 럭셔리 · 차콜 앰버') */
  label: string;
  /** 한국어 1~2문장 설명 */
  description: string;
}

// ---------- 내부 유틸 (결정적 스코어링) ----------

/** 설문 전체를 소문자 매칭용 텍스트로 합친다. */
function surveyToText(survey: SurveyInput): string {
  return [
    survey.businessName,
    survey.purpose,
    survey.industry,
    toneText(survey.tone),
    survey.colorPreference,
    survey.extraNotes ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * 키워드 부분일치 점수 — 한국어는 어간 포함(예: '고급' ⊂ '고급스러운'),
 * 영어는 단어 포함으로 잡는다. 오탐 방지를 위해 2글자 미만 키워드는 무시.
 */
function keywordScore(text: string, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    const k = keyword.toLowerCase();
    if (k.length >= 2 && text.includes(k)) score += 1;
  }
  return score;
}

/** 두 어휘 배열의 교집합 크기 (정확 일치, 대소문자 무시) */
function overlapCount(a: string[], b: string[]): number {
  const set = new Set(b.map((s) => s.toLowerCase()));
  let n = 0;
  for (const s of a) if (set.has(s.toLowerCase())) n += 1;
  return n;
}

/** djb2 문자열 해시 — Math.random 대신 쓰는 결정적 변주 소스 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 동점일 때만 순서에 영향을 주는 미세 지터 (0 ~ 0.096, 결정적) */
function jitter(seed: string, id: string): number {
  return (hashString(`${seed}::${id}`) % 97) / 1000;
}

/** [F3 #7] 무드보드에서 고른 레퍼런스 샘플의 스타일에 주는 가중치(키워드 1매치=3보다 크게 → 후보로 부상) */
const REFERENCE_STYLE_WEIGHT = 5;

function rankStyles(
  text: string,
  seed: string,
  weightStyleIds?: ReadonlySet<string>,
): Array<{ st: StyleDirection; score: number }> {
  return STYLE_DIRECTIONS.map((st) => ({
    st,
    score:
      keywordScore(text, st.keywords) * 3 +
      keywordScore(text, st.bestFor) * 2 -
      keywordScore(text, st.avoid) * 4 +
      (weightStyleIds?.has(st.id) ? REFERENCE_STYLE_WEIGHT : 0) +
      jitter(seed, st.id),
  })).sort((a, b) => b.score - a.score);
}

function rankPalettes(
  text: string,
  style: StyleDirection,
  seed: string,
): Array<{ p: CuratedPalette; score: number }> {
  return CURATED_PALETTES.map((p) => ({
    p,
    score:
      keywordScore(text, p.industries) * 3 +
      keywordScore(text, p.mood) * 2 +
      overlapCount(style.paletteMood, p.mood) * 2 +
      jitter(seed, `${style.id}:${p.id}`),
  })).sort((a, b) => b.score - a.score);
}

function rankFonts(
  text: string,
  style: StyleDirection,
  seed: string,
): Array<{ f: FontPairing; score: number }> {
  return LEGACY_FONT_PAIRINGS.map((f) => ({
    f,
    score:
      overlapCount(style.fontMood, f.mood) * 3 +
      keywordScore(text, f.mood) * 2 +
      keywordScore(text, f.bestFor) * 2 +
      jitter(seed, `${style.id}:${f.id}`),
  })).sort((a, b) => b.score - a.score);
}

/**
 * 다양성 보장 스타일 선택 — [온보딩] 차별화 축은 POV(무드).
 * 이미지 렌더 스타일(candidateStyle)은 고객이 imageStyle로 고정하므로(design-candidates에서 오버라이드),
 * 3안은 "같은 스타일 × 서로 다른 무드(POV)"가 되도록 POV가 겹치지 않게 고른다.
 * 1) 최고점 1개
 * 2) 이후 슬롯: 아직 안 쓴 POV 중 키워드 매칭(score ≥ 1) 최고점 → 없으면 안 쓴 POV 점수순 → 그래도 없으면 점수순 차선.
 *    (지터 최대 0.096 < 1 임계값으로 무관한 방향이 '다양성' 명목으로 끼어들지 않게)
 */
function pickDiverseStyles(
  ranked: Array<{ st: StyleDirection; score: number }>,
  count: number,
): StyleDirection[] {
  const chosen: StyleDirection[] = [];
  const usedPovs = new Set<string>();
  const take = (pred: (r: { st: StyleDirection; score: number }) => boolean): boolean => {
    const found = ranked.find((r) => !chosen.some((c) => c.id === r.st.id) && pred(r));
    if (found) {
      chosen.push(found.st);
      usedPovs.add(povForStyle(found.st.id));
    }
    return Boolean(found);
  };

  take(() => true); // 슬롯 1: 최고점
  while (chosen.length < count) {
    if (take((r) => !usedPovs.has(povForStyle(r.st.id)) && r.score >= 1)) continue; // 다른 POV + 매칭
    if (take((r) => !usedPovs.has(povForStyle(r.st.id)))) continue; // 다른 POV (점수 무관)
    if (!take(() => true)) break; // POV 소진 → 점수순 차선 (후보 소진 시 종료)
  }
  return chosen;
}

/** 설문 텍스트만으로 랜딩 패턴을 고른다 (섹션 구성이 비어 있을 때 폴백). */
function matchPatternByText(text: string): LandingPattern {
  let best = LANDING_PATTERNS[0];
  let bestScore = -Infinity;
  for (const p of LANDING_PATTERNS) {
    const s = keywordScore(text, p.keywords);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best;
}

function briefLabel(style: StyleDirection, palette: CuratedPalette): string {
  return `${style.name} · ${palette.name}`;
}

function briefDescription(
  survey: SurveyInput,
  style: StyleDirection,
  palette: CuratedPalette,
  fonts: FontPairing,
): string {
  const tone = toneText(survey.tone).trim();
  const lead = tone
    ? `The '${tone}' request informed the ${style.name} direction.`
    : `This proposal uses the ${style.name} direction.`;
  return `${lead} It pairs the ${palette.name} palette with ${fonts.name} typography.`;
}

// ---------- 3. 공개 API ----------

/**
 * 설문 → 서로 확실히 다른 디자인 브리프 count개 (기본 3안). 결정적 — 같은 설문이면 같은 결과.
 * 보장 규칙(count ≥ 3 기준): ① 안끼리 POV(무드)가 겹치지 않게(차별화 축) — 렌더 스타일은 imageStyle로 고정됨
 * ② 3안이 전부 다크이거나 전부 라이트가 되지 않게 마지막 안의 팔레트를 반대 무드로 교체
 * ③ 팔레트·폰트는 안끼리 중복되지 않음.
 */
export function selectDesignBriefs(survey: SurveyInput, count = 3): DesignBrief[] {
  const n = Math.max(1, Math.min(count, STYLE_DIRECTIONS.length));
  const text = surveyToText(survey);
  const seed = [
    survey.businessName,
    survey.industry,
    toneText(survey.tone),
    survey.purpose,
    survey.colorPreference,
  ].join('|');

  // [F3 #7] 고객이 무드보드에서 고른 레퍼런스 샘플의 스타일에 가중치 → 후보 방향에 실제 반영
  //  (우선순위: imageStyle 고정[design-candidates 오버라이드] > 샘플 가중 > POV 비중복[pickDiverseStyles])
  const weightStyleIds = new Set(survey.referenceStyleIds ?? []);
  const styles = pickDiverseStyles(rankStyles(text, seed, weightStyleIds), n);
  // [v3] 신규 섹션 타입은 랜딩 패턴 데이터에 없으므로, findPattern 전에 유사 타입으로 축약한다.
  const planTypes = survey.sectionPlan.map((i) => collapseForPattern(i.type));
  const pattern =
    planTypes.length > 0 ? findPattern(planTypes) : matchPatternByText(text);

  // 안별 팔레트·폰트 선택 (중복 금지)
  const usedPalettes = new Set<string>();
  const usedFonts = new Set<string>();
  const picks = styles.map((style) => {
    const palette =
      rankPalettes(text, style, seed).find((r) => !usedPalettes.has(r.p.id))?.p ??
      CURATED_PALETTES[0];
    usedPalettes.add(palette.id);
    const fonts =
      rankFonts(text, style, seed).find((r) => !usedFonts.has(r.f.id))?.f ?? LEGACY_FONT_PAIRINGS[0];
    usedFonts.add(fonts.id);
    return { style, palette, fonts };
  });

  // 다크/라이트 다양성 보장: 전부 같은 무드면 마지막 안의 팔레트를 반대 무드 최고점으로 교체
  if (picks.length >= 2) {
    const darkCount = picks.filter((p) => p.palette.dark).length;
    if (darkCount === 0 || darkCount === picks.length) {
      const wantDark = darkCount === 0;
      const last = picks[picks.length - 1];
      const replacement = rankPalettes(text, last.style, seed).find(
        (r) => r.p.dark === wantDark && !usedPalettes.has(r.p.id),
      );
      if (replacement) {
        usedPalettes.delete(last.palette.id);
        last.palette = replacement.p;
        usedPalettes.add(replacement.p.id);
      }
    }
  }

  return picks.map(({ style, palette, fonts }) => ({
    style,
    palette,
    fonts,
    pattern,
    label: briefLabel(style, palette),
    description: briefDescription(survey, style, palette, fonts),
  }));
}

/** 스타일별 기본 radius(px) — 스타일 방향의 물성을 반영 */
const RADIUS_BY_STYLE: Record<string, number> = {
  'dark-luxury': 6,
  'minimal-swiss': 4,
  'editorial-magazine': 0,
  'soft-clay-3d': 20,
  'premium-3d-product': 10,
  'organic-natural': 16,
  'warm-cozy': 12,
  'retro-analog': 6,
  'glass-modern': 14,
  'bold-energy': 4,
  'botanical-illust': 12,
  'flat-friendly-illust': 12,
  'heritage-korean': 2,
};

/** 브리프 → 계약 SiteTheme (customCss 는 생략 — AI 후처리 단계에서 선택적으로 추가) */
export function buildThemeFromBrief(brief: DesignBrief): SiteTheme {
  return {
    fonts: {
      heading: brief.fonts.heading,
      body: brief.fonts.body,
      googleFonts: [...brief.fonts.googleFonts],
    },
    palette: { ...brief.palette.palette },
    radius: RADIUS_BY_STYLE[brief.style.id] ?? 8,
  };
}

/**
 * [v3] 랜딩 패턴 데이터에 없는 신규 섹션 타입을 유사 타입으로 축약한다 (LANDING_PATTERNS 데이터는 무수정).
 * team→about, cases→gallery, faq→features. 나머지는 그대로.
 */
export function collapseForPattern(type: SectionType): SectionType {
  if (type === 'team') return 'about';
  if (type === 'cases') return 'gallery';
  if (type === 'faq') return 'features';
  return type;
}

/** 설문의 섹션 구성과 가장 가까운 랜딩 패턴 (공유 섹션 가중 − 양쪽 잉여 감점, 동점이면 앞선 패턴) */
export function findPattern(sections: SectionType[]): LandingPattern {
  if (!sections || sections.length === 0) return LANDING_PATTERNS[0];
  const input = new Set<SectionType>(sections);
  let best = LANDING_PATTERNS[0];
  let bestScore = -Infinity;
  for (const p of LANDING_PATTERNS) {
    const pat = new Set<SectionType>(p.sections);
    let shared = 0;
    for (const s of pat) if (input.has(s)) shared += 1;
    const score = shared * 2 - (pat.size - shared) - (input.size - shared);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/**
 * [§7] 업종 텍스트 → 추천 섹션 (랜딩 패턴 keywords 매칭).
 * 설문 UI에서 업종 입력 시 추천 섹션을 하이라이트하는 데 사용 (클라이언트 번들 가능).
 * 매칭이 없으면 첫 패턴(기본형) 섹션을 반환.
 */
export function recommendSections(industry: string, purpose = ''): SectionType[] {
  const q = `${industry ?? ''} ${purpose ?? ''}`.toLowerCase();
  if (!q.trim()) return LANDING_PATTERNS[0].sections;
  let best = LANDING_PATTERNS[0];
  let bestScore = 0;
  for (const p of LANDING_PATTERNS) {
    let score = 0;
    for (const kw of p.keywords) {
      if (kw && q.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best.sections;
}

// ---------- 4. 데이터 무결성 검증 ----------

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BANNED_HEADING_FONTS = ['inter', 'roboto', 'arial', 'helvetica', 'open sans', 'system-ui'];

/** 큐레이션 데이터의 계약 위반을 찾아 문제 목록을 돌려준다 (없으면 빈 배열). */
export function validateDesignKnowledge(): string[] {
  const problems: string[] = [];

  for (const p of CURATED_PALETTES) {
    for (const [key, value] of Object.entries(p.palette)) {
      if (!HEX_RE.test(value)) problems.push(`Palette ${p.id}.${key}: invalid hex "${value}"`);
    }
  }

  for (const f of FONT_PAIRINGS) {
    if (f.googleFonts.some((g) => g.trim().toLowerCase() === 'pretendard')) {
      problems.push(`Font ${f.id}: Pretendard must not be listed in googleFonts because the renderer loads it separately`);
    }
    const headFirst = f.heading.toLowerCase().split(',')[0];
    if (BANNED_HEADING_FONTS.some((b) => headFirst.includes(b))) {
      problems.push(`Font ${f.id}: an overused font is first in the heading stack (${f.heading})`);
    }
  }

  if (!STYLE_DIRECTIONS.some((s) => s.candidateStyle === '3d_render')) {
    problems.push("Style directions require at least one '3d_render' option");
  }
  if (!CURATED_PALETTES.some((p) => p.dark) || !CURATED_PALETTES.some((p) => !p.dark)) {
    problems.push('Palette diversity requires both dark and light options');
  }

  return problems;
}

// 개발 모드에서 데이터 오류를 즉시 드러낸다 (프로덕션 번들에서는 비용 0에 가깝게 건너뜀)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const problems = validateDesignKnowledge();
  if (problems.length > 0) {
    throw new Error(`design-knowledge data error:\n${problems.join('\n')}`);
  }
}
