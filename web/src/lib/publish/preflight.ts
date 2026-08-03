/**
 * [quality-system] 발행 전 자가 검증 — "고객에게 파는 진단기를 우리 생성물이 먼저 통과한다".
 * 순수 함수(렌더/네트워크 없음 → 단위 테스트 가능). 실제 SEO/AEO/GEO 스캔 결과는 라우트가
 * lib/scan/preflight(config→HTML→rules)로 뽑아 opts.scan으로 주입한다.
 *
 * 게이트 정책:
 *  ② sanitizeMotion(무효면) + validatePalette(본문 AA 미달이면) → blockers (발행 차단)
 *  ③ 모바일: 영상 요소 poster 폴백 없음 → warnings
 *  ① 자가 진단 점수 < 기준 → warnings (발행 허용 + QA 필요)
 */
import type { MotionTier, SectionType, SiteConfig } from '@/lib/types/site';
import { allSections } from '@/lib/types/site';
import { sanitizeMotion } from '@/lib/motion/validate';
import { classifyVideoBytes } from '@/lib/motion/asset-limits';
import { validatePalette, qaAuditChecklist } from '@/lib/design/quality-standards';
import { scrimPassesAA } from '@/lib/design/scrim';
import { solidButtonPassesAA } from '@/lib/design/button-contrast';
import { isThinSection } from '@/lib/design/section-density';
import { resolveSectionPriority } from '@/lib/data/site-blueprints';
import {
  sectionIsTestimonial,
  testimonialExposurePolicyForConfig,
} from '@/lib/content/testimonial-policy';
import type { PublishArtifactAudit } from './artifact-audit';
import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';
import {
  US_TENANT_LEGAL_DOCUMENTS_ENABLED,
  usTenantLegalDocumentsRequired,
} from '@/lib/legal/templates';

export const PUBLISH_SCAN_THRESHOLD = 70;

/** [Q3] 내용이 실려야 할(빈약하면 경고) 콘텐츠 섹션 타입 — hero/cta/contact/custom은 제외(정당한 컴팩트) */
const DENSE_SECTION_TYPES = new Set<SectionType>([
  'about', 'features', 'menu', 'gallery', 'testimonials', 'pricing', 'team', 'cases', 'faq',
]);

export interface PublishPreflight {
  /** blockers 없음 = 발행 가능 */
  ok: boolean;
  /** 발행 차단 사유 (모션 무효·본문 대비 미달) */
  blockers: string[];
  /** 발행은 허용하되 QA/개선 권장 (poster 폴백·진단 미달) */
  warnings: string[];
  needsQa: boolean;
  /** quality-standards 파생 — QA 화면과 단일 소스 */
  qaChecklist: ReturnType<typeof qaAuditChecklist>;
  scan?: { total: number; grade: string; belowThreshold: boolean };
}

export interface PublishCheckOptions {
  scan?: { total: number; grade: string };
  scanThreshold?: number;
  /** 렌더된 정적 문서에서 증명한 하드 게이트. 점수와 달리 한 건이라도 있으면 발행 차단. */
  artifact?: PublishArtifactAudit;
}

export function checkPublish(
  config: SiteConfig,
  tier: MotionTier,
  opts?: PublishCheckOptions,
): PublishPreflight {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (usTenantLegalDocumentsRequired(config) && !US_TENANT_LEGAL_DOCUMENTS_ENABLED) {
    blockers.push('US tenant legal documents are pending counsel review and cannot be published.');
  }

  for (const blocker of opts?.artifact?.blockers ?? []) blockers.push(blocker.message);

  const testimonialPolicy = testimonialExposurePolicyForConfig(config);
  if (
    !testimonialPolicy.allowed
    && allSections(config).some((section) => sectionIsTestimonial(section))
  ) {
    blockers.push('Customer testimonial sections cannot be published automatically for this industry.');
  }

  const medicalPolicy = screenMedicalSiteConfig(config);
  for (const violation of medicalPolicy.violations) {
    if (violation.kind === 'classification') {
      blockers.push(`Medical classification error: ${violation.message}`);
      continue;
    }
    const disposition = violation.severity === 'warn' ? 'review required' : 'publication blocked';
    blockers.push(
      `Medical advertising ${disposition} (${violation.path}): ${violation.safeReplacementHint}`,
    );
  }

  // ② 모션 무결성 — 저장 시 sanitize되므로 정상 draft는 무변경. 변경 발생 = 저장 우회/오염 → 차단.
  const { changes } = sanitizeMotion(config, tier);
  if (changes.length) blockers.push(`모션 설정이 유효하지 않습니다: ${changes.join(' ')}`);

  // ② 팔레트 — 본문 텍스트 AA(4.5:1) 미달이면 차단 (색 개수는 시스템 테마 6토큰 중 5개만 검사)
  const p = config.theme.palette;
  const pv = validatePalette([p.primary, p.accent, p.background, p.surface, p.muted], {
    text: p.text,
    background: p.background,
  });
  if (!pv.ok) blockers.push(`색상 대비 문제: ${pv.error}`);

  // ③ 모바일 — 영상 poster 폴백 (모바일/저속·자동재생 실패 시 빈 화면 방지)
  for (const s of allSections(config)) {
    for (const el of s.elements) {
      if (el.kind === 'video' && !el.poster) {
        warnings.push(`영상 요소(${el.id})에 poster 폴백이 없습니다 — 모바일·저속에서 빈 화면이 될 수 있습니다.`);
      }
    }
    // [motion 3단계] video-hero 배경 영상도 poster 필수 — 없으면 렌더러가 ken-burns 폴백하지만 경고로 고지
    if (s.background.video?.src && !s.background.video.poster) {
      warnings.push(`섹션 '${s.name}'의 배경 영상에 poster가 없습니다 — video-hero가 ken-burns로 폴백됩니다.`);
    }
    // [motion 4단계] 배경 영상 원본 크기 게이트 (bytes 기록 시 활성 — 후처리 파이프라인 도입 후)
    const sz = classifyVideoBytes(s.background.video?.bytes);
    if (sz.blocker) blockers.push(`섹션 '${s.name}': ${sz.blocker}`);
    else if (sz.warning) warnings.push(`섹션 '${s.name}': ${sz.warning}`);
    // [Q1] 이미지 배경 위 텍스트 스크림 대비 — 최악 배경에서 AA 미보장이면 차단(카피 가독 보장)
    const img = s.background.image;
    if (img?.overlayColor) {
      for (const el of s.elements) {
        if (el.kind !== 'text') continue;
        const color = el.style.color ?? config.theme.palette.text;
        if (!scrimPassesAA(img.overlayColor, img.overlayOpacity ?? 0.45, color)) {
          blockers.push(
            `섹션 '${s.name}'의 텍스트가 배경 이미지 위에서 대비(AA)에 못 미칩니다 — 스크림을 진하게 하거나 글자색을 바꿔주세요.`,
          );
          break;
        }
      }
    }
    // [Q3] 섹션 밀도 — 내용이 실려야 할 콘텐츠 섹션이 빈약하면 경고("PPT 1장" 방지)
    // [A2] 필수(must) 섹션이 비면 우선(강조) 경고 — 있으면-좋음(nice)은 부드럽게.
    if (DENSE_SECTION_TYPES.has(s.type) && isThinSection(s)) {
      const must = resolveSectionPriority({ type: s.type }) === 'must';
      warnings.push(
        must
          ? `필수 섹션 '${s.name}'의 내용이 비어 있어요 — 발행 전에 실제 정보를 꼭 채워주세요.`
          : `섹션 '${s.name}'의 내용이 빈약합니다 — 실제 정보(메뉴·안내 등)를 더 채우면 좋아요.`,
      );
    }
    // [G2] 솔리드 CTA 버튼 대비 — 버튼 배경 vs 글자가 AA 미달이면 차단(다크 팔레트 CTA 투명 방지)
    for (const el of s.elements) {
      if (el.kind !== 'button' || el.style.variant !== 'solid') continue;
      const fill = el.style.color ?? config.theme.palette.primary;
      const textColor = el.style.textColor ?? config.theme.palette.background;
      if (!solidButtonPassesAA(fill, textColor)) {
        blockers.push(
          `섹션 '${s.name}'의 버튼('${el.label}')이 글자와 배경 대비(AA)에 못 미칩니다 — 버튼 글자색을 바꿔주세요.`,
        );
        break;
      }
    }
  }

  // ① 자가 SEO/AEO/GEO 진단 (라우트가 주입) — 기준 미달이면 발행 허용 + 경고
  const threshold = opts?.scanThreshold ?? PUBLISH_SCAN_THRESHOLD;
  let scan: PublishPreflight['scan'];
  if (opts?.scan) {
    const below = opts.scan.total < threshold;
    scan = { total: opts.scan.total, grade: opts.scan.grade, belowThreshold: below };
    if (below) {
      warnings.push(
        `자체 진단 ${opts.scan.total}점(${opts.scan.grade}) — 기준 ${threshold}점 미달. 발행 후 개선을 권장합니다.`,
      );
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    needsQa: warnings.length > 0,
    qaChecklist: qaAuditChecklist(),
    scan,
  };
}
