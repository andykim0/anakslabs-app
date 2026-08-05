import type { ExtraFeatureSelection, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import {
  businessDirectionsHref,
  businessPhoneHref,
  isRecognizedChatUrl,
  isRecognizedReservationUrl,
} from '@/lib/analytics/trackable-actions';
import { resolvePublicContact } from '@/lib/seo/public-contact';
import { resolveConversionDestination } from '@/lib/onboarding/site-goal';
import { CONNECTOR_CATALOG } from './catalog';
import {
  CONNECTOR_CATALOG_VERSION,
  type SiteConnector,
  type SiteConnectorManifest,
} from './types';

function firstSns(
  survey: SurveyInput,
  extras: ExtraFeatureSelection | undefined,
  kind: 'instagram' | 'kakao_channel',
): string | undefined {
  const explicit = extras?.snsLinks?.find((link) => link.kind === kind)?.url.trim();
  if (explicit) return explicit;
  const presenceKind = kind === 'instagram' ? 'instagram' : undefined;
  return presenceKind
    ? survey.existingPresence?.find((item) => item.kind === presenceKind)?.url.trim()
    : undefined;
}

function instagramUsername(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || !/(^|\.)instagram\.com$/iu.test(url.hostname)) return undefined;
    const [username] = url.pathname.split('/').filter(Boolean);
    return username && /^[A-Za-z0-9._]{1,30}$/u.test(username) ? username : undefined;
  } catch {
    return undefined;
  }
}

function kakaoChannelId(rawUrl: string): string | undefined {
  if (!isRecognizedChatUrl(rawUrl)) return undefined;
  try {
    return new URL(rawUrl).pathname.split('/').filter(Boolean)[0];
  } catch {
    return undefined;
  }
}

function connectorManifest(
  config: SiteConfig,
  survey: SurveyInput,
  extras: ExtraFeatureSelection,
): SiteConnectorManifest | undefined {
  const contact = resolvePublicContact(config);
  const destination = resolveConversionDestination(survey);
  const items: SiteConnector[] = [];

  const phoneHref = businessPhoneHref(contact?.phone ?? '');
  if (phoneHref && contact?.phone) {
    items.push({
      id: 'tel',
      label: 'Call',
      href: phoneHref,
      displayPhone: contact.phone,
    });
  }

  const kakaoUrl = destination?.kind === 'messenger'
    ? destination.href
    : firstSns(survey, extras, 'kakao_channel');
  const channelId = kakaoUrl ? kakaoChannelId(kakaoUrl) : undefined;
  if (kakaoUrl && channelId) {
    items.push({
      id: 'kakao-channel',
      label: 'Message',
      href: kakaoUrl,
      channelId,
    });
  }

  const bookingUrl = destination?.kind === 'reservation'
    ? destination.href
    : extras.reservationLink?.url;
  if (bookingUrl && isRecognizedReservationUrl(bookingUrl)) {
    items.push({
      id: 'naver-booking',
      label: 'Book an appointment',
      href: bookingUrl,
    });
  }

  const directionsHref = businessDirectionsHref(contact?.address ?? '', config.meta.locale);
  if (directionsHref && contact?.address) {
    items.push(config.meta.locale === 'en-US'
      ? {
          id: 'map',
          label: 'Directions',
          href: directionsHref,
          address: contact.address,
        }
      : {
          id: 'naver-map',
          label: 'Directions',
          href: directionsHref,
          address: contact.address,
        });
  }

  const instagramUrl = firstSns(survey, extras, 'instagram');
  const username = instagramUrl ? instagramUsername(instagramUrl) : undefined;
  if (instagramUrl && username) {
    items.push({
      id: 'instagram',
      label: 'Instagram',
      href: instagramUrl,
      username,
    });
  }

  if (!items.length) return undefined;
  const priority = new Map(CONNECTOR_CATALOG.map((entry) => [entry.id, entry.mobilePriority]));
  items.sort((a, b) => (priority.get(a.id) ?? 99) - (priority.get(b.id) ?? 99));
  return { catalogVersion: CONNECTOR_CATALOG_VERSION, items };
}

/**
 * 신규 온보딩이 catalogVersion을 명시한 경우에만 manifest를 pin한다.
 * 저장된 manifest는 이후 환경 플래그와 무관하게 렌더하고, 필드가 없는 기존 config는 바이트 동일하다.
 */
export function applyConnectorManifest(
  input: SiteConfig,
  survey: SurveyInput,
  extras: ExtraFeatureSelection | undefined,
): SiteConfig {
  if (extras?.connectorCatalogVersion !== CONNECTOR_CATALOG_VERSION) return input;
  const connectors = connectorManifest(input, survey, extras);
  return connectors ? { ...input, connectors } : input;
}

/** 에디터 클라이언트가 서버 카탈로그 manifest를 추가·변조·삭제하지 못하게 한다. */
export function preserveServerConnectorManifest(
  incoming: SiteConfig,
  persisted: SiteConfig | null | undefined,
): SiteConfig {
  const next = { ...incoming };
  delete next.connectors;
  return persisted?.connectors ? { ...next, connectors: persisted.connectors } : next;
}

/** 관리자 서버 권위 경로만 사용: 초안·발행본의 manifest를 명시적으로 교체한다. */
export function withServerConnectorManifest(
  config: SiteConfig,
  manifest: SiteConnectorManifest | undefined,
): SiteConfig {
  const next = structuredClone(config);
  if (manifest) next.connectors = structuredClone(manifest);
  else delete next.connectors;
  return next;
}
