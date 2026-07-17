'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardCheck,
  Coins,
  Globe,
  MonitorCheck,
  ReceiptText,
  Rocket,
  Target,
  Users,
  Video,
} from 'lucide-react';
import { CF_FREE_HOSTNAME_LIMIT, CF_HOSTNAME_ALERT_THRESHOLD } from '@/lib/credits/constants';
import { getOverview } from './api';
import { formatKrw, formatNumber } from './format';
import { Card, ErrorBlock, Gauge, LoadingBlock, PageHeader, StatCard } from './ui';

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
              기본 홈페이지 {formatNumber(data.clients.basic)} · AI 영상 홈페이지{' '}
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

      <section className="mt-7" aria-labelledby="admin-revenue-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="admin-revenue-heading" className="text-sm font-semibold text-slate-900">
              매출 한눈판
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {data.revenue.month.month} KST · 결제·환불 원장 기준
            </p>
          </div>
          <p className="text-xs text-slate-500">
            목표 달성률 {Math.round(data.revenue.targetProgress * 100)}%
          </p>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                이번 달 운영 매출
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
                {formatKrw(data.revenue.operatingRevenueNetKrw)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                제작·AI 영상·사이트 운영 구독 순매출 · 크레딧 팩 제외
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">월 운영 목표</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700">
                {formatKrw(data.revenue.targetKrw)}
              </p>
            </div>
          </div>
          <Gauge
            value={Math.max(data.revenue.operatingRevenueNetKrw, 0)}
            max={data.revenue.targetKrw}
            className="mt-4 h-2"
          />
        </Card>

        <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-6">
          <StatCard
            label="런칭가 제작"
            value={formatKrw(data.revenue.segments.launchBuild.netKrw)}
            icon={Rocket}
          />
          <StatCard
            label="정가 제작"
            value={formatKrw(data.revenue.segments.listBuild.netKrw)}
            icon={Target}
          />
          <StatCard
            label="AI 영상 애드온"
            value={formatKrw(data.revenue.segments.videoAddon.netKrw)}
            icon={Video}
          />
          <StatCard
            label="운영 구독 수금"
            value={formatKrw(data.revenue.segments.subscription.netKrw)}
            icon={ReceiptText}
          />
          <StatCard
            label="미분류 제작"
            value={formatKrw(data.revenue.segments.unclassifiedBuild.netKrw)}
            sub="과거·협의가 또는 불명확 조합"
            icon={CircleDollarSign}
            tone={data.revenue.segments.unclassifiedBuild.netKrw !== 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            label="이번 달 환불"
            value={formatKrw(data.revenue.receipts.refundsKrw)}
            sub="실제 환불 처리 시각 기준"
            icon={ReceiptText}
            tone={data.revenue.receipts.refundsKrw > 0 ? 'danger' : 'neutral'}
          />
        </div>

        <Card className="mt-3 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                런칭 선착순 계약 카운터
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {formatNumber(data.revenue.launchOffer.contracts)}
                {data.revenue.launchOffer.limit === null ? null : (
                  <span className="text-sm font-normal text-slate-400">
                    {' '}/ {formatNumber(data.revenue.launchOffer.limit)}건
                  </span>
                )}
              </p>
            </div>
            <p className="max-w-lg text-right text-[11px] leading-5 text-slate-500">
              현 가격·초기 지급 조합이 정확히 확인되는 결제 계약만 집계합니다. Payment에 siteId가 없어
              사이트 수가 아닌 계약 건수이며, 소진 플래그는 자동 변경하지 않습니다.
            </p>
          </div>
          {data.revenue.launchOffer.limit !== null ? (
            <>
              <Gauge
                value={data.revenue.launchOffer.contracts}
                max={data.revenue.launchOffer.limit}
                className="mt-3"
              />
              <p className="mt-2 text-[11px] text-slate-500">
                {data.revenue.launchOffer.reachedLimit
                  ? '한도에 도달했습니다. 운영자가 런칭 오퍼 상태를 검토하세요.'
                  : `${formatNumber(data.revenue.launchOffer.remaining ?? 0)}건 남음`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-500">현재 수량형 런칭 오퍼가 아닙니다.</p>
          )}
        </Card>

        {data.revenue.anomalies.length ? (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            결제 원장 {formatNumber(data.revenue.anomalies.length)}건은 중복·형식 오류로 집계에서 제외됐습니다.
          </div>
        ) : null}
      </section>
    </>
  );
}
