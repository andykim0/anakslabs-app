/**
 * [I4] 진단 문제 해결 방식 매핑 + 전후 대조 — "진단에서 찾은 N개 중 M개를 이렇게 고쳤어요".
 * 정직성: 과장 금지. 재생성 결과를 preflight로 재측정해 실제로 사라진 이슈만 "해결"로 센다.
 * 이 레지스트리는 각 코드가 개선 모드 재생성으로 '어떻게' 해결되는지(자동/콘텐츠/수동)를 알려
 * 고객 코칭에만 쓴다 — 실제 해결 판정은 computeResolution(전 이슈코드 − 후 이슈코드)이 한다.
 */
import { guidanceFor } from './guidance';
import { allScanCodes } from './guidance';

/** auto=재생성·서빙이 자동 교정 / content=콘텐츠 있어야 해결 / manual=고객 수동(성능 등) */
export type ResolutionKind = 'auto' | 'content' | 'manual';

/**
 * 코드별 해결 방식. guidance.anchor='system'은 전부 auto. 그 외는 아래 override로 분류
 * (I0-3 정찰: 재생성이 meta·JSON-LD·밀도·구조를 자동 채우는 항목 vs 콘텐츠·성능 필요 항목).
 */
const RESOLUTION_OVERRIDE: Record<string, ResolutionKind> = {
  // 재생성이 자동 교정(생성 meta/섹션·서빙 레이어)
  seo_title_missing: 'auto',
  seo_title_multiple: 'auto',
  seo_title_length: 'auto',
  seo_meta_description: 'auto',
  seo_h1: 'auto',
  seo_hash_navigation: 'auto',
  aeo_jsonld_invalid: 'auto',
  aeo_jsonld_type: 'auto',
  aeo_entity_identity: 'auto',
  aeo_heading_order: 'auto',
  aeo_semantic_structure: 'auto',
  aeo_lists_tables: 'auto',
  aeo_accessible_controls: 'auto',
  geo_no_text: 'auto',
  geo_low_text_ratio: 'auto',
  geo_topic_alignment: 'auto',
  geo_empty_page: 'auto',
  // 콘텐츠가 있어야 해결(가져오기로 미리 채우되, 없으면 게이트가 요구)
  seo_og: 'content',
  seo_img_alt: 'content',
  aeo_question_headings: 'content',
  aeo_local_business_details: 'content',
  aeo_jsonld_visibility: 'content',
  geo_business_info: 'content',
  geo_dates: 'content',
  geo_author: 'content',
  geo_unsourced_claims: 'content',
  // 수동/호스팅 성능
  seo_html_truncated: 'manual',
  seo_speed_slow: 'manual',
  seo_speed_very_slow: 'manual',
};

export function resolutionOf(code: string): ResolutionKind {
  if (code in RESOLUTION_OVERRIDE) return RESOLUTION_OVERRIDE[code];
  // 기본: guidance anchor 'system'이면 auto(플랫폼 자동 처리), 그 외 content
  return guidanceFor(code)?.anchor === 'system' ? 'auto' : 'content';
}

export interface ResolutionCompare {
  /** 진단에서 찾았고 재생성 후 사라진 이슈 코드(실제 해결) */
  resolved: string[];
  /** 진단에서 찾았지만 재생성 후에도 남은 코드(콘텐츠·수동 필요) */
  remaining: string[];
  /** 전(원본 사이트) 총점 */
  beforeTotal: number;
  /** 후(재생성 자가진단) 총점 */
  afterTotal: number;
}

/**
 * 전후 이슈 코드 집합으로 실제 해결/잔여 산출. resolved = before ∖ after (실제 사라진 것만).
 * 정직성: after에도 있는 코드는 절대 "해결"로 세지 않는다.
 */
export function computeResolution(
  beforeCodes: string[],
  afterCodes: string[],
  beforeTotal: number,
  afterTotal: number,
): ResolutionCompare {
  const after = new Set(afterCodes);
  const before = [...new Set(beforeCodes)];
  return {
    resolved: before.filter((c) => !after.has(c)),
    remaining: before.filter((c) => after.has(c)),
    beforeTotal,
    afterTotal,
  };
}

/** 전 코드가 resolution 분류를 가짐(완전성 테스트용) — allScanCodes 재노출 */
export { allScanCodes };
