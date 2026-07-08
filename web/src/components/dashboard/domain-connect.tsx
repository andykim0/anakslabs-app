'use client';

/**
 * 커스텀 도메인 연결 섹션 (사이트 상세 하단).
 * POST /api/domains {siteId,hostname} → DNS 안내 카드 → GET /api/domains?siteId= 5초 폴링 스테퍼.
 * 흐름: 도메인 입력 → 검증 레코드 안내(가비아·후이즈 등 DNS 관리 화면에 추가) → 대기중 → 검증중 → 완료.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy, Globe, Link2, RefreshCw } from 'lucide-react';
import type { CustomDomainState, CustomDomainStatus, Site } from '@/lib/types/domain';
import { getDomainStatus, requestCustomDomain } from './api';
import { useToast } from './toast';
import { Badge, Button, Card, cn, ErrorState, Skeleton } from './ui';

const HOSTNAME_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const STEPS: { key: CustomDomainState; label: string; hint: string }[] = [
  { key: 'pending', label: '대기중', hint: 'DNS 레코드 추가를 기다리는 중' },
  { key: 'verifying', label: '검증중', hint: '레코드 확인 · SSL 인증서 발급 중' },
  { key: 'active', label: '완료', hint: '커스텀 도메인으로 서비스 중' },
];

function stepIndex(state: CustomDomainState): number {
  if (state === 'active') return 2;
  if (state === 'verifying') return 1;
  return 0;
}

// ---------- 조각 ----------

function CopyButton({ value }: { value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('error', '복사에 실패했습니다. 값을 직접 선택해 주세요.');
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="값 복사"
      className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function StatusStepper({ state }: { state: CustomDomainState }) {
  if (state === 'failed') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/30 px-3 py-2.5 text-xs text-red-300">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        검증에 실패했습니다. DNS 레코드 값을 다시 확인한 뒤, 아래에서 재시도해 주세요.
      </div>
    );
  }
  const current = stepIndex(state);
  return (
    <ol className="flex items-start">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.key} className={cn('flex items-start', i < STEPS.length - 1 && 'flex-1')}>
            <div className="flex min-w-0 flex-col items-start">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                  done || (active && step.key === 'active')
                    ? 'bg-emerald-600 text-white'
                    : active
                      ? 'bg-[#c8a96a] text-neutral-950'
                      : 'bg-neutral-800 text-neutral-500',
                )}
              >
                {done || (active && step.key === 'active') ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'mt-1.5 text-xs font-medium whitespace-nowrap',
                  active ? 'text-neutral-100' : done ? 'text-neutral-300' : 'text-neutral-600',
                )}
              >
                {step.label}
              </span>
              {active ? (
                <span className="mt-0.5 max-w-36 text-[10px] leading-4 text-neutral-500">{step.hint}</span>
              ) : null}
            </div>
            {i < STEPS.length - 1 ? (
              <div className={cn('mx-2 mt-3 h-px flex-1', i < current ? 'bg-emerald-700' : 'bg-neutral-800')} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function DnsGuideCard({ status }: { status: CustomDomainStatus }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
      <p className="text-xs font-medium text-neutral-200">DNS 레코드 추가 안내</p>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        가비아·후이즈 등 <span className="text-neutral-400">도메인을 구매한 업체의 DNS 관리 화면</span>에서 아래
        레코드를 그대로 추가해 주세요. 전파에는 최대 24~48시간이 걸릴 수 있고, 상태는 5초마다 자동 갱신됩니다.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-105 text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-800 text-[11px] text-neutral-500">
              <th className="py-1.5 pr-3 font-medium">유형</th>
              <th className="py-1.5 pr-3 font-medium">호스트(이름)</th>
              <th className="py-1.5 font-medium">값</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {status.verificationRecords.map((rec) => (
              <tr key={`${rec.type}-${rec.name}-${rec.value}`} className="border-b border-neutral-900 last:border-0">
                <td className="py-2 pr-3">
                  <Badge tone="blue">{rec.type}</Badge>
                </td>
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-1 text-neutral-300">
                    <span className="break-all">{rec.name}</span>
                    <CopyButton value={rec.name} />
                  </span>
                </td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1 text-neutral-300">
                    <span className="break-all">{rec.value}</span>
                    <CopyButton value={rec.value} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status.sslStatus ? (
        <p className="mt-2 text-[11px] text-neutral-600">SSL 상태: {status.sslStatus}</p>
      ) : null}
    </div>
  );
}

// ---------- 연결 폼 ----------

function ConnectForm({
  onSubmit,
  pending,
  errorMessage,
}: {
  onSubmit: (hostname: string) => void;
  pending: boolean;
  errorMessage: string | null;
}) {
  const [hostname, setHostname] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = hostname.trim().toLowerCase();
    if (!HOSTNAME_RE.test(value)) {
      setLocalError('올바른 도메인 형식이 아닙니다. (예: www.example.com)');
      return;
    }
    setLocalError(null);
    onSubmit(value);
  };

  const error = localError ?? errorMessage;

  return (
    <form onSubmit={submit} className="mt-1">
      <p className="text-xs leading-5 text-neutral-500">
        보유하신 도메인을 연결할 수 있어요. <span className="text-neutral-400">www.내도메인.com</span> 형태를
        권장합니다. 연결 자체는 무료이며, 기존 서브도메인 주소는 연결이 끝날 때까지 계속 동작합니다.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="www.example.com"
          className="h-10 w-full flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[#c8a96a]"
        />
        <Button type="submit" loading={pending}>
          <Link2 className="h-4 w-4" />
          연결하기
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </form>
  );
}

// ---------- 본체 ----------

export function DomainSection({ site }: { site: Site }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [requestError, setRequestError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['domain', site.id],
    queryFn: () => getDomainStatus(site.id),
    // 검증이 끝나지 않았으면 5초 폴링 (계약: GET /api/domains?siteId= refetchInterval)
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'pending' || s === 'verifying' ? 5000 : false;
    },
  });

  const requestMutation = useMutation({
    mutationFn: (hostname: string) => requestCustomDomain(site.id, hostname),
    onSuccess: (status) => {
      setRequestError(null);
      queryClient.setQueryData(['domain', site.id], status);
      queryClient.invalidateQueries({ queryKey: ['site', site.id] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast('success', `${status.hostname} 연결 요청 완료 — DNS 레코드를 추가해 주세요.`);
    },
    onError: (err) => {
      setRequestError(err instanceof Error ? err.message : '도메인 연결 요청에 실패했습니다.');
    },
  });

  const status = statusQuery.data ?? null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">도메인</h2>
      <Card className="space-y-5">
        {/* 현재 도메인 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
              <Globe className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-xs text-neutral-500">현재 도메인</p>
              <p className="text-sm font-medium text-neutral-100">
                {site.domain ?? '미할당 (발행 시 서브도메인 자동 부여)'}
              </p>
            </div>
          </div>
          <Badge tone={site.domainType === 'custom' ? (site.dnsVerified ? 'emerald' : 'amber') : 'neutral'}>
            {site.domainType === 'custom'
              ? site.dnsVerified
                ? '커스텀 도메인 · 연결됨'
                : '커스텀 도메인 · 검증 중'
              : '기본 서브도메인'}
          </Badge>
        </div>

        {statusQuery.isPending ? (
          <div className="space-y-2 border-t border-neutral-800 pt-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24" />
          </div>
        ) : statusQuery.isError ? (
          <div className="border-t border-neutral-800 pt-4">
            <ErrorState message="도메인 상태를 불러오지 못했습니다." onRetry={() => statusQuery.refetch()} />
          </div>
        ) : status ? (
          /* 연결 진행 중 / 완료 */
          <div className="space-y-4 border-t border-neutral-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-neutral-200">
                <span className="font-medium">{status.hostname}</span>
                <span className="text-neutral-500"> 연결 상태</span>
              </p>
              <button
                type="button"
                onClick={() => statusQuery.refetch()}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
              >
                <RefreshCw className={cn('h-3 w-3', statusQuery.isFetching && 'animate-spin')} />
                지금 확인
              </button>
            </div>
            <StatusStepper state={status.status} />
            {status.status === 'active' ? (
              <p className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-300">
                연결이 완료됐어요. 이제 {status.hostname} 으로 접속하면 이 사이트가 열립니다. (SSL 자동 적용)
              </p>
            ) : (
              <DnsGuideCard status={status} />
            )}
            {status.status === 'failed' ? (
              <ConnectForm
                onSubmit={(hostname) => requestMutation.mutate(hostname)}
                pending={requestMutation.isPending}
                errorMessage={requestError}
              />
            ) : null}
          </div>
        ) : (
          /* 아직 커스텀 도메인 없음 → 연결 폼 */
          <div className="border-t border-neutral-800 pt-4">
            <p className="text-sm font-medium text-neutral-200">내 도메인 연결</p>
            <ConnectForm
              onSubmit={(hostname) => requestMutation.mutate(hostname)}
              pending={requestMutation.isPending}
              errorMessage={requestError}
            />
          </div>
        )}
      </Card>
    </section>
  );
}
