/**
 * [v3 Phase 7] 테넌트별 llms.txt — 생성형 AI 크롤러에 사이트 요약·핵심 정보를 직접 전달(GEO).
 * proxy가 {host}/llms.txt → /s/{host}/llms.txt 로 rewrite.
 */
import { getDataServices } from '@/lib/data';
import { allSections } from '@/lib/types/site';

type Ctx = { params: Promise<{ domain: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { domain } = await params;
  const host = decodeURIComponent(domain).trim().toLowerCase();
  const site = await getDataServices().sites.getByDomain(host);

  if (!site?.siteConfig || site.status === 'suspended') {
    return new Response('Not found', { status: 404 });
  }

  const config = site.siteConfig;
  const info = config.businessInfo;
  const name = info?.businessName?.trim() || config.meta.title || site.name;
  const base = `https://${host}`;

  const lines = [`# ${name}`, ''];
  if (config.meta.description) lines.push(`> ${config.meta.description}`, '');
  lines.push('## 구성');
  for (const s of allSections(config).filter((sec) => !sec.hidden)) {
    lines.push(`- ${s.name}`);
  }
  if (info) {
    lines.push('', '## 연락처');
    if (info.phone) lines.push(`- 전화: ${info.phone}`);
    if (info.address) lines.push(`- 주소: ${info.address}`);
    if (info.email) lines.push(`- 이메일: ${info.email}`);
  }
  lines.push('', `## 링크`, `- 홈: ${base}`);

  return new Response(lines.join('\n') + '\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
