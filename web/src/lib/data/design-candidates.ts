/**
 * 설문 → 디자인 후보 3안 블루프린트 (1차 가공의 결정적 절반).
 *
 * design-knowledge(디자인 지식 큐레이션)의 selectDesignBriefs 로 3안을 뽑는다:
 *  - 다양성 보장: 최소 1안 3d_render, 다크/라이트 혼합, 스타일·팔레트·폰트 안끼리 중복 없음
 *  - 결정적: 같은 설문 = 같은 3안 (Math.random 없음) — mock/supabase 양쪽 공유
 *
 * 소비처별 사용:
 *  - mock AiService: mockHeroUrl(정적 SVG)을 그대로 heroImageUrl 로 사용
 *  - supabase AiService: heroImagePrompt(또는 Claude가 다듬은 프롬프트)로 Gemini 히어로 생성
 */
import type { CandidateStyle, DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SectionType, SiteTheme } from '@/lib/types/site';
import {
  selectDesignBriefs,
  buildThemeFromBrief,
  type DesignBrief,
} from '@/lib/ai/design-knowledge';

export interface CandidateBlueprint {
  id: string;
  label: string;
  style: CandidateStyle;
  description: string;
  theme: SiteTheme;
  /** 실모드: Gemini 히어로 이미지 생성 프롬프트 (결정적 기본값 — Claude가 다듬을 수 있음) */
  heroImagePrompt: string;
  /** mock 모드: 정적 히어로 프리뷰 자산 (실모드에서는 생성 실패 시 폴백) */
  mockHeroUrl: string;
  /** 히어로 이미지 프롬프트에 붙이는 영어 스타일 조각 (brief.style.heroImageFragment) */
  heroImageFragment: string;
  /** 섹션 보조 이미지 프롬프트에 붙이는 영어 스타일 조각 */
  sectionImageFragment: string;
  /** 이 안을 만든 디자인 브리프 원본 (스타일·팔레트·폰트·랜딩 패턴) */
  brief: DesignBrief;
}

// ---------- 설문 전처리 ----------

/**
 * colorPreference 에 hex 가 들어오면 색 이름 어휘로 변환해 덧붙인다.
 * design-knowledge 의 팔레트 매칭은 키워드 부분일치라 hex 원문으로는 매칭이 안 되기 때문.
 * 결정적 — 같은 hex 는 항상 같은 어휘.
 */
export function hexColorWords(colorPreference: string): string {
  const m = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.exec(colorPreference);
  if (!m) return '';
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }

  // 어휘는 CURATED_PALETTES.mood 의 색 이름과 겹치도록 선택
  if (s < 0.12) return l < 0.22 ? '블랙 다크' : l > 0.85 ? '화이트 미니멀' : '그레이 모노크롬';
  if (h < 15 || h >= 345) return l < 0.35 ? '버건디 레드' : '레드';
  if (h < 32) return l < 0.45 ? '브라운 테라코타' : '오렌지 테라코타';
  if (h < 65) return l < 0.65 ? '골드 앰버' : '옐로 골드';
  if (h < 150) return l < 0.3 ? '다크 그린' : '그린';
  if (h < 200) return '틸 민트';
  if (h < 250) return l < 0.35 ? '네이비 블루' : '블루 스카이';
  if (h < 290) return '퍼플 라벤더';
  return '핑크 로맨틱';
}

/**
 * 온보딩 설문 UI 의 기본 섹션 구성과 동일한지 검사.
 * (components/dashboard/onboarding/survey-step.tsx 의 DEFAULT_SECTIONS 와 정합 유지)
 * 비어 있거나 기본값 그대로면 사용자가 섹션을 고르지 않은 것으로 보고 랜딩 패턴으로 보강한다.
 */
const DEFAULT_SURVEY_SECTIONS: SectionType[] = ['hero', 'about', 'menu', 'gallery', 'contact'];

export function isDefaultSectionSelection(sections: SectionType[] | undefined): boolean {
  if (!sections || sections.length === 0) return true;
  if (sections.length !== DEFAULT_SURVEY_SECTIONS.length) return false;
  return DEFAULT_SURVEY_SECTIONS.every((s, i) => sections[i] === s);
}

/** 브리프 선택용 설문 전처리 — hex→색이름 보강 + 기본 섹션이면 텍스트 기반 패턴 폴백 유도 */
function surveyForBriefs(survey: SurveyInput): SurveyInput {
  const colorWords = hexColorWords(survey.colorPreference);
  return {
    ...survey,
    colorPreference: colorWords
      ? `${survey.colorPreference} ${colorWords}`
      : survey.colorPreference,
    // sections 를 비우면 selectDesignBriefs 가 설문 텍스트 키워드로 패턴을 고른다
    sections: isDefaultSectionSelection(survey.sections) ? [] : survey.sections,
  };
}

// ---------- 블루프린트 빌더 ----------

/** 스타일·팔레트에 맞는 mock 히어로 프리뷰 자산 (public/mock) */
function mockHeroFor(brief: DesignBrief): string {
  if (brief.style.candidateStyle === '3d_render') return '/mock/candidate-3d.svg';
  return brief.palette.dark ? '/mock/candidate-dark.svg' : '/mock/candidate-light.svg';
}

/** 결정적 히어로 이미지 프롬프트 — 업종 맥락 + 스타일 조각 + 팔레트 힌트 */
function buildHeroPrompt(survey: SurveyInput, brief: DesignBrief): string {
  const palette = brief.palette.palette;
  return (
    `Website hero image for a Korean small business. ` +
    `Business: ${survey.businessName} (${survey.industry}). Purpose: ${survey.purpose}. ` +
    `Style: ${brief.style.heroImageFragment}. ` +
    `Color mood: background near ${palette.background}, key accent ${palette.primary}. ` +
    `Generous negative space for a headline, no text, no words, no logos, no watermark. 16:10.`
  );
}

export function buildCandidateBlueprints(survey: SurveyInput): CandidateBlueprint[] {
  const briefs = selectDesignBriefs(surveyForBriefs(survey));
  return briefs.map((brief) => ({
    id: `cand-${brief.style.id}`,
    label: brief.label,
    style: brief.style.candidateStyle,
    description: brief.description,
    theme: buildThemeFromBrief(brief),
    heroImagePrompt: buildHeroPrompt(survey, brief),
    mockHeroUrl: mockHeroFor(brief),
    heroImageFragment: brief.style.heroImageFragment,
    sectionImageFragment: brief.style.sectionImageFragment,
    brief,
  }));
}

// ---------- 후보 → 블루프린트 역참조 (2차 단계에서 재사용) ----------

/**
 * 이미 발급된 후보(선택 단계에서 클라이언트가 돌려준 DesignCandidate)에 해당하는
 * 블루프린트를 설문으로 재도출한다. buildCandidateBlueprints 는 결정적이므로
 * 같은 설문이면 같은 3안이 나온다 — id 일치 우선, 없으면 style 일치, 최후엔 첫 안.
 */
export function matchBlueprintForCandidate(
  survey: SurveyInput,
  candidate: Pick<DesignCandidate, 'id' | 'style'>,
): CandidateBlueprint {
  const blueprints = buildCandidateBlueprints(survey);
  return (
    blueprints.find((bp) => bp.id === candidate.id) ??
    blueprints.find((bp) => bp.style === candidate.style) ??
    blueprints[0]
  );
}

/**
 * SiteConfig 생성에 쓸 섹션 계획.
 * 설문 섹션이 비어 있거나 온보딩 기본값 그대로면 브리프의 랜딩 패턴으로 보강하고,
 * 사용자가 직접 고른 구성이면 그대로 존중한다.
 */
export function resolveSectionPlan(
  survey: SurveyInput,
  blueprint: CandidateBlueprint,
): SectionType[] {
  return isDefaultSectionSelection(survey.sections)
    ? [...blueprint.brief.pattern.sections]
    : survey.sections;
}
