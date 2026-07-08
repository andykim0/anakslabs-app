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
  STYLE_DIRECTIONS,
  LANDING_PATTERNS,
  type CuratedPalette,
  type FontPairing,
  type StyleDirection,
  type LandingPattern,
} from './design-knowledge-data';

// 데이터·타입 재노출 — 소비자는 이 모듈 하나만 import 하면 된다.
export {
  CURATED_PALETTES,
  FONT_PAIRINGS,
  STYLE_DIRECTIONS,
  LANDING_PATTERNS,
  type CuratedPalette,
  type FontPairing,
  type StyleDirection,
  type LandingPattern,
};

// ---------- 1. 디자인 원칙 프롬프트 (frontend-design 의 정신을 우리말로 재서술) ----------

export const DESIGN_PRINCIPLES_PROMPT = `당신은 작은 디자인 스튜디오의 리드 디자이너다. 이 클라이언트는 이미 "템플릿 같다"는 이유로 시안을 여러 번 반려했고, 남들과 절대 헷갈리지 않는 시각 정체성에 돈을 낸다. 아래 원칙을 지켜 "이 브리프에서만" 나올 수 있는 디자인을 만들어라.

1. 뚜렷한 관점 — 업종 평균이 아니라 이 가게의 세계(재료, 도구, 공간, 말투)에서 출발한다. "어느 가게에 갖다 놔도 어울리는" 선택은 전부 실패다. 히어로는 페이지의 주장 하나를 담는다: 이 가게에서 가장 그 가게다운 것 하나를 첫 화면에 세워라.

2. 타이포그래피 금지 목록 — Inter, Roboto, Arial, Helvetica, system-ui, Open Sans, 그리고 Noto Sans 단독 사용 같은 과사용 폰트를 히어로·헤딩에 쓰지 않는다. 개성 있는 디스플레이 서체와 본문 서체를 의도적으로 페어링하고, 타입 스케일·굵기·자간까지 정해 타입 자체가 기억에 남게 한다. 한글 렌더링을 위한 폴백 체인은 필수다.

3. 절제된 팔레트 — 배경·표면·본문·보조·주조·강조 5~6색 이내. 무지개식 나열 금지. 모든 색은 이름 붙여 설명할 수 있는 선택이어야 한다.

4. 위계는 크기 대비로 — 크게 갈 것은 확실히 크게, 나머지는 조용히. 굵기·색·장식을 늘리는 대신 크기와 여백으로 읽는 순서를 만든다. 구조 장치(번호, 라벨, 구분선)는 내용이 실제로 그 구조일 때만 쓴다.

5. 카피는 절제 — 형용사 나열("최고급 프리미엄 감성 인테리어") 금지. "여섯 가지 요리, 하나의 불"처럼 구체적 사실 하나로 말한다. 능동태, 짧은 문장. 과장·이모지·느낌표 금지. 버튼은 눌렀을 때 일어나는 일을 그대로 적는다("예약하기", "메뉴 보기").

6. 미적 리스크 하나 — 기억에 남을 시그니처 요소를 딱 하나 정하고, 그 주변은 철저히 규율한다. 대담함은 한 곳에만 쓴다. 집을 나서기 전 거울을 보고 액세서리 하나를 빼라.

경계할 기본값 셋: (a) 크림 배경 + 대비 강한 세리프 + 테라코타 포인트, (b) 검정 배경 + 형광 초록/주홍 포인트 하나, (c) 헤어라인 괘선의 신문식 밀집 레이아웃. 셋 다 브리프가 명시적으로 요구할 때만 쓴다 — 브리프의 언어가 항상 이긴다.`;

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
    survey.tone,
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

function rankStyles(text: string, seed: string): Array<{ st: StyleDirection; score: number }> {
  return STYLE_DIRECTIONS.map((st) => ({
    st,
    score:
      keywordScore(text, st.keywords) * 3 +
      keywordScore(text, st.bestFor) * 2 -
      keywordScore(text, st.avoid) * 4 +
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
  return FONT_PAIRINGS.map((f) => ({
    f,
    score:
      overlapCount(style.fontMood, f.mood) * 3 +
      keywordScore(text, f.mood) * 2 +
      keywordScore(text, f.bestFor) * 2 +
      jitter(seed, `${style.id}:${f.id}`),
  })).sort((a, b) => b.score - a.score);
}

/**
 * 다양성 보장 스타일 선택:
 * 1) 최고점 1개
 * 2) 첫 안과 candidateStyle 이 다르면서 실제 키워드 매칭이 있는(score ≥ 1) 것 중 최고점.
 *    임계값이 없으면 브리프와 무관한 방향이 '다양성' 명목으로 끼어든다 (지터 최대 0.096 < 1).
 *    없으면 점수순 차선.
 * 3) 이후 슬롯: 아직 3d_render 가 없으면 3d_render 최고점을 강제, 그다음은 점수순
 */
function pickDiverseStyles(
  ranked: Array<{ st: StyleDirection; score: number }>,
  count: number,
): StyleDirection[] {
  const chosen: StyleDirection[] = [];
  const take = (pred: (r: { st: StyleDirection; score: number }) => boolean): boolean => {
    const found = ranked.find((r) => !chosen.some((c) => c.id === r.st.id) && pred(r));
    if (found) chosen.push(found.st);
    return Boolean(found);
  };

  take(() => true);
  if (chosen.length < count && chosen.length > 0) {
    if (!take((r) => r.st.candidateStyle !== chosen[0].candidateStyle && r.score >= 1)) {
      take(() => true);
    }
  }
  while (chosen.length < count) {
    const need3d = !chosen.some((c) => c.candidateStyle === '3d_render');
    if (need3d && take((r) => r.st.candidateStyle === '3d_render')) continue;
    if (!take(() => true)) break; // 후보 소진
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
  const tone = survey.tone?.trim();
  const lead = tone
    ? `'${tone}' 요청을 ${style.name} 방향으로 풀었습니다.`
    : `${style.name} 방향의 제안입니다.`;
  return `${lead} ${palette.name} 팔레트에 ${fonts.name} 타이포그래피를 조합했습니다.`;
}

// ---------- 3. 공개 API ----------

/**
 * 설문 → 서로 확실히 다른 디자인 브리프 count개 (기본 3안). 결정적 — 같은 설문이면 같은 결과.
 * 보장 규칙(count ≥ 3 기준): ① 최소 1안은 candidateStyle '3d_render'
 * ② 3안이 전부 다크이거나 전부 라이트가 되지 않게 마지막 안의 팔레트를 반대 무드로 교체
 * ③ 스타일·팔레트·폰트는 안끼리 중복되지 않음.
 */
export function selectDesignBriefs(survey: SurveyInput, count = 3): DesignBrief[] {
  const n = Math.max(1, Math.min(count, STYLE_DIRECTIONS.length));
  const text = surveyToText(survey);
  const seed = [
    survey.businessName,
    survey.industry,
    survey.tone,
    survey.purpose,
    survey.colorPreference,
  ].join('|');

  const styles = pickDiverseStyles(rankStyles(text, seed), n);
  const pattern =
    survey.sections && survey.sections.length > 0
      ? findPattern(survey.sections)
      : matchPatternByText(text);

  // 안별 팔레트·폰트 선택 (중복 금지)
  const usedPalettes = new Set<string>();
  const usedFonts = new Set<string>();
  const picks = styles.map((style) => {
    const palette =
      rankPalettes(text, style, seed).find((r) => !usedPalettes.has(r.p.id))?.p ??
      CURATED_PALETTES[0];
    usedPalettes.add(palette.id);
    const fonts =
      rankFonts(text, style, seed).find((r) => !usedFonts.has(r.f.id))?.f ?? FONT_PAIRINGS[0];
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
      if (!HEX_RE.test(value)) problems.push(`팔레트 ${p.id}.${key}: 잘못된 hex "${value}"`);
    }
  }

  for (const f of FONT_PAIRINGS) {
    if (f.googleFonts.some((g) => g.trim().toLowerCase() === 'pretendard')) {
      problems.push(`폰트 ${f.id}: Pretendard 는 googleFonts 에 넣지 않는다 (렌더러가 CDN 자동 로드)`);
    }
    const headFirst = f.heading.toLowerCase().split(',')[0];
    if (BANNED_HEADING_FONTS.some((b) => headFirst.includes(b))) {
      problems.push(`폰트 ${f.id}: 과사용 폰트가 헤딩 첫 순위에 있음 (${f.heading})`);
    }
  }

  if (!STYLE_DIRECTIONS.some((s) => s.candidateStyle === '3d_render')) {
    problems.push("스타일 방향에 '3d_render' 가 최소 1개 필요");
  }
  if (!CURATED_PALETTES.some((p) => p.dark) || !CURATED_PALETTES.some((p) => !p.dark)) {
    problems.push('팔레트에 다크/라이트가 모두 있어야 다양성 보장이 동작한다');
  }

  return problems;
}

// 개발 모드에서 데이터 오류를 즉시 드러낸다 (프로덕션 번들에서는 비용 0에 가깝게 건너뜀)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const problems = validateDesignKnowledge();
  if (problems.length > 0) {
    throw new Error(`design-knowledge 데이터 오류:\n${problems.join('\n')}`);
  }
}
