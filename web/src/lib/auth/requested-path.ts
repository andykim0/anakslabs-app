/**
 * Carries the path a signed-out visitor actually asked for, from the proxy to the layout.
 *
 * A Server Component cannot read its own pathname, which is why both app layouts hardcoded
 * `next=/dashboard` and `next=/admin` and dropped everyone on the root of their area. The proxy
 * does have `request.nextUrl`, so it annotates the forwarded request with this header — our own,
 * explicitly set, not one of Next's internal request headers.
 *
 * This module only carries the value. Deciding whether a `next` is safe to follow stays entirely
 * with `resolvePostLoginRedirect`, which the login routes already call.
 */
export const REQUESTED_PATH_HEADER = 'x-anaks-requested-path';

/** Login URL for a signed-out app request, keeping the destination they were headed for. */
export function loginUrlForRequestedPath(
  requestedPath: string | null | undefined,
  fallbackPath: string,
): string {
  // A path from anywhere but our own proxy header is not trusted to be a path at all.
  const target = requestedPath?.startsWith('/') ? requestedPath : fallbackPath;
  return `/login?next=${encodeURIComponent(target)}`;
}
