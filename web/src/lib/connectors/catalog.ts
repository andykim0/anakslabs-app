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
    label: '전화 문의',
    description: '휴대폰에서 바로 전화할 수 있어요.',
    mobilePriority: 1,
    loadStrategy: 'native',
    reportLabel: '전화 클릭',
  },
  {
    id: 'kakao-channel',
    label: '카카오 상담',
    description: '카카오 채널에서 상담을 이어갈 수 있어요.',
    mobilePriority: 2,
    loadStrategy: 'interaction',
    reportLabel: '카카오 상담 클릭',
  },
  {
    id: 'naver-booking',
    label: '네이버 예약',
    description: '네이버 예약 화면으로 안전하게 이동해요.',
    mobilePriority: 3,
    loadStrategy: 'native',
    reportLabel: '예약 클릭',
  },
  {
    id: 'naver-map',
    label: '오시는 길',
    description: '주소를 확인하고 네이버 지도에서 길을 찾을 수 있어요.',
    mobilePriority: 4,
    loadStrategy: 'interaction',
    reportLabel: '길찾기 클릭',
  },
  {
    id: 'instagram',
    label: '인스타그램',
    description: '공식 계정과 최근 소식을 확인할 수 있어요.',
    mobilePriority: 5,
    loadStrategy: 'interaction',
    reportLabel: '인스타그램 클릭',
  },
] as const satisfies readonly ConnectorCatalogEntry[];

export function connectorCatalogEntry(id: ConnectorId): ConnectorCatalogEntry {
  const entry = CONNECTOR_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown connector catalog id: ${id}`);
  return entry;
}
