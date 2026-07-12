/**
 * [v4] 사이트 목표 레지스트리 (rules as code) — "방문자가 뭘 해주면 성공인가요?"
 * 목표 1개가 주 CTA 문구(ctaLabel)와 섹션 강조 순서(sectionEmphasis)를 결정한다.
 * 목적 그룹(PurposeGroup)에 따라 노출 목표를 필터링(goalsForGroup) — purchase는 'sell'만 등.
 */
import type { PurposeGroup } from '@/lib/data/purpose-taxonomy';
import type { SiteGoalId } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';

export interface SiteGoalDef {
  /** 고객이 고르는 문장 */
  label: string;
  /** 주 CTA 버튼 문구 (buildHero에 배선) */
  ctaLabel: string;
  /** 선택지 아래 한 줄 설명 */
  description: string;
  /** 이 목표를 노출할 목적 그룹 */
  applicableGroups: readonly PurposeGroup[];
  /** 생성 시 강조 우선 섹션 */
  sectionEmphasis: readonly SectionType[];
}

export const SITE_GOALS = {
  call: {
    label: '전화가 오면 좋겠어요',
    ctaLabel: '전화 문의',
    description: '방문자가 바로 전화를 걸도록 안내해요',
    applicableGroups: ['serve', 'sell', 'promote', 'content'],
    sectionEmphasis: ['contact', 'hero'],
  },
  reserve: {
    label: '예약을 받고 싶어요',
    ctaLabel: '예약하기',
    description: '방문·시술·자리를 미리 예약받아요',
    applicableGroups: ['serve', 'content'],
    sectionEmphasis: ['contact', 'menu', 'hero'],
  },
  directions: {
    label: '찾아오게 하고 싶어요',
    ctaLabel: '오시는 길',
    description: '지도를 보고 매장으로 찾아오게 해요',
    applicableGroups: ['serve', 'sell', 'promote'],
    sectionEmphasis: ['contact', 'hero'],
  },
  kakao_inquiry: {
    label: '카톡으로 문의받고 싶어요',
    ctaLabel: '카카오톡 문의',
    description: '편한 카카오톡 채널로 상담을 받아요',
    applicableGroups: ['serve', 'sell', 'promote', 'content'],
    sectionEmphasis: ['contact', 'hero'],
  },
  purchase: {
    label: '바로 구매하게 하고 싶어요',
    ctaLabel: '구매하기',
    description: '상품을 바로 사거나 주문하게 해요',
    applicableGroups: ['sell'],
    sectionEmphasis: ['pricing', 'gallery', 'cta'],
  },
  trust: {
    label: '믿음을 주고 싶어요',
    ctaLabel: '상담 문의',
    description: '실적·후기로 신뢰를 먼저 쌓아요',
    applicableGroups: ['serve', 'sell', 'promote', 'content'],
    sectionEmphasis: ['cases', 'testimonials', 'team', 'about'],
  },
} as const satisfies Record<SiteGoalId, SiteGoalDef>;

/** 목적 그룹에 노출할 목표 목록 (applicableGroups 필터) */
export function goalsForGroup(group: PurposeGroup): { id: SiteGoalId; def: SiteGoalDef }[] {
  return (Object.entries(SITE_GOALS) as [SiteGoalId, SiteGoalDef][])
    .filter(([, def]) => def.applicableGroups.includes(group))
    .map(([id, def]) => ({ id, def }));
}

/** 목표 → 주 CTA 문구 (buildHero 배선용). 미설정이면 undefined */
export function ctaLabelForGoal(goal: SiteGoalId | undefined): string | undefined {
  return goal ? SITE_GOALS[goal].ctaLabel : undefined;
}
