# A browser for the consented full-transfer crawl

The consented crawl (`/admin/us-demos` → "Full-transfer demo under recorded verbal consent") renders each
page in a real browser before extracting from it: `web/src/lib/crawl/consented-renderer.ts` needs
Chrome for the scroll pass, the image settle, and the rendered-dimension measurements the artifact
is not allowed to be created without.

Until now that browser could only be a local executable — `chromeExecutablePath()` probing
`ANAKS_CHROME_EXECUTABLE_PATH`, `CHROME_PATH`, and four well-known install paths. A serverless
runtime has none of them, so on Vercel every consented collection failed with a 503 `RENDER_FAILED`
and a Korean sentence that read like something to retry. It was not: nothing on that host was ever
going to have Chrome. Non-consented collection is unaffected — it never renders.

## Two ways to get a browser

| `ANAKS_BROWSER_WS_ENDPOINT` | What happens | End of session |
|---|---|---|
| unset / blank | `puppeteer.launch({ executablePath: chromeExecutablePath() })` | `browser.close()` |
| set | `puppeteer.connect({ browserWSEndpoint })` | `browser.disconnect()` |

`disconnect()`, not `close()`, is the whole point of the second row: a connected browser is shared
with whatever else is pointed at that endpoint, and closing it at the end of one collection would
end every other in-flight one.

Set it to a Chrome DevTools WebSocket URL — a browserless-style service, or a Chrome you run
yourself with `--remote-debugging-port` reachable from the deployment. `acceptInsecureCerts` is
passed on both paths, so the pilot TLS exception behaves the same either way.

The value is a control-plane secret in the same class as a database URL: anyone who can reach that
endpoint drives a browser as this server. Keep it on the private network the deployment already
has, never in `NEXT_PUBLIC_*`, and never in the client bundle — the browser is not told what the
cap or the endpoint is (see below).

## The 300-second caveat

`web/src/app/api/admin/crawl/route.ts` declares `maxDuration = 300`, and the crawl measures itself
against `DESIGNATED_CRAWL_POLICY.wallClockBudgetMs = 240_000` so it stops on its own terms with an
artifact in hand. A remote browser adds a network hop per page on top of the one-request-per-second
floor. If a prospect's site starts hitting the wall-clock budget after the endpoint is introduced,
lower `US_CONSENTED_CRAWL_MAX_PAGES` rather than raising `maxDuration` — 300s is the platform
ceiling on that plan, and a crawl that returns fewer pages is worth more than one that returns a
timeout.

Two related notes for whoever tunes this:

- `US_CONSENTED_CRAWL_MAX_PAGES` is server-side only. The admin console's progress panel therefore
  says "the practice's public pages", with no number: the browser cannot read the variable, and a
  number taken from the compiled default (100) would be a number the server may not be using.
- One collection is one POST that returns after the last page. There is no per-page progress to
  stream, so the panel shows elapsed seconds and the honest one-to-three-minute expectation
  instead of a fake counter.

## When it is wrong

`RENDER_FAILED` from `web/src/lib/crawl/crawler.ts` now says, in English, that the server has no
browser and names `ANAKS_BROWSER_WS_ENDPOINT`, with the underlying error appended:

- `US_CONSENTED_RENDERER_EXECUTABLE_NOT_FOUND` — `ANAKS_CHROME_EXECUTABLE_PATH`/`CHROME_PATH` is
  set but points at nothing.
- `US_CONSENTED_RENDERER_UNAVAILABLE` — no configured path and no Chrome at any well-known
  location. This is the serverless case; set the endpoint.
- A connect-time error (`ECONNREFUSED`, a 4xx from the browser service) — the endpoint is set but
  unreachable or unauthorized.

The message appears under "Collect and Diagnose" in the console, next to the button that produced
it.

Covered by `web/src/lib/crawl/__tests__/consented-renderer.test.ts`, which injects the
connect/launch pair and never starts a browser.
