import { isSafeHref } from '@/lib/safe-url';

/** Provider-neutral US booking links must be absolute HTTPS URLs safe for href rendering. */
export function isAcceptableUsBookingUrl(rawHref: string): boolean {
  const href = rawHref.trim();
  if (!isSafeHref(href)) return false;
  try {
    return new URL(href).protocol === 'https:';
  } catch {
    return false;
  }
}
