/**
 * [§6] GET /s/[domain]/privacy — 개인정보처리방침 (고정 템플릿 + 사업자 정보 치환).
 * 서브도메인 서빙 시 proxy가 /privacy → /s/[domain]/privacy로 rewrite. 전용 라우트가 catch-all보다 우선.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDataServices } from '@/lib/data';
import { UsTenantLegalDocumentsPendingError, usPrivacyPolicy } from '@/lib/legal/templates';
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
  return { site, businessInfo: site.siteConfig.businessInfo ?? null };
});

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const tenant = await loadTenant(domain);
  return { title: `Privacy · ${tenant?.site.name ?? 'Site'}`, robots: { index: false } };
}

export default async function PrivacyPage({ params }: Props) {
  const { domain } = await params;
  const tenant = await loadTenant(domain);
  if (!tenant?.businessInfo) notFound();

  let doc: ReturnType<typeof usPrivacyPolicy>;
  try {
    doc = usPrivacyPolicy(tenant.site.siteConfig!);
  } catch (error) {
    if (error instanceof UsTenantLegalDocumentsPendingError) notFound();
    throw error;
  }
  return <LegalDocView doc={doc} theme={tenant.site.siteConfig!.theme} info={tenant.businessInfo} />;
}
