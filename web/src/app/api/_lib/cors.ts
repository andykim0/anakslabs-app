/**
 * Cross-origin access for the endpoints the static marketing site calls.
 *
 * anakslabs.com is a separate static deployment; its free check and its contact
 * form post to this app at preview.anakslabs.com. That is a cross-origin request,
 * so the browser will not hand the response to the page — nor even send the POST —
 * unless the preflight and the response carry CORS headers. A route that omits
 * them does not fail loudly: the request never arrives, and the page can only
 * report that its own check broke.
 *
 * The allowlist reflects the request's Origin rather than answering `*`, because
 * these routes accept user input. `*` would let any page on the web post a scan
 * or an inquiry through a visitor's browser. An origin outside the list gets a
 * complete answer with no Access-Control-Allow-Origin — the server does not
 * refuse it, the browser simply declines to share it with the calling page.
 *
 * Because the answer depends on Origin, every response says `Vary: Origin`;
 * without it a shared cache could hand one origin's response to another.
 */

/** Exact origins the marketing site is served from. */
const ALLOWED_ORIGINS: readonly string[] = [
  'https://anakslabs.com',
  'https://www.anakslabs.com',
];

/**
 * Local review of the static site runs off `python -m http.server` and friends,
 * whose port changes between sessions, so the port is not pinned. This matches
 * http only: an https://localhost is not what a developer's preview serves, and
 * the loopback address is not reachable from anyone else's machine.
 */
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/u;

/** Preflight cache lifetime in seconds. Browsers clamp this to their own maximum. */
const MAX_AGE_SECONDS = 86_400;

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return LOCAL_ORIGIN.test(origin);
}

/**
 * Headers for one response. `Access-Control-Allow-Origin` appears only for an
 * allowed origin; the rest are constant and harmless to send either way.
 */
export function corsHeaders(
  origin: string | null | undefined,
  methods = 'POST, OPTIONS',
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': String(MAX_AGE_SECONDS),
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin as string;
  return headers;
}

/** Adds the headers to a response that already exists, and returns the same response. */
export function applyCors<R extends Response>(
  response: R,
  origin: string | null | undefined,
  methods = 'POST, OPTIONS',
): R {
  for (const [name, value] of Object.entries(corsHeaders(origin, methods))) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * The preflight handler. `export const OPTIONS = corsPreflight()` is the whole
 * contract on a route — there is nothing to answer beyond the headers.
 */
export function corsPreflight(methods = 'POST, OPTIONS'): (request: Request) => Response {
  return (request: Request): Response =>
    new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin'), methods) });
}

/**
 * Wraps a route handler so every response it produces carries the headers.
 *
 * This sits outside `withApiHandler` on purpose: that boundary turns an unhandled
 * exception into a 500 of its own making, and a 500 the page cannot read is the
 * same outage as no response at all. Decorating the outermost layer means no
 * branch inside the route — validation, rate limit, success, crash — can forget.
 */
export function withCors<Req extends Request, Ctx = unknown>(
  handler: (request: Req, context: Ctx) => Promise<Response>,
  methods = 'POST, OPTIONS',
): (request: Req, context: Ctx) => Promise<Response> {
  return async (request, context) =>
    applyCors(await handler(request, context), request.headers.get('origin'), methods);
}
