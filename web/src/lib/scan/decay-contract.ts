export const DECAY_SLOT_CAPACITY = {
  secureConnection: 20,
  mobileReadiness: 15,
  structuredMeaning: 20,
  responseSpeed: 15,
  freshness: 15,
  legacyTechnology: 10,
  socialLinks: 5,
} as const;

export type DecaySlot = keyof typeof DECAY_SLOT_CAPACITY;

export interface DecaySignal {
  code: string;
  slot: DecaySlot;
  weight: number;
  label: string;
  detail: string;
}

export interface DecayScoreResult {
  /** 100에서 탐지된 개선 필요 신호를 뺀 별도 advisory 점수다. */
  score: number;
  signals: DecaySignal[];
  observedAt: string;
  disclosure: string;
}

export const DECAY_SCORE_DISCLOSURE =
  '개선 필요 신호를 점검한 참고 점수입니다. 100점은 탐지된 신호가 없다는 뜻이며 검색 성과를 보장하지 않습니다.';
