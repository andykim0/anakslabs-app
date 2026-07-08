import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Coins, FileEdit, Globe, Plus } from 'lucide-react';
import { getCurrentClient } from '@/lib/services/auth';
import { getDataServices } from '@/lib/data';
import { SiteCard } from '@/components/dashboard/site-card';
import {
  Card,
  EDIT_TYPE_LABELS,
  EditStatusBadge,
  EmptyState,
  formatDate,
  PageHeader,
} from '@/components/dashboard/ui';

export const metadata: Metadata = { title: '내 사이트 — 아낙스랩스' };

export default async function DashboardHomePage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  const services = getDataServices();
  const [sites, balance, editRequests] = await Promise.all([
    services.sites.listByClient(client.id),
    services.credits.getBalance(client.id),
    services.editRequests.listByClient(client.id),
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
        title={`안녕하세요, ${client.name}님`}
        description="사이트 현황과 편집 요청 진행 상태를 한눈에 확인하세요."
        actions={
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
          >
            <Plus className="h-4 w-4" />새 사이트 만들기
          </Link>
        }
      />

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
            <Globe className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-neutral-500">내 사이트</p>
            <p className="text-xl font-semibold text-neutral-50">{sites.length}개</p>
          </div>
        </Card>
        <Link href="/credits" className="block">
          <Card className="flex items-center gap-4 transition-colors hover:border-[#4a3a22]">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2a2117] text-[#d9b878]">
              <Coins className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-xs text-neutral-500">크레딧 잔액</p>
              <p className="text-xl font-semibold text-[#d9b878]">{balance.balance}개</p>
            </div>
            <ArrowRight className="h-4 w-4 text-neutral-600" />
          </Card>
        </Link>
        <Card className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
            <FileEdit className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-neutral-500">진행 중 편집 요청</p>
            <p className="text-xl font-semibold text-neutral-50">{inProgressCount}건</p>
          </div>
        </Card>
      </div>

      {/* 사이트 목록 */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">내 사이트</h2>
        {sites.length === 0 ? (
          <EmptyState
            icon={<Globe className="h-8 w-8" />}
            title="아직 사이트가 없습니다"
            description="설문에 답하면 AI가 디자인 후보 3안을 제안하고, 선택한 방향으로 사이트를 만들어 드립니다."
            action={
              <Link
                href="/onboarding"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
              >
                <Plus className="h-4 w-4" />첫 사이트 만들기
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
              <span className="text-sm">새 사이트 만들기</span>
            </Link>
          </div>
        )}
      </section>

      {/* 최근 편집 요청 */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">최근 편집 요청</h2>
          <Link href="/credits" className="text-xs text-neutral-500 transition-colors hover:text-[#c8a96a]">
            편집 요청하기 →
          </Link>
        </div>
        {recentEdits.length === 0 ? (
          <EmptyState
            title="편집 요청 내역이 없습니다"
            description="텍스트 수정, 이미지 교체 등 발행 후 수정이 필요하면 크레딧으로 요청할 수 있습니다."
          />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-neutral-800">
              {recentEdits.map((req) => (
                <li key={req.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-200">
                      <span className="font-medium">{EDIT_TYPE_LABELS[req.type]}</span>
                      <span className="text-neutral-500"> · {siteNameById.get(req.siteId) ?? '삭제된 사이트'}</span>
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
