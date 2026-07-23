/**
 * [motion-system] 서버 새니타이저 — LLM/클라이언트가 무엇을 넣든 최종 config는 유효 프리셋만.
 * 순수 함수·원본 불변. 모든 교정은 changes[]에 한국어로 남겨 로깅·고객 안내에 쓴다.
 */
import type {
  BeforeAfterAssetSelection,
  CustomerCaseMedia,
  HeroImageChoice,
  MotionIntensity,
  MotionTier,
  ProductionMotionSignatureId,
  SiteConfig,
} from '@/lib/types/site';
import type { SitePurposeId, SurveyInput } from '@/lib/types/domain';
import type { AssetRef } from '@/lib/assets/provenance';
import { countMotionSignatures, MOTION_LIMITS, MOTION_TECHNIQUES } from './registry';
import { DEFAULT_PRESET, MOTION_PRESETS, isPresetId, resolvePresetForIndustry, type MotionPreset, type PresetId } from './presets';
import { isAllowedHeroChoice, isKnownHeroChoice } from './hero-choice';
import { findVideoConcept } from './video-concepts';
import { hasVideoAddon } from '@/lib/services/entitlements';
import { isHeroVideoMotionId } from './hero-video-motions';
import {
  SCROLLYTELLING_MOTION_ID,
  isScrollytellingTemplate,
  sanitizeScrollytellingSections,
} from './scrollytelling';
import {
  isProductionMotionSignatureId,
  motionContextFromConfig,
  motionContextFromSurvey,
  sanitizeMotionSignatures,
  type MotionAssetProvenance,
  type MotionContextOptions,
} from './signatures';
import { buildMotionSceneFromSurvey } from './scenes';

const INTENSITIES: readonly MotionIntensity[] = ['off', 'subtle', 'normal'];
const HERO_IMAGE_CHOICES: readonly HeroImageChoice[] = ['system', 'upload', 'ai-1', 'ai-2', 'ai-3'];

function isHeroImageChoice(value: unknown): value is HeroImageChoice {
  return typeof value === 'string' && (HERO_IMAGE_CHOICES as readonly string[]).includes(value);
}

/** basic 플랜 강등 매핑 — 같은 계열 basic 프리셋 (다운그레이드 시 사이트를 깨진 채 두지 않는다) */
const DOWNGRADE_MAP: Partial<Record<PresetId, PresetId>> = {
  'clinic-premium': 'office-basic',
  'dining-premium': 'cafe-basic',
  'beauty-premium': 'cafe-basic',
  'cinematic-hero': 'cafe-basic',
};

/** 프리셋 구성이 MOTION_LIMITS·maxPerPage를 위반하면 사유(한국어), 아니면 null (방어 검사) */
function presetLimitViolation(id: PresetId): string | null {
  const p: MotionPreset = MOTION_PRESETS[id];
  const used = [p.hero, p.sections, ...p.accents];
  let infinite = 0;
  const counts = new Map<string, number>();
  for (const t of used) {
    const spec = MOTION_TECHNIQUES[t];
    if (spec.infinite) infinite += 1;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (infinite > MOTION_LIMITS.maxInfinitePerPage)
    return `무한 반복 모션 ${infinite}개(상한 ${MOTION_LIMITS.maxInfinitePerPage})`;
  const signature = countMotionSignatures(used, p.composite);
  if (signature > MOTION_LIMITS.maxSignaturePerPage)
    return `시그니처 모션 ${signature}개(상한 ${MOTION_LIMITS.maxSignaturePerPage})`;
  for (const [t, c] of counts) {
    const max = MOTION_TECHNIQUES[t as keyof typeof MOTION_TECHNIQUES].maxPerPage;
    if (c > max) return `기법 '${t}' ${c}회(페이지 상한 ${max})`;
  }
  return null;
}

/**
 * 모션 설정 새니타이즈. 처리 순서:
 *  0) 미설정 → tier 기본 프리셋 주입
 *  ① 미등록/금지 presetId → tier 기본 프리셋으로 치환
 *  ② basic 플랜 + premium 프리셋 → 같은 계열 basic 프리셋으로 강등
 *  ③ MOTION_LIMITS·maxPerPage 위반(방어) → tier 기본 프리셋
 *  (darkSectionOnly는 섹션 명암을 config가 모르므로 렌더/프리셋 저작 단계에서 강제 — 테스트로 보장)
 */
export function sanitizeMotion(
  config: SiteConfig,
  plan: MotionTier,
  signatureContext: MotionContextOptions = {},
): { config: SiteConfig; changes: string[] } {
  const changes: string[] = [];
  let presetId: string = config.motion?.presetId ?? '';
  let intensity: MotionIntensity = config.motion?.intensity ?? 'normal';

  if (!config.motion) {
    presetId = DEFAULT_PRESET[plan];
    changes.push(`모션 설정이 없어 기본 프리셋 '${presetId}'을 적용했습니다.`);
  }

  // ① 미등록/금지 presetId
  if (!isPresetId(presetId)) {
    const fb = DEFAULT_PRESET[plan];
    changes.push(`알 수 없는 모션 프리셋 '${presetId || '(빈 값)'}' → 기본 '${fb}'으로 대체했습니다.`);
    presetId = fb;
  }

  // intensity 검증
  if (!INTENSITIES.includes(intensity)) {
    changes.push(`알 수 없는 모션 강도 '${String(intensity)}' → 'normal'로 대체했습니다.`);
    intensity = 'normal';
  }

  // ② 영상 합성 프리셋은 애드온 미보유 시 명시적으로 정적 ken-burns로 강등
  if (!hasVideoAddon(plan) && presetId === 'cinematic-hero') {
    const down = DOWNGRADE_MAP['cinematic-hero']!;
    changes.push(`AI 영상 홈페이지가 없어 시네마틱 프리셋 'cinematic-hero' → '${down}'(ken-burns)로 강등했습니다.`);
    presetId = down;
  }

  // ③ basic 플랜 + 나머지 premium 프리셋 → 강등
  if (!hasVideoAddon(plan) && MOTION_PRESETS[presetId as PresetId].tier === 'premium') {
    const down = DOWNGRADE_MAP[presetId as PresetId] ?? DEFAULT_PRESET.basic;
    changes.push(`Basic 플랜에서 Premium 프리셋 '${presetId}'은 사용할 수 없어 '${down}'으로 강등했습니다.`);
    presetId = down;
  }

  // ④ 한도 위반 방어
  const viol = presetLimitViolation(presetId as PresetId);
  if (viol) {
    const fb = DEFAULT_PRESET[plan];
    changes.push(`프리셋 '${presetId}' 한도 위반(${viol}) → 기본 '${fb}'으로 대체했습니다.`);
    presetId = fb;
  }

  // [W4] videoAddon은 '선택 의사'이지 권한이 아니다. 타입 오염은 fail-closed.
  let videoAddon = config.motion?.videoAddon;
  if (videoAddon !== undefined && typeof videoAddon !== 'boolean') {
    changes.push('AI 영상 홈페이지 선택값이 올바르지 않아 제거했습니다.');
    videoAddon = undefined;
  }

  // ⑤ [Q7] heroTechnique — HERO_MOTION_CHOICES에 열거된 id만, 티어 초과는 프리셋 기본 히어로로 강등
  let heroTechnique = config.motion?.heroTechnique;
  if (heroTechnique !== undefined) {
    if (videoAddon === false && heroTechnique === 'video-hero') {
      changes.push('AI 영상 홈페이지를 선택하지 않아 히어로를 ken-burns로 되돌렸습니다.');
      heroTechnique = 'ken-burns';
    } else if (!isAllowedHeroChoice(plan, heroTechnique)) {
      changes.push(
        isKnownHeroChoice(heroTechnique)
          ? `이 플랜에서 쓸 수 없는 히어로 모션 '${heroTechnique}' → 프리셋 기본 히어로로 되돌렸습니다.`
          : `알 수 없는 히어로 모션 '${heroTechnique}' → 프리셋 기본 히어로로 되돌렸습니다.`,
      );
      heroTechnique = undefined;
    }
  }

  // ⑥ [Q7] videoConceptId — 등록된 컨셉 id만, Basic 플랜은 무의미(video-hero 불가)라 제거
  let videoConceptId = config.motion?.videoConceptId;
  if (videoConceptId !== undefined) {
    if (plan === 'basic') {
      changes.push('영상 컨셉은 AI 영상 홈페이지 전용이라 제거했습니다.');
      videoConceptId = undefined;
    } else if (!findVideoConcept(videoConceptId)) {
      changes.push(`알 수 없는 영상 컨셉 '${videoConceptId}' → 제거했습니다.`);
      videoConceptId = undefined;
    }
  }

  // [W4] 히어로 소스·영상 연출은 등록값만 보존. basic 강등에서도 요청 의도는 남긴다.
  let heroImageChoice = config.motion?.heroImageChoice;
  if (heroImageChoice !== undefined && !isHeroImageChoice(heroImageChoice)) {
    changes.push(`알 수 없는 히어로 이미지 선택 '${String(heroImageChoice)}' → 제거했습니다.`);
    heroImageChoice = undefined;
  }

  const videoIntent = videoAddon === true || (videoAddon === undefined && config.motion?.videoRequested === true);
  let heroMotionId = config.motion?.heroMotionId;
  if (heroMotionId !== undefined) {
    if (!videoIntent) {
      changes.push('AI 영상 홈페이지를 선택하지 않아 히어로 영상 연출을 제거했습니다.');
      heroMotionId = undefined;
    } else if (!isHeroVideoMotionId(heroMotionId)) {
      changes.push(`알 수 없는 히어로 영상 연출 '${heroMotionId}' → 제거했습니다.`);
      heroMotionId = undefined;
    } else if (
      heroMotionId === SCROLLYTELLING_MOTION_ID &&
      !isScrollytellingTemplate(config.meta.purposeId, config.meta.templateId)
    ) {
      changes.push('페이지 관통 연출은 허용된 브랜드·전문·파인다이닝·포트폴리오 템플릿에서만 사용할 수 있어 제거했습니다.');
      heroMotionId = undefined;
    }
  }

  // [U1/W4] 명시 videoAddon이 있으면 그 값이 레거시 videoRequested보다 우선한다.
  const videoRequested = videoAddon !== undefined ? videoAddon : config.motion?.videoRequested;

  const sanitizedMotionConfig: SiteConfig = {
      ...config,
      motion: {
        presetId,
        intensity,
        ...(config.motion?.catalogVersion === 2 ? { catalogVersion: 2 as const } : {}),
        ...(config.motion?.signatures ? { signatures: config.motion.signatures } : {}),
        ...(config.motion?.requestedSignatureId ? { requestedSignatureId: config.motion.requestedSignatureId } : {}),
        ...(heroTechnique !== undefined ? { heroTechnique } : {}),
        ...(videoConceptId !== undefined ? { videoConceptId } : {}),
        ...(videoRequested ? { videoRequested: true } : {}),
        ...(heroImageChoice !== undefined ? { heroImageChoice } : {}),
        ...(videoAddon !== undefined ? { videoAddon } : {}),
        ...(heroMotionId !== undefined ? { heroMotionId } : {}),
      },
  };
  const scrollytelling = sanitizeScrollytellingSections(sanitizedMotionConfig, plan);
  changes.push(...scrollytelling.changes);
  const signatures = sanitizeMotionSignatures(
    scrollytelling.config,
    motionContextFromConfig(scrollytelling.config, plan, signatureContext),
  );
  changes.push(...signatures.changes);

  // A structured v2 scene is the page's single dominant signature. Persisted/forged
  // configs must not layer the legacy cinematic composite or a hero-video override on
  // top of it. The scene wins deterministically; its own video remains one composite
  // experience and the base catalog stays lightweight.
  let finalConfig = signatures.config;
  const retainedScenes = finalConfig.motion?.signatures ?? [];
  if (retainedScenes.length > 0 && finalConfig.motion) {
    const currentPreset: MotionPreset | undefined = MOTION_PRESETS[finalConfig.motion.presetId as PresetId];
    const presetTechniques = currentPreset
      ? [currentPreset.hero, currentPreset.sections, ...currentPreset.accents]
      : [];
    const presetSignatureUnits = currentPreset
      ? countMotionSignatures(presetTechniques, currentPreset.composite)
      : 0;
    const presetInfinite = currentPreset
      ? presetTechniques.reduce((sum, technique) => sum + (MOTION_TECHNIQUES[technique].infinite ? 1 : 0), 0)
      : 0;
    const sceneConsumesVideo = retainedScenes.some((scene) =>
      scene.signatureId === 'cinematic-scrub' ||
      scene.signatureId === 'scrollytelling-manifesto' ||
      (scene.signatureId === 'sticky-chapters' && scene.chapters.some((item) => item.media?.kind === 'video')) ||
      ((scene.signatureId === 'portal-zoom' || scene.signatureId === 'scroll-curtain') && scene.scenes.some((item) => item.media?.kind === 'video')) ||
      (scene.signatureId === 'horizontal-story' && scene.panels.some((item) => item.media?.kind === 'video')),
    );
    const mustNormalizePreset = presetSignatureUnits > 0 || (sceneConsumesVideo && presetInfinite >= MOTION_LIMITS.maxInfinitePerPage);
    const withoutLegacyHeroMotion = { ...finalConfig.motion, heroMotionId: undefined };
    const nextHeroTechnique = finalConfig.motion.heroTechnique === 'video-hero'
      ? undefined
      : finalConfig.motion.heroTechnique;
    const hadConflict = mustNormalizePreset || finalConfig.motion.heroTechnique === 'video-hero' || Boolean(finalConfig.motion.heroMotionId);
    if (hadConflict) {
      finalConfig = {
        ...finalConfig,
        motion: {
          ...withoutLegacyHeroMotion,
          presetId: mustNormalizePreset ? DEFAULT_PRESET[plan] : finalConfig.motion.presetId,
          ...(nextHeroTechnique ? { heroTechnique: nextHeroTechnique } : { heroTechnique: undefined }),
        },
      };
      changes.push('구조화 모션 시그니처를 유지하고 중복되는 레거시 히어로·영상 시그니처를 제거했습니다.');
    }
  }

  return { config: finalConfig, changes };
}

/** [Q7] 온보딩 '움직임 고르기' 선택 — 생성 라우트 body(motionChoice)로 전달되는 사용자 선택 */
export interface MotionChoice {
  /** HERO_MOTION_CHOICES id ('none' 포함). 미설정 = 프리셋 기본 히어로 */
  heroTechnique?: string;
  /** 잔잔하게(subtle) / 보통(normal). 미설정 = normal */
  intensity?: MotionIntensity;
  /** Premium video-hero 선택 시 영상 컨셉(VIDEO_CONCEPTS id) */
  videoConceptId?: string;
  /** [W4] 히어로 선택 소스·영상 애드온 의사·등록 연출. */
  heroImageChoice?: HeroImageChoice;
  videoAddon?: boolean;
  heroMotionId?: string;
  /** [v2] 실제 production renderer를 선택하는 페이지 시그니처. heroMotionId와 의미가 다르다. */
  signatureId?: ProductionMotionSignatureId;
  /** URL 없는 자산 레코드 선택. 서버가 owner/site/case/권리를 다시 검증해야 한다. */
  beforeAfterSelection?: BeforeAfterAssetSelection;
}

export interface ApplyGeneratedMotionOptions {
  assets?: readonly MotionAssetProvenance[];
  customerCaseMedia?: readonly CustomerCaseMedia[];
  /** Authenticated route truth result; never derive this set from survey URLs. */
  customerUploadAssetRefs?: readonly AssetRef[];
  ownerId?: string;
  siteId?: string;
}

/**
 * [생성 파이프라인 방벽] LLM 출력의 motion 값은 전부 무시하고 업종 매핑 프리셋으로 덮어쓴 뒤
 * 다시 sanitize(이중 방벽). 생성·재생성 라우트가 저장 직전 호출한다.
 * [Q7] 순서: 생성 프리셋 주입 → 사용자 선택(heroTechnique·intensity·videoConceptId) 병합 → sanitize.
 * choice 미전달이면 기존과 동일(intensity 'normal', 프리셋 기본 히어로) — 무회귀.
 */
export function applyGeneratedMotion(
  config: SiteConfig,
  purpose: SitePurposeId,
  tier: MotionTier,
  choice?: MotionChoice,
  survey?: SurveyInput,
  options: ApplyGeneratedMotionOptions = {},
): SiteConfig {
  const explicitVideoAddon = choice?.videoAddon;
  const videoSelected = explicitVideoAddon ?? choice?.heroTechnique === 'video-hero';
  const selectedHeroTechnique = videoSelected
    ? 'video-hero'
    : choice?.heroTechnique === 'video-hero'
      ? 'ken-burns'
      : choice?.heroTechnique;
  const signatureId = choice?.signatureId;
  const presetId = signatureId
    ? (hasVideoAddon(tier) ? 'base-premium-v2' : 'base-calm-v2')
    : videoSelected
      ? 'cinematic-hero'
      : resolvePresetForIndustry(purpose, tier);
  // [U2] 영상 애드온 선택(video-hero) = videoRequested 표식. 애드온 미보유(basic)면 sanitize가
  // 능력(heroTechnique/videoConceptId)은 강등하지만 이 표식은 남겨 관리자가 판매·부여 대상 식별.
  const videoRequested = videoSelected;
  let nextConfig: SiteConfig = {
    ...config,
    motion: {
        presetId,
        intensity: choice?.intensity ?? 'normal',
        ...(signatureId ? { catalogVersion: 2 as const, requestedSignatureId: signatureId } : {}),
        ...(selectedHeroTechnique !== undefined ? { heroTechnique: selectedHeroTechnique } : {}),
        ...(videoSelected && choice?.videoConceptId !== undefined ? { videoConceptId: choice.videoConceptId } : {}),
        ...(videoRequested ? { videoRequested: true } : {}),
        ...(choice?.heroImageChoice !== undefined ? { heroImageChoice: choice.heroImageChoice } : {}),
        ...(explicitVideoAddon !== undefined ? { videoAddon: explicitVideoAddon } : {}),
        ...(videoSelected && choice?.heroMotionId !== undefined ? { heroMotionId: choice.heroMotionId } : {}),
      },
  };

  if (survey) {
    const canonical = motionContextFromSurvey(survey, tier, {
      assets: options.assets,
      ownerId: options.ownerId,
      siteId: options.siteId,
      theme: nextConfig.theme,
    });
    nextConfig = {
      ...nextConfig,
      meta: {
        ...nextConfig.meta,
        templateId: canonical.templateId,
        industryClass: canonical.industryClass,
      },
    };
    if (signatureId && isProductionMotionSignatureId(signatureId)) {
      const sceneSurvey: SurveyInput = {
        ...survey,
        ...(choice?.beforeAfterSelection ? { beforeAfterSelection: choice.beforeAfterSelection } : {}),
      };
      const scene = buildMotionSceneFromSurvey(nextConfig, sceneSurvey, signatureId, {
        customerCaseMedia: options.customerCaseMedia,
        customerUploadAssetRefs: options.customerUploadAssetRefs,
      });
      if (scene) nextConfig = {
        ...nextConfig,
        motion: { ...nextConfig.motion!, signatures: [scene] },
      };
      const signatureResult = sanitizeMotionSignatures(nextConfig, {
        ...canonical,
        availableSections: nextConfig.pages.flatMap((page) => page.sections.map((section) => ({
          pageId: page.id,
          sectionId: section.id,
          type: section.type,
          itemCount: section.elements.length,
          mediaCount: section.elements.filter((element) => element.kind === 'image' || element.kind === 'video').length
            + (section.background.image ? 1 : 0)
            + (section.background.video ? 1 : 0),
        }))),
      });
      nextConfig = signatureResult.config;
    }
  }

  return sanitizeMotion(nextConfig, tier, {
    assets: options.assets,
    ownerId: options.ownerId,
    siteId: options.siteId,
    theme: nextConfig.theme,
  }).config;
}

/**
 * [읽기 마이그레이션] motion 없는(또는 미등록 프리셋) 기존 SiteConfig에 기본값 주입.
 * 데이터 계층 read 경계(mappers/seed)에서 호출. 레거시 config엔 업종 정보가 없으므로
 * 안전한 최저 기준(basic 기본 프리셋)을 주입 — 업종별 매핑은 생성 시점(applyGeneratedMotion)이 담당.
 */
export function ensureMotion(config: SiteConfig): SiteConfig {
  if (config.motion && isPresetId(config.motion.presetId)) return config;
  return { ...config, motion: { presetId: DEFAULT_PRESET.basic, intensity: 'normal' } };
}
