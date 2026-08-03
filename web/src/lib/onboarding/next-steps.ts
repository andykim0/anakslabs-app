/**
 * [F4] 생성 후 가이드 체크리스트 — 설문 맥락 기반 결정적 액션 카드(3~5개).
 * 설문은 "정보 수집"에 집중하고, "무엇을 넣을지"(예약 링크·사진 교체 등 '설정')는 생성 후로 미룬다.
 * 각 카드는 에디터의 해당 위치로 딥링크(focus 힌트). 완료 체크 상태는 컴포넌트가 localStorage에 저장.
 *
 * 순수 함수 — node:test로 직접 검증 가능. NextStepsChecklist가 소비.
 */
import type { SurveyInput } from '@/lib/types/domain';

export interface NextStep {
  id: string;
  title: string;
  description: string;
  /** 에디터 딥링크 힌트(?focus=) — 에디터가 해당 영역으로 유도(미해석 시 무해) */
  focus: string;
}

interface Candidate {
  step: NextStep;
  when: (s: SurveyInput) => boolean;
}

// 우선순위 순서. 중요(발행 게이트)·항상형을 앞에 둬 slice(0,5)에서 잘리지 않게 한다.
const CANDIDATES: Candidate[] = [
  {
    step: {
      id: 'business-info',
      focus: 'business-info',
      title: 'Add business details?',
      description: 'Publishing requires a legal business name, representative, and contact details. Add them now to keep publishing ready.',
    },
    when: () => true,
  },
  {
    step: {
      id: 'photos',
      focus: 'images',
      title: 'Replace these with real photos?',
      description: 'Replace generated images with real photos of the business and its work to build trust.',
    },
    when: (s) => (s.storePhotoUrls?.length ?? 0) < 3,
  },
  {
    step: {
      id: 'reservation',
      focus: 'contact',
      title: 'Add booking and contact links?',
      description: 'Connect a verified booking URL, phone number, or messaging channel so visitors can act.',
    },
    when: (s) =>
      s.purposeId === 'local_store' ||
      s.purposeId === 'booking_service' ||
      s.sectionPlan.some((i) => i.type === 'contact'),
  },
  {
    step: {
      id: 'copy',
      focus: 'text',
      title: 'Make the copy sound like you?',
      description: 'Replace draft copy with the business’s real introduction and strengths.',
    },
    when: () => true,
  },
  {
    step: {
      id: 'menu',
      focus: 'menu',
      title: 'Complete the offerings?',
      description: 'Add verified names and prices, then put the most important offerings first.',
    },
    when: (s) => s.sectionPlan.some((i) => i.type === 'menu' || i.type === 'pricing'),
  },
  {
    step: {
      id: 'layout',
      focus: 'layout',
      title: 'Fine-tune the layout?',
      description: 'Adjust section order, spacing, and size to finish the site.',
    },
    when: () => true,
  },
];

/** 설문 → 액션 카드 3~5개(결정적). 항상형(business-info·copy·layout)이 최소 3을 보장. */
export function buildNextSteps(survey: SurveyInput): NextStep[] {
  return CANDIDATES.filter((c) => c.when(survey))
    .map((c) => c.step)
    .slice(0, 5);
}

/** [F4] 체크리스트 완료 상태 localStorage 키 */
export function checklistStorageKey(siteId: string): string {
  return `anaks:onboarding:checklist:${siteId}`;
}
