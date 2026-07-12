'use client';

import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Cloud, Database, ExternalLink, Globe, TriangleAlert } from 'lucide-react';
import { CF_FREE_HOSTNAME_LIMIT, CF_HOSTNAME_ALERT_THRESHOLD } from '@/lib/credits/constants';
import { getInfra } from './api';
import { SITE_STATUS_LABELS, formatNumber } from './format';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBlock,
  Gauge,
  LoadingBlock,
  PageHeader,
  SITE_STATUS_TONES,
  type BadgeTone,
} from './ui';

/**
 * [MOCK] Vercel 사용량 — 실연동 시 Vercel REST API
 * (GET https://api.vercel.com/v2/teams/{teamId}/usage 등, VERCEL_API_TOKEN 필요)로 대체.
 */
const VERCEL_USAGE_MOCK = {
  planLabel: 'Pro ($20/월)',
  bandwidthGb: 86.4,
  bandwidthLimitGb: 1000,
  buildMinutes: 412,
  buildMinutesLimit: 6000,
  deploymentsThisMonth: 23,
};

/**
 * [MOCK] Supabase 사용량 — 실연동 시 Supabase Management API
 * (GET https://api.supabase.com/v1/projects/{ref} 사용량 엔드포인트, SUPABASE_ACCESS_TOKEN 필요)로 대체.
 */
const SUPABASE_USAGE_MOCK = {
  planLabel: 'Pro ($25/월)',
  dbSizeGb: 0.42,
  dbLimitGb: 8,
  storageGb: 3.1,
  storageLimitGb: 100,
  mau: 74,
  mauLimit: 100_000,
};

/** SPEC §2 표 — 고객 100명까지 거의 고정인 월 인프라 원가 구조. */
const FIXED_COST_ROWS = [
  { name: 'Vercel Pro', usd: '$20', krw: '≈ ₩28,000', note: '멀티테넌트 앱 호스팅' },
  { name: 'Supabase Pro', usd: '$25', krw: '≈ ₩35,000', note: 'DB · Auth · Storage' },
  {
    name: 'Cloudflare for SaaS',
    usd: '$0',
    krw: '₩0',
    note: `커스텀 호스트네임 ${CF_FREE_HOSTNAME_LIMIT}개까지 무료, 초과 시 $0.10/개/월`,
  },
] as const;

function sslTone(sslStatus: string | undefined): BadgeTone {
  const status = sslStatus ?? '';
  if (status === 'active') return 'green';
  if (status.startsWith('pending')) return 'amber';
  if (status === 'failed' || status === 'expired') return 'red';
  return 'neutral';
}

export function InfraMonitor() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'infra'],
    queryFn: getInfra,
  });

  return (
    <>
      <PageHeader title="인프라" description="호스팅 · DB · 커스텀 도메인 사용량 모니터" />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Vercel */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Cloud size={15} className="text-slate-400" aria-hidden />
              Vercel
            </p>
            <Badge tone="neutral">{VERCEL_USAGE_MOCK.planLabel}</Badge>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            데모 수치 — 실연동 시 Vercel API로 대체
          </p>
          <div className="mt-3 space-y-3">
            <UsageRow
              label="대역폭"
              valueText={`${VERCEL_USAGE_MOCK.bandwidthGb.toLocaleString('ko-KR')} / ${formatNumber(VERCEL_USAGE_MOCK.bandwidthLimitGb)} GB`}
              value={VERCEL_USAGE_MOCK.bandwidthGb}
              max={VERCEL_USAGE_MOCK.bandwidthLimitGb}
            />
            <UsageRow
              label="빌드 시간"
              valueText={`${formatNumber(VERCEL_USAGE_MOCK.buildMinutes)} / ${formatNumber(VERCEL_USAGE_MOCK.buildMinutesLimit)} 분`}
              value={VERCEL_USAGE_MOCK.buildMinutes}
              max={VERCEL_USAGE_MOCK.buildMinutesLimit}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">이번 달 배포</span>
              <span className="font-medium tabular-nums text-slate-800">
                {formatNumber(VERCEL_USAGE_MOCK.deploymentsThisMonth)}회
              </span>
            </div>
          </div>
        </Card>

        {/* [motion 4단계] AI 영상 생성 — Veo 원가 대조 (registry 예산가 vs 실호출 로그) */}
        {data?.videoGen ? (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Clapperboard size={15} className="text-slate-400" aria-hidden />
                AI 영상 (Veo)
              </p>
              <Badge tone={data.videoGen.enabled ? 'amber' : 'neutral'}>
                {data.videoGen.enabled ? '실호출 ON' : '킬스위치 OFF'}
              </Badge>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              예산 ₩{formatNumber(data.videoGen.budgetKrwPerSite)}/사이트 · 원가 표준 1회 ≈₩4,300
            </p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">누적 생성</span>
                <span className="font-medium tabular-nums text-slate-800">{formatNumber(data.videoGen.total)}회</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">오늘</span>
                <span className="font-medium tabular-nums text-slate-800">
                  {formatNumber(data.videoGen.today)} / {formatNumber(data.videoGen.dailyCap)}회
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">사이트당 상한</span>
                <span className="font-medium tabular-nums text-slate-800">{formatNumber(data.videoGen.maxPerSite)}회</span>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Supabase */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Database size={15} className="text-slate-400" aria-hidden />
              Supabase
            </p>
            <Badge tone="neutral">{SUPABASE_USAGE_MOCK.planLabel}</Badge>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            데모 수치 — 실연동 시 Supabase Management API로 대체
          </p>
          <div className="mt-3 space-y-3">
            <UsageRow
              label="DB 용량"
              valueText={`${SUPABASE_USAGE_MOCK.dbSizeGb.toLocaleString('ko-KR')} / ${formatNumber(SUPABASE_USAGE_MOCK.dbLimitGb)} GB`}
              value={SUPABASE_USAGE_MOCK.dbSizeGb}
              max={SUPABASE_USAGE_MOCK.dbLimitGb}
            />
            <UsageRow
              label="스토리지"
              valueText={`${SUPABASE_USAGE_MOCK.storageGb.toLocaleString('ko-KR')} / ${formatNumber(SUPABASE_USAGE_MOCK.storageLimitGb)} GB`}
              value={SUPABASE_USAGE_MOCK.storageGb}
              max={SUPABASE_USAGE_MOCK.storageLimitGb}
            />
            <UsageRow
              label="MAU"
              valueText={`${formatNumber(SUPABASE_USAGE_MOCK.mau)} / ${formatNumber(SUPABASE_USAGE_MOCK.mauLimit)}`}
              value={SUPABASE_USAGE_MOCK.mau}
              max={SUPABASE_USAGE_MOCK.mauLimit}
            />
          </div>
        </Card>

        {/* 월 고정비 */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-slate-800">월 고정비 구조</p>
          <p className="mt-1 text-[10px] text-slate-400">고객 100명까지 거의 고정 (SPEC §2)</p>
          <table className="mt-3 w-full text-left text-xs">
            <tbody>
              {FIXED_COST_ROWS.map((row) => (
                <tr key={row.name} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <p className="font-medium text-slate-700">{row.name}</p>
                    <p className="text-[10px] text-slate-400">{row.note}</p>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-500">{row.usd}</td>
                  <td className="py-2 text-right font-medium tabular-nums text-slate-800">
                    {row.krw}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-2 text-sm font-semibold text-slate-900">합계</td>
                <td className="py-2 pr-2 text-right tabular-nums text-slate-500">$45</td>
                <td className="py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
                  ≈ ₩63,000/월
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      {/* Cloudflare 커스텀 호스트네임 */}
      <Card className="mt-4">
        <div className="border-b border-slate-200 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Globe size={15} className="text-slate-400" aria-hidden />
              Cloudflare 커스텀 호스트네임
            </p>
            {data ? (
              <div className="flex items-center gap-2.5">
                {data.hostnameCount >= CF_HOSTNAME_ALERT_THRESHOLD ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                    <TriangleAlert size={13} aria-hidden />
                    무료 한도 임박
                  </span>
                ) : null}
                <span className="text-xs tabular-nums text-slate-500">
                  {formatNumber(data.hostnameCount)} / {formatNumber(CF_FREE_HOSTNAME_LIMIT)}
                </span>
                <Gauge
                  value={data.hostnameCount}
                  max={CF_FREE_HOSTNAME_LIMIT}
                  warnAt={CF_HOSTNAME_ALERT_THRESHOLD}
                  className="w-32"
                />
              </div>
            ) : null}
          </div>
        </div>

        {isPending ? (
          <LoadingBlock label="호스트네임 목록을 불러오는 중…" />
        ) : isError ? (
          <div className="p-4">
            <ErrorBlock message={error.message} onRetry={() => refetch()} />
          </div>
        ) : data.hostnames.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Globe}
              title="등록된 커스텀 호스트네임이 없습니다"
              description="고객이 대시보드에서 커스텀 도메인을 연결하면 여기에 표시됩니다."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-medium">도메인</th>
                  <th className="px-4 py-2.5 font-medium">DNS 검증</th>
                  <th className="px-4 py-2.5 font-medium">SSL</th>
                  <th className="px-4 py-2.5 font-medium">사이트 상태</th>
                  <th className="px-4 py-2.5 font-medium">사이트</th>
                </tr>
              </thead>
              <tbody>
                {data.hostnames.map((row) => (
                  <tr
                    key={`${row.siteId}-${row.hostname}`}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-800">{row.hostname}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={row.dnsVerified ? 'green' : 'amber'}>
                        {row.dnsVerified ? '검증 완료' : '전파 대기'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={sslTone(row.sslStatus)}>{row.sslStatus || '—'}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={SITE_STATUS_TONES[row.siteStatus]}>
                        {SITE_STATUS_LABELS[row.siteStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-slate-600">{row.siteName}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="text-[11px] text-slate-400">{row.clientName}</span>
                      {row.dnsVerified ? (
                        <a
                          href={`https://${row.hostname}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${row.hostname} 열기`}
                          className="ml-1.5 inline-flex align-middle text-slate-400 hover:text-slate-600"
                        >
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function UsageRow({
  label,
  valueText,
  value,
  max,
}: {
  label: string;
  valueText: string;
  value: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium tabular-nums text-slate-800">{valueText}</span>
      </div>
      <Gauge value={value} max={max} className="mt-1" />
    </div>
  );
}
