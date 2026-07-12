/**
 * [Q7] Premium 영상 컨셉 레지스트리 — video-hero 선택 시 "어떤 영상이 흐르면 좋을까요?" 3컨셉.
 * 이 화면은 생성 트리거가 아니다(Veo 미호출) — 선택된 conceptId만 사이트(motion.videoConceptId)에
 * 저장되고, 실제 생성 시 Veo 프롬프트 빌더(heroVideoContext)가 promptSeed를 소비한다.
 * promptSeed는 영어·hex('#') 금지(이미지/영상 모델 각인 아티팩트 방지 규칙 재사용).
 */
import type { PurposeGroup } from '@/lib/data/purpose-taxonomy';

export interface VideoConcept {
  id: string;
  label: string;
  description: string;
  /** Veo 프롬프트 시드(영어, '#' 금지) — 카메라·무드 방향 */
  promptSeed: string;
}

export const VIDEO_CONCEPTS = {
  serve: [
    {
      id: 'space-mood',
      label: '공간의 무드',
      description: '매장 분위기를 천천히 훑는 느낌 — 조명과 공기가 전해져요',
      promptSeed: 'slow cinematic pan across a warm interior space, ambient lighting, gentle depth of field',
    },
    {
      id: 'signature-closeup',
      label: '시그니처 클로즈업',
      description: '대표 메뉴·시술의 디테일이 살아나요',
      promptSeed: 'macro close-up of the signature item, soft steam or subtle texture motion, shallow focus',
    },
    {
      id: 'street-time',
      label: '거리의 시간',
      description: '가게 밖 풍경과 시간의 흐름 — 동네의 온기',
      promptSeed: 'exterior storefront scene with soft passing light, gentle time-lapse feel, warm dusk tones',
    },
  ],
  sell: [
    {
      id: 'product-closeup',
      label: '제품 클로즈업',
      description: '제품의 결·소재가 돋보이는 느낌',
      promptSeed: 'slow rotating close-up of the product, studio lighting, premium material texture',
    },
    {
      id: 'unboxing-detail',
      label: '손끝의 디테일',
      description: '포장을 열고 매만지는 손 — 갖고 싶어지는 순간',
      promptSeed: 'hands gently unboxing and touching the product, soft natural light, intimate framing',
    },
    {
      id: 'lifestyle-cut',
      label: '일상 속 한 컷',
      description: '제품이 쓰이는 실제 장면 — 생활에 스며드는 느낌',
      promptSeed: 'lifestyle scene of the product in everyday use, candid framing, airy daylight mood',
    },
  ],
  promote: [
    {
      id: 'people-at-work',
      label: '일하는 순간',
      description: '집중하는 사람들의 손과 표정 — 신뢰가 생겨요',
      promptSeed: 'people focused at work, hands and expressions, cinematic office lighting, subtle motion',
    },
    {
      id: 'office-mood',
      label: '공간과 태도',
      description: '사무실·작업 공간의 정돈된 무드',
      promptSeed: 'slow dolly through a refined workspace, clean lines, morning light through windows',
    },
    {
      id: 'city-flow',
      label: '도시의 흐름',
      description: '도시와 사람의 움직임 — 스케일이 느껴져요',
      promptSeed: 'city skyline and flowing crowds, gentle time-lapse feel, blue hour tones',
    },
  ],
  content: [
    {
      id: 'learning-moment',
      label: '배움의 순간',
      description: '몰입한 얼굴과 필기하는 손 — 성장의 장면',
      promptSeed: 'students immersed in learning, notebooks and soft window light, calm cinematic mood',
    },
    {
      id: 'hands-craft',
      label: '손끝의 기록',
      description: '만들고 쓰는 손의 클로즈업 — 정성이 보여요',
      promptSeed: 'close-up of hands writing or crafting, warm desk lamp light, shallow depth of field',
    },
    {
      id: 'community-space',
      label: '함께하는 공간',
      description: '모여 앉은 사람들의 온기 — 소속감이 전해져요',
      promptSeed: 'people gathered in a cozy shared space, warm tones, gentle handheld cinematic feel',
    },
  ],
} as const satisfies Record<PurposeGroup, readonly VideoConcept[]>;

/** 목적 그룹의 컨셉 3종 (UI 노출용) */
export function videoConceptsForGroup(group: PurposeGroup): readonly VideoConcept[] {
  return VIDEO_CONCEPTS[group];
}

/** conceptId → 컨셉 (전 그룹 탐색). 미지 id는 undefined — sanitize/프롬프트 빌더가 무시 */
export function findVideoConcept(id: string | undefined): VideoConcept | undefined {
  if (!id) return undefined;
  for (const list of Object.values(VIDEO_CONCEPTS)) {
    const hit = list.find((c) => c.id === id);
    if (hit) return hit;
  }
  return undefined;
}
