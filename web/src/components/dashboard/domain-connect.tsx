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
  { key: 'pending', label: "Waiting", hint: "Waiting for DNS records to be added" },
  { key: 'verifying', label: "Verifying", hint: "Checking records · Issuing SSL certificate" },
  { key: 'active', label: "Complete", hint: "Serving as a custom domain" },
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
      toast('error', "Copy failed. Please select your own value.");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy value"
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
        Verification failed. Please check your DNS record values ​​again and try again below.
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
      <p className="text-xs font-medium text-neutral-200">Instructions for adding DNS records</p>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        Gabia, Whois, etc. <span className="text-neutral-400">DNS management screen of the company that purchased the domain</span>from below
        Please add the record as is. Propagation can take up to 24-48 hours, and the status is automatically updated every 5 seconds.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-105 text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-800 text-[11px] text-neutral-500">
              <th className="py-1.5 pr-3 font-medium">category</th>
              <th className="py-1.5 pr-3 font-medium">host(name)</th>
              <th className="py-1.5 font-medium">value</th>
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
        <p className="mt-2 text-[11px] text-neutral-600">SSL Status: {status.sslStatus}</p>
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
      setLocalError("This is not a valid domain format. (e.g. www.example.com)");
      return;
    }
    setLocalError(null);
    onSubmit(value);
  };

  const error = localError ?? errorMessage;

  return (
    <form onSubmit={submit} className="mt-1">
      <p className="text-xs leading-5 text-neutral-500">
        You can connect your own domain. <span className="text-neutral-400">www.mydomain.com</span> form
        Recommended. The connection itself is free, and existing subdomain addresses will continue to operate until the connection is completed.
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
          Connect
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
      toast('success', `${status.hostname}Connection request completed — please add your DNS records.`);
    },
    onError: (err) => {
      setRequestError(err instanceof Error ? err.message : "Domain connection request failed.");
    },
  });

  const status = statusQuery.data ?? null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">domain</h2>
      <Card className="space-y-5">
        {/* 현재 도메인 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
              <Globe className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-xs text-neutral-500">current domain</p>
              <p className="text-sm font-medium text-neutral-100">
                {site.domain ?? "Not assigned (subdomain automatically assigned when issued)"}
              </p>
            </div>
          </div>
          <Badge tone={site.domainType === 'custom' ? (site.dnsVerified ? 'emerald' : 'amber') : 'neutral'}>
            {site.domainType === 'custom'
              ? site.dnsVerified
                ? "Custom Domain · Connected"
                : "Custom domain · Verifying"
              : "default subdomain"}
          </Badge>
        </div>

        {statusQuery.isPending ? (
          <div className="space-y-2 border-t border-neutral-800 pt-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24" />
          </div>
        ) : statusQuery.isError ? (
          <div className="border-t border-neutral-800 pt-4">
            <ErrorState message="Failed to retrieve domain status." onRetry={() => statusQuery.refetch()} />
          </div>
        ) : status ? (
          /* 연결 진행 중 / 완료 */
          <div className="space-y-4 border-t border-neutral-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-neutral-200">
                <span className="font-medium">{status.hostname}</span>
                <span className="text-neutral-500"> connection status</span>
              </p>
              <button
                type="button"
                onClick={() => statusQuery.refetch()}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
              >
                <RefreshCw className={cn('h-3 w-3', statusQuery.isFetching && 'animate-spin')} />
                check now
              </button>
            </div>
            <StatusStepper state={status.status} />
            {status.status === 'active' ? (
              <p className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-300">
                The connection is complete. now {status.hostname} This site opens when you access . (SSL automatically applied)
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
            <p className="text-sm font-medium text-neutral-200">Connect my domain</p>
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
