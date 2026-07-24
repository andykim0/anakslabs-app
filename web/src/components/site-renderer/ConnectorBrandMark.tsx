import { isDarkColor } from '@/lib/design/quality-standards';
import type { SiteConnector } from '@/lib/connectors/types';

type BrandConnectorId = Exclude<SiteConnector['id'], 'tel'>;

/**
 * 확인 필요 요약 — 법률 자문이 아니며 출시 전 각사 최신 가이드의 최종 확인 대상이다.
 *
 * - NAVER 예약: https://www.navercorp.com/company/brandGuide 의 공식 ZIP 원본.
 *   형태·비율·색·효과를 바꾸지 않고, 밝은 카드에는 Green, 어두운 카드에는 제공된 White를 쓴다.
 *   제휴·보증을 암시하지 않고 해당 NAVER 서비스 목적지 식별에만 사용한다.
 * - NAVER 지도: https://map.naver.com/ 이 배포하는 공식 앱 아이콘
 *   (https://ssl.pstatic.net/static/maps/assets/icons/android-icon-192x192.png).
 *   원본 픽셀을 수정하지 않고 길찾기 목적지 식별에만 사용한다. 서비스 아이콘의 상업 사용 조건은
 *   NAVER 일반 브랜드 가이드와 함께 최종 확인한다.
 * - 카카오 상담: https://developers.kakao.com/tool/social-plugin/channel/chat 의
 *   "아이콘 다운로드" 공식 1:1 채팅 버튼. 원본 노랑·검정·흰색과 여백을 그대로 유지한다.
 * - Instagram: https://about.instagram.com/brand 의 공식 Gradient/White glyph 원본.
 *   프로필 링크 식별에만 쓰며, Instagram 약관이 요구하는 Brand Guidelines 허용 범위를 최종 확인한다.
 *
 * PNG만 제공된 공식 원본은 같은 폴더의 로컬 SVG가 원본 비율로 감쌀 뿐이다.
 * CSS filter, mask, currentColor, 임의 fill을 적용하지 않아 DNA 색이 브랜드 마크에 침투하지 않는다.
 */
const BRAND_ASSETS = {
  'kakao-channel': {
    light: '/brand/connectors/kakao-channel.svg',
    dark: '/brand/connectors/kakao-channel.svg',
    width: 104,
    height: 48,
    variant: 'full-color',
  },
  'naver-booking': {
    light: '/brand/connectors/naver-logotype-green.svg',
    dark: '/brand/connectors/naver-logotype-white.svg',
    width: 94,
    height: 18,
    variant: 'adaptive-official',
  },
  'naver-map': {
    light: '/brand/connectors/naver-map.svg',
    dark: '/brand/connectors/naver-map.svg',
    width: 48,
    height: 48,
    variant: 'full-color',
  },
  instagram: {
    light: '/brand/connectors/instagram-glyph-gradient.svg',
    dark: '/brand/connectors/instagram-glyph-white.svg',
    width: 44,
    height: 44,
    variant: 'adaptive-official',
  },
} as const satisfies Record<
  BrandConnectorId,
  {
    light: string;
    dark: string;
    width: number;
    height: number;
    variant: 'adaptive-official' | 'full-color';
  }
>;

export function ConnectorBrandMark({
  connectorId,
  surface,
}: {
  connectorId: BrandConnectorId;
  surface: string;
}) {
  const dark = isDarkColor(surface);
  const asset = BRAND_ASSETS[connectorId];
  return (
    <span
      className={`anaks-connector__brand anaks-connector__brand--${connectorId}`}
      data-connector-brand={connectorId}
      data-connector-brand-tone={dark ? 'dark' : 'light'}
      data-connector-brand-variant={asset.variant}
      aria-hidden="true"
    >
      {/* Static export must keep the official local asset byte-for-byte without an image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="anaks-connector__brand-image"
        src={dark ? asset.dark : asset.light}
        width={asset.width}
        height={asset.height}
        alt=""
        decoding="async"
      />
    </span>
  );
}
