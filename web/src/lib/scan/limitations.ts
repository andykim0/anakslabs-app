import type { ScanIssue } from '@/lib/data/types';

export const CLIENT_RENDER_RISK_CODE = 'seo_client_rendered_content';

export const HTML_BASIS_NOTICE =
  '이 진단은 서버가 처음 보내는 HTML을 기준으로 봅니다. 네이버가 권장하는 서버 HTML 중심 방식과 같습니다. 구글은 자바스크립트 실행 뒤 내용을 더 읽을 수 있어, 자바스크립트로만 그려지는 사이트는 실제보다 낮게 나올 수 있습니다.';

export const CLIENT_RENDER_RISK_NOTICE =
  '자바스크립트로 내용을 그리는 사이트로 보입니다. 서버가 보낸 HTML에는 읽을 본문이 거의 없어 아래 점수가 실제보다 낮을 수 있습니다.';

export function hasClientRenderRisk(issues: readonly Pick<ScanIssue, 'code'>[]): boolean {
  return issues.some((issue) => issue.code === CLIENT_RENDER_RISK_CODE);
}
