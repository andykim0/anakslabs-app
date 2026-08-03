import 'server-only';

import { assertPublicHttpUrl } from './ssrf';
import type { SocialLinkObservation } from './social-links';

const SOCIAL_PROBE_TIMEOUT_MS = 3_000;
const SOCIAL_PROBE_UA =
  'Mozilla/5.0 (compatible; AnaksLabsCrawler/1.0; +https://anakslabs.com/privacy; contact=help@anakslabs.com)';

export async function probeSocialLinks(
  urls: readonly string[],
): Promise<SocialLinkObservation[]> {
  const observations: SocialLinkObservation[] = [];
  for (const rawUrl of urls.slice(0, 5)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SOCIAL_PROBE_TIMEOUT_MS);
    try {
      const url = await assertPublicHttpUrl(rawUrl);
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'user-agent': SOCIAL_PROBE_UA,
          accept: 'text/html,*/*;q=0.5',
        },
      });
      await response.body?.cancel().catch(() => undefined);
      const status = response.status;
      observations.push({
        url: url.toString(),
        status: status === 404 || status === 410
          ? 'dead'
          : status >= 200 && status < 400
            ? 'alive'
            : 'unknown',
        httpStatus: status,
      });
    } catch {
      observations.push({ url: rawUrl, status: 'unknown', httpStatus: null });
    } finally {
      clearTimeout(timeout);
    }
  }
  return observations;
}
