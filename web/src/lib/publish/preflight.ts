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
import type { MotionTier, SiteConfig } from '@/lib/types/site';
import { allSections } from '@/lib/types/site';
import { sanitizeMotion } from '@/lib/motion/validate';
import { classifyVideoBytes } from '@/lib/motion/asset-limits';
import { validatePalette, qaAuditChecklist } from '@/lib/design/quality-standards';
import { scrimPassesAA } from '@/lib/design/scrim';

export const PUBLISH_SCAN_THRESHOLD = 70;

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

export function checkPublish(
  config: SiteConfig,
  tier: MotionTier,
  opts?: { scan?: { total: number; grade: string }; scanThreshold?: number },
): PublishPreflight {
  const blockers: string[] = [];
  const warnings: string[] = [];

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
