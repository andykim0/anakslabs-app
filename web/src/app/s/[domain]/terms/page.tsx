/**
 * [§6] GET /s/[domain]/terms — 이용약관 (고정 템플릿 + 사업자 정보 치환).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDataServices } from '@/lib/data';
import { termsOfService } from '@/lib/legal/templates';
import { LegalDocView } from '../LegalDocView';

export const dynamic = 'force-dynamic';

const loadTenant = cache(async (rawDomain: string) => {
  let domain: string;
  try {
    domain = decodeURIComponent(rawDomain).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!domain) return null;
  const site = await getDataServices().sites.getByDomain(domain);
  if (!site?.siteConfig) return null;
  const client = await getDataServices().clients.getById(site.clientId);
  return { site, businessInfo: client?.businessInfo ?? null };
});

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const tenant = await loadTenant(domain);
  return { title: `이용약관 · ${tenant?.site.name ?? '사이트'}`, robots: { index: false } };
}

export default async function TermsPage({ params }: Props) {
  const { domain } = await params;
  const tenant = await loadTenant(domain);
  if (!tenant?.businessInfo) notFound();

  const doc = termsOfService(tenant.businessInfo);
  return <LegalDocView doc={doc} theme={tenant.site.siteConfig!.theme} info={tenant.businessInfo} />;
}
