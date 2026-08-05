import type { ConnectorId } from './types';

export interface ConnectorCatalogEntry {
  id: ConnectorId;
  label: string;
  description: string;
  mobilePriority: number;
  loadStrategy: 'native' | 'interaction';
  reportLabel: string;
}

/**
 * 고객 노출 문구·로드 전략·리포트 명칭의 단일 소스.
 * 지도·카카오 SDK는 interaction 항목이라 첫 화면에 서드파티 스크립트를 싣지 않는다.
 */
export const CONNECTOR_CATALOG = [
  {
    id: 'tel',
    label: 'Call',
    description: 'Start a call directly on mobile.',
    mobilePriority: 1,
    loadStrategy: 'native',
    reportLabel: 'Call clicks',
  },
  {
    id: 'kakao-channel',
    label: 'Message',
    description: 'Continue the conversation in the connected messaging channel.',
    mobilePriority: 2,
    loadStrategy: 'interaction',
    reportLabel: 'Message clicks',
  },
  {
    id: 'naver-booking',
    label: 'Book an appointment',
    description: 'Open the verified booking destination.',
    mobilePriority: 3,
    loadStrategy: 'native',
    reportLabel: 'Booking clicks',
  },
  {
    id: 'naver-map',
    label: 'Directions',
    description: 'Review the address and open directions.',
    mobilePriority: 4,
    loadStrategy: 'interaction',
    reportLabel: 'Directions clicks',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: 'View the official profile and recent updates.',
    mobilePriority: 5,
    loadStrategy: 'interaction',
    reportLabel: 'Instagram clicks',
  },
  {
    id: 'booking',
    label: 'Book an appointment',
    description: 'Open the verified booking destination.',
    mobilePriority: 6,
    loadStrategy: 'native',
    reportLabel: 'Booking clicks',
  },
  {
    id: 'map',
    label: 'Directions',
    description: 'Open the clinic location in maps.',
    mobilePriority: 7,
    loadStrategy: 'native',
    reportLabel: 'Directions clicks',
  },
] as const satisfies readonly ConnectorCatalogEntry[];

export function connectorCatalogEntry(id: ConnectorId): ConnectorCatalogEntry {
  const entry = CONNECTOR_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown connector catalog id: ${id}`);
  return entry;
}
