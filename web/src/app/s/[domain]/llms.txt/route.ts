/**
 * Optional machine-readable site outline.
 *
 * This is provided as a convenience for tools that voluntarily consume the
 * emerging format. It is not treated as a ranking/indexing signal and does not
 * replace crawlable HTML, robots policy, sitemaps, or structured data.
 */
import { getDataServices } from '@/lib/data';

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

  // [v4 Phase 3] 페이지 단위 구성 — 각 페이지 제목·URL·섹션 목록
  lines.push('## 페이지');
  for (const page of config.pages) {
    const url = page.slug === '' ? base : `${base}/${page.slug}`;
    lines.push('', `### ${page.title} (${url})`);
    for (const s of page.sections.filter((sec) => !sec.hidden)) {
      lines.push(`- ${s.name}`);
    }
  }

  if (info) {
    lines.push('', '## 연락처');
    if (info.phone) lines.push(`- 전화: ${info.phone}`);
    if (info.address) lines.push(`- 주소: ${info.address}`);
    if (info.email) lines.push(`- 이메일: ${info.email}`);
  }

  // [v4 Phase 3] 전체 페이지 링크
  lines.push('', `## 링크`);
  for (const page of config.pages) {
    const url = page.slug === '' ? base : `${base}/${page.slug}`;
    lines.push(`- ${page.title}: ${url}`);
  }

  return new Response(lines.join('\n') + '\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
