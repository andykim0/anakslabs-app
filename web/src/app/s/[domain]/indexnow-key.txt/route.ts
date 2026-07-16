import { getDataServices } from '@/lib/data';
import { indexNowKeyForHost } from '@/lib/seo/indexnow';

type Ctx = { params: Promise<{ domain: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  const { domain } = await params;
  let host: string;
  try {
    host = decodeURIComponent(domain).trim().toLowerCase().replace(/\.$/, '');
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const site = await getDataServices().sites.getByDomain(host);
  const key = indexNowKeyForHost(host);
  if (!site?.siteConfig || site.status === 'suspended' || !key) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(`${key}\n`, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  });
}
