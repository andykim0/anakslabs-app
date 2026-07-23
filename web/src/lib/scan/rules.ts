/**
 * [v3 Phase 6] 스캔 규칙 공용 타입 — 결정적 규칙 기반, LLM 불사용.
 *
 * 카피 원칙: 라벨/설명은 전부 "상태 서술"만 — 순위·노출 보장 표현("1등", "상위 노출" 등) 금지.
 * 라벨 사전이 코드 상수(checks/*.ts의 RULES 배열)라 리뷰에서 grep 가능하다.
 */
import type { HTMLElement as ParsedElement } from 'node-html-parser';
import type { ScanIssue } from '@/lib/data/types';
import type { ProbedResource } from './fetch-target';

export interface RuleContext {
  /** node-html-parser 루트 */
  root: ParsedElement;
  rawHtml: string;
  /** script/style 제거 후 보이는 텍스트 */
  visibleText: string;
  url: URL;
  status: number;
  contentType: string;
  xRobotsTag: string;
  truncated: boolean;
  ttfbMs: number;
  robots: ProbedResource;
  sitemap: ProbedResource;
}

export interface ScanRule {
  code: string;
  pillar: ScanIssue['pillar'];
  /** 이 신호를 개선하는 주체. NUDGE와 진단 UI가 같은 단일 분류를 소비한다. */
  ownership: 'system' | 'shared' | 'customer';
  severity: ScanIssue['severity'];
  /** 실패 시 해당 축 점수에서 차감 */
  weight: number;
  label: string;
  detail: string;
  /** 같은 원인이 여러 규칙을 발화할 때 대표 한 건만 차감하기 위한 키. */
  rootCause?: string | ((ctx: RuleContext) => string | undefined);
  /** 상태는 알리되 점수에는 반영하지 않는 권고 규칙. */
  advisory?: boolean;
  /** true = 문제 있음(이슈 생성) */
  failed: (ctx: RuleContext) => boolean;
}

export interface RuleRunState {
  seenRootCauses: Set<string>;
}

export function createRuleRunState(): RuleRunState {
  return { seenRootCauses: new Set<string>() };
}

/** 규칙 목록 실행 → 실패한 규칙을 이슈로 */
export function runRules(
  rules: ScanRule[],
  ctx: RuleContext,
  state: RuleRunState = createRuleRunState(),
): { issues: ScanIssue[]; deducted: number } {
  const issues: ScanIssue[] = [];
  let deducted = 0;
  for (const rule of rules) {
    let bad = false;
    try {
      bad = rule.failed(ctx);
    } catch {
      bad = false; // 규칙 자체 오류는 스캔을 막지 않는다
    }
    if (bad) {
      const rootCause = typeof rule.rootCause === 'function' ? rule.rootCause(ctx) : rule.rootCause;
      const isRootCauseDetail = Boolean(rootCause && state.seenRootCauses.has(rootCause));
      const scoreDeducted = !rule.advisory && rule.weight > 0 && !isRootCauseDetail;
      if (rootCause && scoreDeducted) state.seenRootCauses.add(rootCause);
      issues.push({
        code: rule.code,
        severity: scoreDeducted ? rule.severity : 'info',
        label: rule.label,
        detail: rule.detail,
        pillar: rule.pillar,
        rootCause,
        scoreDeducted,
      });
      if (scoreDeducted) deducted += rule.weight;
    }
  }
  return { issues, deducted };
}
