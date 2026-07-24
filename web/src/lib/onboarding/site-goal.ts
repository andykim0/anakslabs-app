/**
 * [v4] 사이트 목표 레지스트리 (rules as code) — "방문자가 뭘 해주면 성공인가요?"
 * 목표 1개가 주 CTA 문구(ctaLabel)와 섹션 강조 순서(sectionEmphasis)를 결정한다.
 * 목적 그룹(PurposeGroup: 손님 받기/알리기)에 따라 노출 목표를 필터링(goalsForGroup).
 */
import type { PurposeGroup } from '@/lib/data/purpose-taxonomy';
import type { SiteGoalId, SurveyInput } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import {
  isRecognizedChatUrl,
  isRecognizedReservationUrl,
} from '@/lib/analytics/trackable-actions';

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
    applicableGroups: ['serve', 'promote'],
    sectionEmphasis: ['contact', 'hero'],
  },
  reserve: {
    label: '예약을 받고 싶어요',
    ctaLabel: '예약하기',
    description: '방문·시술·자리를 미리 예약받아요',
    applicableGroups: ['serve'],
    sectionEmphasis: ['contact', 'menu', 'hero'],
  },
  directions: {
    label: '찾아오게 하고 싶어요',
    ctaLabel: '오시는 길',
    description: '지도를 보고 매장으로 찾아오게 해요',
    applicableGroups: ['serve', 'promote'],
    sectionEmphasis: ['contact', 'hero'],
  },
  kakao_inquiry: {
    label: '카톡으로 문의받고 싶어요',
    ctaLabel: '카카오톡 문의',
    description: '편한 카카오톡 채널로 상담을 받아요',
    applicableGroups: ['serve', 'promote'],
    sectionEmphasis: ['contact', 'hero'],
  },
  trust: {
    label: '믿음을 주고 싶어요',
    ctaLabel: '상담 문의',
    description: '실적·후기로 신뢰를 먼저 쌓아요',
    applicableGroups: ['serve', 'promote'],
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

export type ConversionDestinationKind =
  | 'phone'
  | 'reservation'
  | 'contact-form'
  | 'messenger';

export interface ConversionDestination {
  label: string;
  href: string;
  kind: ConversionDestinationKind;
}

function phoneHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.trim().replace(/(?!^\+)[^0-9]/gu, '');
  return compact.replace(/\D/gu, '').length >= 7 ? `tel:${compact}` : undefined;
}

/** 히어로와 일반 CTA가 함께 소비하는 고객 확인 전환 목적지 단일 소스. */
export function resolveConversionDestination(
  survey: SurveyInput,
): ConversionDestination | undefined {
  const brief = survey.contentDepth?.surveyBrief;
  if (!brief || !survey.siteGoal) return undefined;
  const destination = brief.conversionDestination;
  if (survey.siteGoal === 'call' && destination?.kind === 'phone_fact') {
    const phone = survey.contentDepth?.facts.find((fact) => fact.key === 'phone' && fact.value.trim())?.value;
    const href = phoneHref(phone);
    return href ? { label: '전화 문의', href, kind: 'phone' } : undefined;
  }
  if (
    survey.siteGoal === 'reserve' &&
    destination?.kind === 'reservation_url' &&
    isRecognizedReservationUrl(destination.url)
  ) return { label: '예약하기', href: destination.url, kind: 'reservation' };
  if (survey.siteGoal === 'kakao_inquiry') {
    if (destination?.kind === 'contact_form') {
      return { label: '문의하기', href: '#sec-contact', kind: 'contact-form' };
    }
    if (destination?.kind === 'messenger_url' && isRecognizedChatUrl(destination.url)) {
      return { label: '카카오톡 문의', href: destination.url, kind: 'messenger' };
    }
  }
  return undefined;
}

/** 실제 목적지가 홈페이지 폼이면 카카오톡으로 오인시키지 않는다. */
export function ctaLabelForSurvey(survey: SurveyInput): string | undefined {
  return resolveConversionDestination(survey)?.label ?? ctaLabelForGoal(survey.siteGoal);
}

/**
 * 신규 SURVEY 계약에서 고객이 확정한 실제 전환 목적지만 href로 승격한다.
 * surveyBrief가 없는 기존 payload는 undefined라 기존 앵커 계산을 그대로 탄다.
 */
export function conversionHrefForSurvey(survey: SurveyInput): string | undefined {
  return resolveConversionDestination(survey)?.href;
}
