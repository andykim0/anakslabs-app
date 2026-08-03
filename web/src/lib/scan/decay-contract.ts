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
  'This reference score reports detected maintenance signals. A score of 100 means no listed signals were detected; it does not guarantee search performance.';
