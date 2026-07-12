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
      title: '사업자 정보를 입력할까요?',
      description: '발행하려면 상호·대표자·연락처 등 사업자 정보가 필요해요. 지금 입력해두면 바로 발행할 수 있어요.',
    },
    when: () => true,
  },
  {
    step: {
      id: 'photos',
      focus: 'images',
      title: '실제 사진으로 바꿔볼까요?',
      description: 'AI가 넣은 이미지를 직접 촬영한 가게·메뉴 사진으로 교체하면 신뢰도가 크게 올라가요.',
    },
    when: (s) => (s.storePhotoUrls?.length ?? 0) < 3,
  },
  {
    step: {
      id: 'reservation',
      focus: 'contact',
      title: '예약·문의 버튼을 추가할까요?',
      description: '네이버예약·전화·카카오 채널 링크를 버튼으로 연결해 실제 예약을 받아보세요.',
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
      title: '문구를 내 목소리로 바꿀까요?',
      description: 'AI 초안 카피를 실제 소개·강점으로 다듬으면 사이트가 살아나요.',
    },
    when: () => true,
  },
  {
    step: {
      id: 'menu',
      focus: 'menu',
      title: '메뉴판을 다듬을까요?',
      description: '대표 메뉴·가격을 실제 정보로 채우고 순서를 정리해 보세요.',
    },
    when: (s) => s.sectionPlan.some((i) => i.type === 'menu' || i.type === 'pricing'),
  },
  {
    step: {
      id: 'layout',
      focus: 'layout',
      title: '구성을 미세 조정할까요?',
      description: '섹션 순서·여백·크기를 PPT처럼 자유롭게 옮겨 사이트를 마무리하세요.',
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
