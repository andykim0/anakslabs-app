import type { ScanIssue } from '@/lib/data/types';

export const CLIENT_RENDER_RISK_CODE = 'seo_client_rendered_content';

export const HTML_BASIS_NOTICE =
  'This diagnostic reads the HTML sent in the first server response. Google may process additional content after JavaScript runs, so a client-rendered site can score lower here than its final screen suggests.';

export const CLIENT_RENDER_RISK_NOTICE =
  'This site appears to render its content with JavaScript. The first HTML response contains little readable body text, so the score may be lower than the final screen suggests.';

export function hasClientRenderRisk(issues: readonly Pick<ScanIssue, 'code'>[]): boolean {
  return issues.some((issue) => issue.code === CLIENT_RENDER_RISK_CODE);
}
