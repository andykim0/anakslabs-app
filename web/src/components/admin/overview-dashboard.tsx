'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardCheck,
  Coins,
  Globe,
  MonitorCheck,
  ReceiptText,
  Rocket,
  ShieldCheck,
  Target,
  Users,
  Video,
} from 'lucide-react';
import { CF_FREE_HOSTNAME_LIMIT, CF_HOSTNAME_ALERT_THRESHOLD } from '@/lib/credits/constants';
import { FULFILLMENT_SLA_BUSINESS_DAYS } from '@/lib/fulfillment-sla';
import { getOverview } from './api';
import { formatKrw, formatNumber } from './format';
import { ManualCollectionPanel } from './manual-collection-panel';
import { Card, ErrorBlock, Gauge, LoadingBlock, PageHeader, StatCard } from './ui';

const GUARANTEE_DECISION_COPY = {
  'not-due': { label: '판정 전', tone: 'text-slate-600 bg-slate-100' },
  'needs-index-evidence': { label: '색인 확인 필요', tone: 'text-amber-800 bg-amber-100' },
  eligible: { label: '환불 대상', tone: 'text-red-700 bg-red-100' },
  'not-eligible': { label: '기준 충족', tone: 'text-emerald-700 bg-emerald-100' },
  excluded: { label: '예외 적용', tone: 'text-violet-700 bg-violet-100' },
} as const;

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

      {data.fulfillmentAlerts.total > 0 ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">
              대기 {FULFILLMENT_SLA_BUSINESS_DAYS}영업일을 넘긴 이행 요청 {formatNumber(data.fulfillmentAlerts.total)}건
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              <Link href="/admin/edit-queue" className="underline underline-offset-2">
                수정 {formatNumber(data.fulfillmentAlerts.editOverdue)}건
              </Link>
              {' · '}
              <Link href="/admin/video-queue" className="underline underline-offset-2">
                영상 {formatNumber(data.fulfillmentAlerts.videoOverdue)}건
              </Link>
              이 조용히 누락되지 않도록 우선 확인해 주세요.
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

      <ManualCollectionPanel rows={data.manualCollections} />

      <section className="mt-7" aria-labelledby="admin-revenue-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="admin-revenue-heading" className="text-sm font-semibold text-slate-900">
              매출 한눈판
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {data.revenue.month.month} KST · PG와 수동 수금 원장 합산 · 현금주의
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
                이번 달 운영 순수금
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
                {formatKrw(data.revenue.operatingRevenueNetKrw)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                제작·AI 영상·사이트 운영 구독 수금 − 환불 · 크레딧 팩 제외
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                PG {formatKrw(data.revenue.operatingRevenueBySourceKrw.provider)} · 수동 수금{' '}
                {formatKrw(data.revenue.operatingRevenueBySourceKrw.manual)}
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
            sub="과거·협의가·불명확 조합·부분환불 배분"
            icon={CircleDollarSign}
            tone={data.revenue.segments.unclassifiedBuild.netKrw !== 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            label="전체 환불"
            value={formatKrw(data.revenue.receipts.refundsKrw)}
            sub="크레딧 팩 포함 · 실제 처리 시각"
            icon={ReceiptText}
            tone={data.revenue.receipts.refundsKrw > 0 ? 'danger' : 'neutral'}
          />
        </div>

        {data.guaranteeProgramEnabled ? <Card className="mt-3 overflow-x-auto" >
          <div className="flex items-start gap-2 border-b border-slate-200 px-4 py-3">
            <ShieldCheck size={16} className="mt-0.5 text-slate-400" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">90일 성과 보장 판정</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                색인 신호는 서치어드바이저/URL 확인 기록만 사용 · 유입은 PII 없는 네이버 pageview 합계
              </p>
            </div>
          </div>
          {data.guarantees.length ? (
            <table data-guarantee-admin className="w-full min-w-[880px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">사이트</th>
                  <th className="px-4 py-2.5 font-medium">90일 판정일</th>
                  <th className="px-4 py-2.5 font-medium">네이버 색인</th>
                  <th className="px-4 py-2.5 font-medium">네이버 유입</th>
                  <th className="px-4 py-2.5 font-medium">판정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.guarantees.map((row) => {
                  const decision = GUARANTEE_DECISION_COPY[row.decision];
                  return (
                    <tr key={row.siteId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{row.siteName}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">{row.domain ?? '도메인 대기'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(row.dueAt).toLocaleDateString('ko-KR')}
                        {row.daysRemaining ? <span className="ml-1 text-slate-400">({row.daysRemaining}일 남음)</span> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.naverIndexed === null ? '확인 필요' : row.naverIndexed ? '있음' : '없음'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {formatNumber(row.naverReferralCount)} / {formatNumber(row.referralThreshold)}회
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-1 text-[11px] font-semibold ${decision.tone}`}>{decision.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-8 text-center text-xs text-slate-500">발행된 보장 판정 대상 사이트가 없습니다.</p>
          )}
        </Card> : null}

        <Card className="mt-3 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                과거 런칭가 수금 사이트
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
              PG는 고객 소유 사이트가 하나로 확인될 때만, 수동 수금은 원장에 귀속된 사이트만 집계합니다.
              동일 사이트의 PG·수동 중복은 1곳으로 계산하며, 신규 계약에는 수량 제한이 없습니다.
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
            <p className="mt-2 text-xs text-slate-500">과거 장부 재현용 집계이며 신규 판매에는 사용하지 않습니다.</p>
          )}
        </Card>

        {data.revenue.anomalies.length ? (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            결제 원장 {formatNumber(data.revenue.anomalyPaymentCount)}건에서 오류{' '}
            {formatNumber(data.revenue.anomalies.length)}개를 발견했습니다. 해당 필드의 분류·환불 반영은
            추정하지 않았습니다.
          </div>
        ) : null}
      </section>
    </>
  );
}
