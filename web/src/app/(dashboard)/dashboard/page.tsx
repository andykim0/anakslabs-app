import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileEdit, Globe, PencilRuler, Plus } from 'lucide-react';
import { getCurrentClient } from '@/lib/services/auth';
import { getRecentScan } from '@/lib/services/recent-scan';
import { getDataServices } from '@/lib/data';
import { ScanBanner } from '@/components/dashboard/ScanBanner';
import { SiteCard } from '@/components/dashboard/site-card';
import {
  Card,
  EDIT_TYPE_LABELS,
  EditStatusBadge,
  EmptyState,
  formatDate,
  PageHeader,
} from '@/components/dashboard/ui';
import { SITE_BUILD_SLA_COPY } from '@/lib/fulfillment-sla';
import { aiEditEnabled } from '@/lib/product/flags';

export const metadata: Metadata = { title: "My site — Anaks Labs" };

export default async function DashboardHomePage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  const services = getDataServices();
  const aiEditAvailable = aiEditEnabled();
  const [sites, editRequests, recentScan] = await Promise.all([
    services.sites.listByClient(client.id),
    aiEditAvailable ? services.editRequests.listByClient(client.id) : Promise.resolve([]),
    getRecentScan(),
  ]);

  const inProgressCount = editRequests.filter((r) =>
    ['pending', 'ai_processing', 'qa_review'].includes(r.status),
  ).length;
  const recentEdits = [...editRequests]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${client.name}`}
        description={`Check site status and editing progress at a glance. ${SITE_BUILD_SLA_COPY}`}
        actions={
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
          >
            <Plus className="h-4 w-4" />Create a new site
          </Link>
        }
      />

      {/* [v3 Phase 7] 스캔→재생성 전환 배너 */}
      {recentScan ? (
        <ScanBanner
          scan={{ url: recentScan.url, total: recentScan.scores.total, issueCount: recentScan.issues.length }}
        />
      ) : null}

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
            <Globe className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-neutral-500">my site</p>
            <p className="text-xl font-semibold text-neutral-50">{sites.length} items</p>
          </div>
        </Card>
        {aiEditAvailable ? (
          <Card className="flex items-center gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
              <FileEdit className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-neutral-500">In-Progress Edit Request</p>
              <p className="text-xl font-semibold text-neutral-50">{inProgressCount} records</p>
            </div>
          </Card>
        ) : (
          <Card className="flex items-center gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
              <PencilRuler className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-neutral-500">self edit</p>
              <p className="text-sm font-semibold text-neutral-50">Unlimited direct modifications</p>
            </div>
          </Card>
        )}
      </div>

      {/* 사이트 목록 */}
      {aiEditAvailable ? <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">my site</h2>
        {sites.length === 0 ? (
          <EmptyState
            icon={<Globe className="h-8 w-8" />}
            title="There is no site yet"
            description="If you answer the survey, AI will suggest three design candidates and create a site in the direction you chose."
            action={
              <Link
                href="/onboarding"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
              >
                <Plus className="h-4 w-4" />Create your first site
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
            <Link
              href="/onboarding"
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-800 text-neutral-500 transition-colors hover:border-[#4a3a22] hover:text-[#c8a96a]"
            >
              <Plus className="h-6 w-6" />
              <span className="text-sm">Create a new site</span>
            </Link>
          </div>
        )}
      </section> : null}

      {/* 최근 편집 요청 */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Recent Edit Requests</h2>
          <Link href="/dashboard/credits" className="text-xs text-neutral-500 transition-colors hover:text-[#c8a96a]">
            Request an edit →
          </Link>
        </div>
        {recentEdits.length === 0 ? (
          <EmptyState
            title="There are no edit requests"
            description="Editing directly in the editor is free. Credits are used only for AI regeneration or managed editing services."
          />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-neutral-800">
              {recentEdits.map((req) => (
                <li key={req.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-200">
                      <span className="font-medium">{EDIT_TYPE_LABELS[req.type]}</span>
                      <span className="text-neutral-500"> · {siteNameById.get(req.siteId) ?? "deleted site"}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{req.requestedContent}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-neutral-600">{formatDate(req.createdAt)}</span>
                  <EditStatusBadge status={req.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
