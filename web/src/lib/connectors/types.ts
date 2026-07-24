export const CONNECTOR_CATALOG_VERSION = 1 as const;

export const CONNECTOR_IDS = [
  'tel',
  'kakao-channel',
  'naver-booking',
  'naver-map',
  'instagram',
] as const;

export type ConnectorId = (typeof CONNECTOR_IDS)[number];

interface ConnectorBase {
  id: ConnectorId;
  label: string;
  href: string;
}

export interface TelConnector extends ConnectorBase {
  id: 'tel';
  displayPhone: string;
}

export interface KakaoChannelConnector extends ConnectorBase {
  id: 'kakao-channel';
  channelId: string;
}

export interface NaverBookingConnector extends ConnectorBase {
  id: 'naver-booking';
}

export interface NaverMapConnector extends ConnectorBase {
  id: 'naver-map';
  address: string;
  /** 서버가 확인한 좌표가 있을 때만 명시적 클릭 후 공식 SDK 미리보기를 허용한다. */
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface InstagramConnector extends ConnectorBase {
  id: 'instagram';
  username: string;
}

export type SiteConnector =
  | TelConnector
  | KakaoChannelConnector
  | NaverBookingConnector
  | NaverMapConnector
  | InstagramConnector;

/** 서버 카탈로그가 기록하는 additive manifest. 클라이언트 임의 embed HTML은 받지 않는다. */
export interface SiteConnectorManifest {
  catalogVersion: typeof CONNECTOR_CATALOG_VERSION;
  items: SiteConnector[];
}
