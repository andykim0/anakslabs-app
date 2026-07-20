import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { listSearchRegistrations } from '@/lib/seo/search-registration-repository';
import { summarizeRegistrationAccounts } from '@/lib/seo/search-registration';
import { withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const [sites, records] = await Promise.all([
    getDataServices().sites.listAll(),
    listSearchRegistrations(),
  ]);
  const bySite = new Map(records.map((record) => [record.siteId, record]));
  const items = sites
    .filter((site) => Boolean(site.domain) && ['live', 'pending_dns'].includes(site.status))
    .map((site) => {
      const config = site.siteConfig ?? site.draftConfig;
      const record = bySite.get(site.id);
      return {
        siteId: site.id,
        siteName: site.name,
        siteUrl: `https://${site.domain}`,
        domainType: site.domainType,
        status: record?.status ?? 'pending',
        accountLabel: record?.accountLabel ?? null,
        naverVerification: record?.naverVerification ?? config?.searchVerification?.naver ?? null,
        googleVerification: record?.googleVerification ?? config?.searchVerification?.google ?? null,
        indexStatus: record?.indexStatus ?? 'unchecked',
        completedAt: record?.completedAt ?? null,
        updatedAt: record?.updatedAt ?? site.createdAt,
      };
    })
    .sort((a, b) => (a.status === b.status ? a.updatedAt.localeCompare(b.updatedAt) : a.status === 'pending' ? -1 : 1));

  return NextResponse.json({ items, accounts: summarizeRegistrationAccounts(records) });
});
