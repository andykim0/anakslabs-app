export type UrlInputResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * What an operator types into a URL field, turned into a URL the API will accept.
 *
 * A bare hostname is how people write a site down, so the scheme is assumed rather than demanded.
 * Validation runs on the normalized value: rejecting "dental360grp.com" for having no scheme is
 * the field being stricter than the crawler it feeds. Only http and https survive — every other
 * scheme parses cleanly here and then fails server-side with a less obvious message.
 */
export function normalizeUrlInput(raw: string): UrlInputResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a URL.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'Enter a valid URL.' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, reason: 'Enter an http or https URL.' };
  }
  if (!url.hostname.includes('.')) {
    return { ok: false, reason: 'Enter a valid URL.' };
  }
  return { ok: true, url: url.toString() };
}
