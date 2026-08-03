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
      label: 'Mood of the space',
      description: 'A slow view through the atmosphere, light, and air of the space',
      promptSeed: 'slow restrained camera drift, warm ambient lighting, gentle depth of field',
    },
    {
      id: 'signature-closeup',
      label: 'Detail close-up',
      description: 'A quiet close look at the texture and light in the current image',
      promptSeed: 'restrained macro framing, subtle existing texture motion, shallow focus, no invented elements',
    },
    {
      id: 'street-time',
      label: 'Time on the street',
      description: 'The exterior and passage of time around the neighborhood',
      promptSeed: 'soft passing light, gentle temporal shift, warm dusk color grade, restrained camera movement',
    },
  ],
  promote: [
    {
      id: 'people-at-work',
      label: 'Focused rhythm',
      description: 'Subtle movement that supports focus and trust in the current scene',
      promptSeed: 'measured documentary camera drift, focused professional atmosphere, soft directional light',
    },
    {
      id: 'office-mood',
      label: 'Space and practice',
      description: 'A composed view of the office or working space',
      promptSeed: 'slow dolly movement, refined orderly atmosphere, clean lines, soft morning light',
    },
    {
      id: 'city-flow',
      label: 'Urban flow',
      description: 'A sense of movement, time, and scale in the current scene',
      promptSeed: 'gentle sense of flow and scale, restrained time shift, blue hour color grade',
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
