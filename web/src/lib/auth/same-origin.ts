/**
 * Same-origin check for state-changing auth requests.
 *
 * The session cookie alone authorizes /api/auth/set-password, so without this a page on another
 * origin could post a new password for whoever is signed in. Browsers send `Sec-Fetch-Site` on
 * modern requests and `Origin` on every cross-origin POST, so a request carrying neither is not
 * a browser form submission we need to serve.
 *
 * The comparison is against the `host` header, following the rule proxy.ts sets out: forwarded
 * host headers are attacker-controllable and are not trusted. `request.nextUrl.origin` is not
 * used here either — behind a proxy it can disagree with the host the browser actually addressed,
 * which would turn a security comparison into a source of false verdicts.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  if (headers.get('sec-fetch-site') === 'same-origin') return true;

  const origin = headers.get('origin');
  const host = headers.get('host');
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
