import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { SiteDetail } from '@/components/dashboard/site-detail';
import { aiEditEnabled } from '@/lib/product/flags';

export const metadata: Metadata = { title: "Site Details — Anaks Labs" };

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  return <SiteDetail siteId={siteId} tier={client.tier} aiEditAvailable={aiEditEnabled()} />;
}
