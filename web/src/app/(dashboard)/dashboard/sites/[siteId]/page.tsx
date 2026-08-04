import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { SiteDetail } from '@/components/dashboard/site-detail';
import { aiEditEnabled } from '@/lib/product/flags';
import { getDataServices } from '@/lib/data';

const resolveOwnedSite = cache(async (siteId: string) => {
  const client = await getCurrentClient();
  if (!client) redirect('/login');
  const site = await getDataServices().sites.getById(siteId);
  if (!site || site.clientId !== client.id) notFound();
  return { client, site };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}): Promise<Metadata> {
  const { siteId } = await params;
  const { site } = await resolveOwnedSite(siteId);
  return { title: `${site.name} — Anaks Labs` };
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { client } = await resolveOwnedSite(siteId);

  return <SiteDetail siteId={siteId} tier={client.tier} aiEditAvailable={aiEditEnabled()} />;
}
