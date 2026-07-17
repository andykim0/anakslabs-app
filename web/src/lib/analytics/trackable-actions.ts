/**
 * URLs that represent a completed, trackable visitor action.
 *
 * Keep this registry shared by onboarding validation and the public beacon so
 * a CTA can never be accepted as "예약" while the production runtime treats it
 * as an ordinary link. Labels, goals, section anchors, and data attributes are
 * intentionally not authority: only the actual href is classified.
 */

export const RESERVATION_HOSTS = [
  'booking.naver.com',
  'pf.kakao.com',
  'baemin.com',
  'baemin.me',
  'yogiyo.co.kr',
  'catchtable.co.kr',
  'tabling.co.kr',
] as const;

export const DIRECTIONS_HOSTS = [
  'map.naver.com',
  'map.kakao.com',
  'maps.google.com',
  'maps.app.goo.gl',
] as const;

export type TrackableLinkAction = 'tel' | 'reserve' | 'directions';

export function isHostOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isReservationUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return RESERVATION_HOSTS.some((domain) => isHostOrSubdomain(hostname, domain)) ||
    (isHostOrSubdomain(hostname, 'place.naver.com') &&
      /\/(?:booking|reserve)(?:\/|$)/i.test(url.pathname));
}

function isDirectionsUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return DIRECTIONS_HOSTS.some((domain) => isHostOrSubdomain(hostname, domain)) ||
    (/^(?:.+\.)?google\.[a-z.]+$/.test(hostname) && url.pathname.startsWith('/maps'));
}

/** Classify the real href only. Internal anchors and ordinary links return null. */
export function classifyTrackableHref(rawHref: string, baseUrl: string): TrackableLinkAction | null {
  try {
    const url = new URL(rawHref, baseUrl);
    if (url.protocol === 'tel:') return 'tel';
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (isDirectionsUrl(url)) return 'directions';
    if (isReservationUrl(url)) return 'reserve';
    return null;
  } catch {
    return null;
  }
}

/**
 * New reservation CTAs are narrower than the read-time classifier: only HTTPS
 * URLs on the same finite registry may enter a newly generated SiteConfig.
 */
export function isRecognizedReservationUrl(rawHref: string): boolean {
  try {
    const url = new URL(rawHref.trim());
    return url.protocol === 'https:' && isReservationUrl(url);
  } catch {
    return false;
  }
}

/** A verified BusinessInfo phone becomes a dial action without altering its label. */
export function businessPhoneHref(phone: string): string | undefined {
  const normalized = phone.trim().replace(/[()\s-]/g, '');
  return /^\+?\d{8,15}$/.test(normalized) ? `tel:${normalized}` : undefined;
}

/** Deterministic, HTTPS map search for a verified BusinessInfo address. */
export function businessDirectionsHref(address: string): string | undefined {
  const normalized = address.trim();
  if (!normalized || normalized.length > 300) return undefined;
  return `https://map.naver.com/p/search/${encodeURIComponent(normalized)}`;
}
