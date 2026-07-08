'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, Coins, Globe, MonitorCheck, Users } from 'lucide-react';
import { CF_FREE_HOSTNAME_LIMIT, CF_HOSTNAME_ALERT_THRESHOLD } from '@/lib/credits/constants';
import { getOverview } from './api';
import { formatNumber } from './format';
import { ErrorBlock, Gauge, LoadingBlock, PageHeader, StatCard } from './ui';

export function OverviewDashboard() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getOverview,
  });

  if (isPending) {
    return (
      <>
        <PageHeader title="대시보드" description="서비스 전체 현황 요약" />
        <LoadingBlock label="현황을 불러오는 중…" />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title="대시보드" description="서비스 전체 현황 요약" />
        <ErrorBlock message={error.message} onRetry={() => refetch()} />
      </>
    );
  }

  const hostnameDanger = data.customHostnameCount >= CF_HOSTNAME_ALERT_THRESHOLD;

  return (
    <>
      <PageHeader title="대시보드" description="서비스 전체 현황 요약" />

      {hostnameDanger ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
          <div className="text-sm text-red-800">
            <p className="font-semibold">Cloudflare 무료 한도 임박</p>
            <p className="mt-0.5 text-xs text-red-700">
              커스텀 호스트네임 {formatNumber(data.customHostnameCount)}/
              {formatNumber(CF_FREE_HOSTNAME_LIMIT)}개 사용 중입니다. 한도 초과분은 호스트네임당 월
              $0.10이 과금됩니다. 인프라 탭에서 상세를 확인하세요.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="고객 수"
          icon={Users}
          value={formatNumber(data.clients.total)}
          sub={
            <span>
              Basic {formatNumber(data.clients.basic)} · Premium{' '}
              {formatNumber(data.clients.premium)}
            </span>
          }
        />
        <StatCard
          label="라이브 사이트"
          icon={MonitorCheck}
          value={formatNumber(data.liveSites)}
          sub="status = live 기준"
        />
        <StatCard
          label="크레딧 유통량"
          icon={Coins}
          value={formatNumber(data.credits.circulating)}
          sub={
            <span>
              지급 {formatNumber(data.credits.granted)} − 소모{' '}
              {formatNumber(data.credits.consumed)}
            </span>
          }
        />
        <StatCard
          label="QA 대기"
          icon={ClipboardCheck}
          value={formatNumber(data.qaPending)}
          sub="검수 필요 편집 요청"
        />
        <StatCard
          label="커스텀 호스트네임"
          icon={Globe}
          tone={hostnameDanger ? 'danger' : 'neutral'}
          value={
            <span>
              {formatNumber(data.customHostnameCount)}
              <span className="text-sm font-normal text-slate-400">
                {' '}
                / {formatNumber(CF_FREE_HOSTNAME_LIMIT)}
              </span>
            </span>
          }
          sub={
            <Gauge
              value={data.customHostnameCount}
              max={CF_FREE_HOSTNAME_LIMIT}
              warnAt={CF_HOSTNAME_ALERT_THRESHOLD}
              className="mt-1.5"
            />
          }
        />
      </div>
    </>
  );
}
