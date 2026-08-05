import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileEdit, Globe, PencilRuler, Plus } from 'lucide-react';
import { getCurrentClient } from '@/lib/services/auth';
import { getRecentScan } from '@/lib/services/recent-scan';
import { getDataServices } from '@/lib/data';
import { ScanBanner } from '@/components/dashboard/ScanBanner';
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
import { customerLocaleFromSites, operatorManagedForLocale } from '@/lib/operator-model/policy';

export const metadata: Metadata = { title: "My site — Anaks Labs" };

export default async function DashboardHomePage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  const services = getDataServices();
  const aiEditAvailable = aiEditEnabled();
  const sites = await services.sites.listByClient(client.id);
  // 운영자 모델: 클라이언트당 사이트 1개. 목록을 거치지 않고 그 사이트로 직행한다.
  const [onlySite] = sites;
  if (onlySite) redirect(`/dashboard/sites/${onlySite.id}`);
  const operatorManaged = operatorManagedForLocale(customerLocaleFromSites(sites));
  const [editRequests, recentScan] = await Promise.all([
    aiEditAvailable ? services.editRequests.listByClient(client.id) : Promise.resolve([]),
    operatorManaged ? Promise.resolve(null) : getRecentScan(),
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
        actions={!operatorManaged ? (
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
          >
            <Plus className="h-4 w-4" />Create a new site
          </Link>
        ) : undefined}
      />

      {/* [v3 Phase 7] 스캔→재생성 전환 배너 */}
      {recentScan ? (
        <ScanBanner
          scan={{ url: recentScan.url, total: recentScan.scores.total, issueCount: recentScan.issues.length }}
        />
      ) : null}

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-2">
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

      {/* 사이트 — 소유 사이트가 있으면 위에서 이미 그 사이트로 보냈으므로 여기는 미보유 상태만 남는다 */}
      <section className="mt-8">
        <EmptyState
          icon={<Globe className="h-8 w-8" />}
          title="There is no site yet"
          description={operatorManaged
            ? 'Your Anaks Labs operator is preparing the site for this workspace.'
            : 'Complete onboarding to create your site.'}
          action={!operatorManaged ? (
            <Link
              href="/onboarding"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              <Plus className="h-4 w-4" />Create your first site
            </Link>
          ) : undefined}
        />
      </section>

      {/* 최근 편집 요청 */}
      {aiEditAvailable ? <section className="mt-8">
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
      </section> : null}
    </div>
  );
}
