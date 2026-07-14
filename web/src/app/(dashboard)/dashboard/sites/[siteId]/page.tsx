import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { SiteDetail } from '@/components/dashboard/site-detail';

export const metadata: Metadata = { title: '사이트 상세 — 아낙스랩스' };

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  return <SiteDetail siteId={siteId} tier={client.tier} />;
}
