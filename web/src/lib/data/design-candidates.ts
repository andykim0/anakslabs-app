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
import type {
  CandidateStyle,
  DesignCandidate,
  SectionPlanItem,
  SurveyInput,
} from '@/lib/types/domain';
import type { SiteTheme } from '@/lib/types/site';
import type { ImageDirectionId } from '@/lib/assets/image-directions';
import { imageDirectionToLegacyCandidateStyle } from '@/lib/assets/image-directions';
import {
  selectDesignBriefs,
  buildThemeFromBrief,
  type DesignBrief,
} from '@/lib/ai/design-knowledge';
import {
  buildImagePrompt,
  buildV2ImagePrompt,
  derivePalette,
  povForStyle,
} from '@/lib/design/quality-standards';
import { resolveImageStyle } from '@/lib/onboarding/image-style';
import {
  designDnaById,
  dnaPipelineEnabled,
  expandTokens,
  selectDesignDnaCandidates,
  tokenSetToSiteTheme,
  type DesignDnaSelection,
  type DnaSelectionToolInvoker,
} from '@/lib/design/dna';
import { SITE_TEMPLATES, planFromTemplate } from './site-blueprints';
import {
  layoutVariantsEnabled,
  selectHeroLayouts,
  selectSectionLayouts,
  sectionLayoutAvailabilityForSurvey,
  type HeroLayoutSelectionToolInvoker,
  type HeroLayoutVariantId,
  type SectionLayoutSelection,
  type SectionLayoutSelectionToolInvoker,
} from '@/lib/layout';
import { fontPairingsEnabled } from '@/lib/fonts/flags';
import {
  applyKoreanFontPairing,
  fontIndustryClassForSurvey,
  resolveKoreanFontPairingId,
} from '@/lib/fonts/selection';
import {
  namedTemplatesForSurvey,
  resolveNamedTemplate,
  templateGalleryEnabled,
  type NamedTemplateSelection,
} from '@/lib/design/templates';
import type { ActiveMotionSignatureId } from '@/lib/types/site';

export interface CandidateBlueprint {
  id: string;
  label: string;
  style: CandidateStyle;
  /** v2 art direction. Undefined means the unmodified legacy generation path. */
  imageDirectionId?: ImageDirectionId;
  description: string;
  theme: SiteTheme;
  /** 실모드: Gemini 히어로 이미지 생성 프롬프트 (tone ambient 레지스트리에서 결정) */
  heroImagePrompt: string;
  /** mock 모드: 정적 히어로 프리뷰 자산 (실모드에서는 생성 실패 시 폴백) */
  mockHeroUrl: string;
  /** 히어로 이미지 프롬프트에 붙이는 영어 스타일 조각 (brief.style.heroImageFragment) */
  heroImageFragment: string;
  /** 섹션 보조 이미지 프롬프트에 붙이는 영어 스타일 조각 */
  sectionImageFragment: string;
  /** 이 안을 만든 디자인 브리프 원본 (스타일·팔레트·폰트·랜딩 패턴) */
  brief: DesignBrief;
  /** DNA rollout ON에서만 존재하는 enum-only 선택 핀. */
  designDna?: DesignDnaSelection;
  /** LIB rollout ON에서만 존재하는 enum-only 배열 핀. */
  heroLayoutVariantId?: HeroLayoutVariantId;
  /** LIB2 rollout ON에서만 존재하는 enum-only 섹션 배열 핀. */
  sectionLayoutVariantIds?: SectionLayoutSelection;
  /** TPL rollout ON에서만 존재하는 손 큐레이션 카탈로그 핀. */
  namedTemplate?: NamedTemplateSelection;
  /** 다음 모션 단계의 결정적 초기값. */
  recommendedMotionSignatureId?: ActiveMotionSignatureId;
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
 * [v3] 섹션 계획이 templateId 원본에서 손대지 않은 상태인지 검사.
 * templateId 로 SITE_TEMPLATES 를 찾아 planFromTemplate 과 비교해,
 * source 가 전부 'template' 이고 (type, name, variant, 순서)가 원본과 동일하면 true.
 * true(미수정)일 때만 브리프의 랜딩 패턴으로 보강한다 (사용자가 직접 고른 구성은 존중).
 * 비어 있으면 true(텍스트 기반 패턴 폴백), templateId 를 못 찾으면 false(계획 존중).
 */
export function isTemplateUntouched(plan: SectionPlanItem[], templateId: string): boolean {
  if (!plan || plan.length === 0) return true;
  const tpl = SITE_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return false;
  const original = planFromTemplate(tpl);
  if (plan.length !== original.length) return false;
  return plan.every((item, i) => {
    const o = original[i];
    return (
      item.source === 'template' &&
      o.type === item.type &&
      o.name === item.name &&
      (o.variant ?? undefined) === (item.variant ?? undefined)
    );
  });
}

/** 브리프 선택용 설문 전처리 — hex→색이름 보강 + 템플릿 미수정이면 텍스트 기반 패턴 폴백 유도 */
function surveyForBriefs(survey: SurveyInput): SurveyInput {
  const colorWords = hexColorWords(survey.colorPreference);
  return {
    ...survey,
    colorPreference: colorWords
      ? `${survey.colorPreference} ${colorWords}`
      : survey.colorPreference,
    // sectionPlan 을 비우면 selectDesignBriefs 가 설문 텍스트 키워드로 패턴을 고른다
    sectionPlan: isTemplateUntouched(survey.sectionPlan, survey.templateId)
      ? []
      : survey.sectionPlan,
  };
}

// ---------- 블루프린트 빌더 ----------

/** 스타일·팔레트에 맞는 mock 히어로 프리뷰 자산 (public/mock) */
function mockHeroFor(brief: DesignBrief): string {
  if (brief.style.candidateStyle === '3d_render') return '/mock/candidate-3d.svg';
  return brief.palette.dark ? '/mock/candidate-dark.svg' : '/mock/candidate-light.svg';
}

/** colorPreference/secondaryColor에서 #rrggbb 추출(3자리 축약 확장). 없으면 null */
function extractHex(s: string | undefined | null): string | null {
  if (!s) return null;
  const m = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.exec(s);
  if (!m) return null;
  const hex = m[1].toLowerCase();
  return `#${hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex}`;
}

/**
 * [F3 #6] 브리프 팔레트 → 테마. 고객이 구체 메인 hex(+보조)를 주면 파생 팔레트를 주입한다
 * (색은 고객이 '고르고' 시스템이 규칙[AA·5색 절제]에 맞게 6토큰을 파생 — LLM 색 생성 아님).
 * 다크/라이트 무드는 브리프를 따라 3안 혼합을 유지. hex가 없으면 큐레이션 팔레트 그대로.
 */
function themeForBrief(survey: SurveyInput, brief: DesignBrief): SiteTheme {
  const base = buildThemeFromBrief(brief);
  const primary = extractHex(survey.colorPreference);
  if (!primary) return base;
  const secondary = extractHex(survey.secondaryColor) ?? undefined;
  return { ...base, palette: derivePalette(primary, secondary, { dark: brief.palette.dark }) };
}

/**
 * 결정적 히어로 이미지 프롬프트 — 중앙 buildImagePrompt만 사용한다.
 * brief.style.heroImageFragment는 기존 계약/표시용으로 보존하지만, 제품 클로즈업 같은 자유 피사체를
 * 되살릴 수 있으므로 생성 프롬프트에는 합치지 않는다.
 */
function buildHeroPrompt(survey: SurveyInput, brief: DesignBrief, theme: SiteTheme): string {
  if (survey.imageDirectionId) {
    // real_photo is a reuse-only plan. No image-generation prompt exists by design.
    if (survey.imageDirectionId === 'real_photo' || survey.imageDirectionId === 'realistic') return '';
    return buildV2ImagePrompt(povForStyle(brief.style.id), 'hero', {
      imageDirectionId: survey.imageDirectionId,
      palettePrimary: theme.palette.primary,
      background: theme.palette.background,
      tone: survey.tone,
    });
  }
  return buildImagePrompt(povForStyle(brief.style.id), survey.industry, 'hero', {
    candidateStyle: brief.style.candidateStyle,
    palettePrimary: theme.palette.primary,
    background: theme.palette.background,
    tone: survey.tone,
    purposeId: survey.purposeId,
  });
}

/** TokenSet → SiteTheme runtime projection stays centralized at this one adapter seam. */
function themeForDnaSelection(selection: DesignDnaSelection): SiteTheme {
  return tokenSetToSiteTheme(
    expandTokens(selection.dnaId, selection.hueSeed, selection.overrides),
  );
}

export function buildCandidateBlueprints(
  survey: SurveyInput,
  dnaSelections: readonly DesignDnaSelection[] = [],
): CandidateBlueprint[] {
  // [온보딩] 이미지 스타일은 고객 선택 축 — 3안 전부 이 스타일로 고정하고 차별화는 POV(무드)로만.
  // 미설정 시 업종 기본값 폴백(기존 데이터 호환). 렌더 스타일은 candidateStyle이 결정(buildImagePrompt·mock).
  const imageStyle = survey.imageDirectionId
    ? imageDirectionToLegacyCandidateStyle(survey.imageDirectionId)
    : resolveImageStyle({ imageStyle: survey.imageStyle, industry: survey.industry });
  const briefs = selectDesignBriefs(surveyForBriefs(survey));
  return briefs.map((brief, index) => {
    // 공유 StyleDirection을 변형하지 않도록 candidateStyle만 imageStyle로 덮은 복사본을 만든다.
    const styled: DesignBrief = { ...brief, style: { ...brief.style, candidateStyle: imageStyle } };
    const designDna = dnaSelections[index];
    const dna = designDna ? designDnaById(designDna.dnaId) : undefined;
    const theme = designDna
      ? themeForDnaSelection(designDna)
      : themeForBrief(survey, brief);
    return {
      id: `cand-${brief.style.id}`, // POV/매칭용 style.id 유지
      label: dna?.description.split(' — ')[0] ?? brief.label,
      style: imageStyle, // 후보 표시 스타일 = 고정 imageStyle
      ...(survey.imageDirectionId ? { imageDirectionId: survey.imageDirectionId } : {}),
      description: dna?.description ?? brief.description,
      theme,
      heroImagePrompt: buildHeroPrompt(survey, styled, theme),
      mockHeroUrl: mockHeroFor(styled),
      heroImageFragment: brief.style.heroImageFragment,
      sectionImageFragment: brief.style.sectionImageFragment,
      brief: styled,
      ...(designDna
        ? { designDna: { ...designDna, overrides: { ...designDna.overrides } } }
        : {}),
    };
  });
}

/**
 * Feature-gated async entry point used by both real and mock AI services.
 * OFF is the byte-for-byte legacy builder; ON selects only catalog ids and then
 * feeds the same blueprint/image pipeline. Token projection is added in E2.
 */
export async function buildCandidateBlueprintsForPipeline(
  survey: SurveyInput,
  options: {
    enabled?: boolean;
    invoke?: DnaSelectionToolInvoker;
    layoutEnabled?: boolean;
    layoutInvoke?: HeroLayoutSelectionToolInvoker;
    sectionLayoutInvoke?: SectionLayoutSelectionToolInvoker;
    fontPairingEnabled?: boolean;
    templateGalleryEnabled?: boolean;
  } = {},
): Promise<CandidateBlueprint[]> {
  const useNamedTemplates = options.templateGalleryEnabled ?? templateGalleryEnabled();
  if (useNamedTemplates) {
    const legacyBriefs = selectDesignBriefs(surveyForBriefs(survey));
    return namedTemplatesForSurvey(survey).flatMap((template, index) => {
      const resolved = resolveNamedTemplate(template, survey);
      if (!resolved) return [];
      const brief = legacyBriefs[index % legacyBriefs.length];
      const imageStyle = imageDirectionToLegacyCandidateStyle(template.recipe.imageDirectionId);
      const styled: DesignBrief = {
        ...brief,
        style: { ...brief.style, candidateStyle: imageStyle },
      };
      let theme = themeForDnaSelection(resolved.designDna);
      const useFontPairings = options.fontPairingEnabled ?? fontPairingsEnabled();
      if (useFontPairings) {
        theme = applyKoreanFontPairing(
          theme,
          resolveKoreanFontPairingId({
            dnaId: resolved.designDna.dnaId,
            industryClass: fontIndustryClassForSurvey(survey),
          }),
        );
      }
      return [{
        id: `tpl-${template.id}`,
        label: template.name,
        style: imageStyle,
        imageDirectionId: template.recipe.imageDirectionId,
        description: template.description,
        theme,
        heroImagePrompt: buildHeroPrompt(survey, styled, theme),
        mockHeroUrl: mockHeroFor(styled),
        heroImageFragment: brief.style.heroImageFragment,
        sectionImageFragment: brief.style.sectionImageFragment,
        brief: styled,
        designDna: resolved.designDna,
        heroLayoutVariantId: resolved.heroLayoutVariantId,
        ...(Object.keys(resolved.sectionLayoutVariantIds).length
          ? { sectionLayoutVariantIds: resolved.sectionLayoutVariantIds }
          : {}),
        namedTemplate: resolved.selection,
        recommendedMotionSignatureId: resolved.recommendedMotionSignatureId,
      }];
    });
  }
  const enabled = options.enabled ?? dnaPipelineEnabled();
  const blueprints = enabled
    ? buildCandidateBlueprints(
        survey,
        (await selectDesignDnaCandidates(survey, options.invoke)).selections,
      )
    : buildCandidateBlueprints(survey);
  const useFontPairings = options.fontPairingEnabled ?? fontPairingsEnabled();
  const industryClass = fontIndustryClassForSurvey(survey);
  const fontResolvedBlueprints = useFontPairings
    ? blueprints.map((blueprint) => {
        if (!blueprint.designDna) return blueprint;
        const id = resolveKoreanFontPairingId({
          dnaId: blueprint.designDna.dnaId,
          industryClass,
        });
        const theme = applyKoreanFontPairing(blueprint.theme, id);
        return theme === blueprint.theme ? blueprint : { ...blueprint, theme };
      })
    : blueprints;
  const layoutEnabled = options.layoutEnabled ?? layoutVariantsEnabled();
  if (!layoutEnabled) return fontResolvedBlueprints;
  const sectionAvailability = sectionLayoutAvailabilityForSurvey(survey);
  const [heroSelections, sectionSelections] = await Promise.all([
    selectHeroLayouts(
      survey,
      fontResolvedBlueprints.map((blueprint) => ({
        ...(blueprint.designDna ? { designDnaId: blueprint.designDna.dnaId } : {}),
        media: {
          image: Boolean(blueprint.mockHeroUrl),
          video: false,
          poster: false,
        },
      })),
      options.layoutInvoke,
    ),
    selectSectionLayouts(
      survey,
      fontResolvedBlueprints.map((blueprint) => ({
        ...(blueprint.designDna ? { designDnaId: blueprint.designDna.dnaId } : {}),
        availability: sectionAvailability,
      })),
      options.sectionLayoutInvoke,
    ),
  ]);
  return fontResolvedBlueprints.map((blueprint, index) => ({
    ...blueprint,
    heroLayoutVariantId: heroSelections[index],
    ...(Object.keys(sectionSelections[index]).length > 0
      ? { sectionLayoutVariantIds: sectionSelections[index] }
      : {}),
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
