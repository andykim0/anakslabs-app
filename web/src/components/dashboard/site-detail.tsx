'use client';

/**
 * 사이트 상세 (/dashboard/sites/[siteId]) —
 * 미리보기(데스크톱/모바일 토글) · 발행/재발행 · 커스텀 도메인 연결 · 편집 요청 히스토리.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Monitor,
  PencilRuler,
  Rocket,
  Smartphone,
} from 'lucide-react';
import type { Site } from '@/lib/types/domain';
import { ApiError, getSite, listEditRequests, publishSite } from './api';
import { DomainSection } from './domain-connect';
import { SitePreview } from './site-preview';
import { useToast } from './toast';
import {
  Button,
  Card,
  cn,
  EDIT_TYPE_LABELS,
  EditStatusBadge,
  EmptyState,
  ErrorState,
  formatDate,
  formatDateTime,
  PageHeader,
  SiteStatusBadge,
  Skeleton,
} from './ui';

// ---------- 미리보기 ----------

function PreviewCard({ site }: { site: Site }) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [source, setSource] = useState<'draft' | 'published'>(site.draftConfig ? 'draft' : 'published');

  const hasBoth = Boolean(site.draftConfig && site.siteConfig);
  const config = source === 'draft' ? (site.draftConfig ?? site.siteConfig) : (site.siteConfig ?? site.draftConfig);

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-400">미리보기</span>
          {hasBoth ? (
            <div className="flex overflow-hidden rounded-lg border border-neutral-700 text-[11px]">
              {(
                [
                  ['draft', '초안'],
                  ['published', '발행본'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSource(key)}
                  className={cn(
                    'px-2.5 py-1 transition-colors',
                    source === key ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-neutral-600">
              {site.draftConfig ? '초안 기준' : '발행본 기준'}
            </span>
          )}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-neutral-700">
          <button
            type="button"
            onClick={() => setMode('desktop')}
            aria-label="데스크톱 미리보기"
            className={cn(
              'flex h-7 w-9 items-center justify-center transition-colors',
              mode === 'desktop' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300',
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMode('mobile')}
            aria-label="모바일 미리보기"
            className={cn(
              'flex h-7 w-9 items-center justify-center transition-colors',
              mode === 'mobile' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300',
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="bg-neutral-950 p-4">
        {config ? (
          <div className={cn('mx-auto overflow-hidden rounded-lg border border-neutral-800', mode === 'mobile' && 'max-w-[300px]')}>
            <SitePreview config={config} mode={mode} maxHeight={560} scroll />
          </div>
        ) : (
          <EmptyState
            title="표시할 콘텐츠가 없습니다"
            description="에디터에서 사이트를 편집하면 이곳에서 미리 볼 수 있어요."
          />
        )}
      </div>
    </Card>
  );
}

// ---------- 편집 요청 히스토리 ----------

function EditHistory({ siteId }: { siteId: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['edit-requests', siteId],
    queryFn: () => listEditRequests(siteId),
  });

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">편집 요청 히스토리</h2>
        <Link
          href="/dashboard/credits"
          className="text-xs text-neutral-500 transition-colors hover:text-[#c8a96a]"
        >
          새 편집 요청 →
        </Link>
      </div>
      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : isError ? (
        <ErrorState message="편집 요청 내역을 불러오지 못했습니다." onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title="이 사이트의 편집 요청이 없습니다"
          description="발행 후 텍스트·이미지 수정이 필요하면 크레딧으로 요청할 수 있어요."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-neutral-800">
            {data.map((req) => (
              <li key={req.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-200">
                    <span className="font-medium">{EDIT_TYPE_LABELS[req.type]}</span>
                    <span className="text-neutral-500"> · 크레딧 {req.creditCost}개</span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-neutral-500">
                    {req.requestedContent}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <EditStatusBadge status={req.status} />
                  <span className="text-[11px] text-neutral-600">{formatDateTime(req.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

// ---------- 본체 ----------

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-8 h-4 w-80" />
      <Skeleton className="h-[420px]" />
      <Skeleton className="mt-6 h-64" />
    </div>
  );
}

export function SiteDetail({ siteId }: { siteId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => getSite(siteId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const publishMutation = useMutation({
    mutationFn: () => publishSite(siteId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast(
        'success',
        result.url ? `발행 완료 — ${result.url.replace(/^https?:\/\//, '')} 에서 라이브` : '발행이 완료되었습니다.',
      );
    },
    onError: (err) => {
      toast('error', err instanceof Error ? err.message : '발행에 실패했습니다.');
    },
  });

  if (siteQuery.isPending) return <DetailSkeleton />;

  if (siteQuery.isError) {
    const notFound = siteQuery.error instanceof ApiError && siteQuery.error.status === 404;
    return (
      <div className="py-10">
        {notFound ? (
          <EmptyState
            icon={<Globe className="h-8 w-8" />}
            title="사이트를 찾을 수 없습니다"
            description="삭제되었거나 접근 권한이 없는 사이트예요."
            action={
              <Link href="/dashboard" className="text-sm text-[#c8a96a] hover:underline">
                내 사이트 목록으로 돌아가기
              </Link>
            }
          />
        ) : (
          <ErrorState
            message={siteQuery.error instanceof Error ? siteQuery.error.message : undefined}
            onRetry={() => siteQuery.refetch()}
          />
        )}
      </div>
    );
  }

  const site = siteQuery.data;
  const isPublished = Boolean(site.siteConfig);

  return (
    <div>
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />내 사이트
      </Link>

      <PageHeader
        title={site.name}
        description={`생성 ${formatDate(site.createdAt)}${site.publishedAt ? ` · 최근 발행 ${formatDateTime(site.publishedAt)}` : ' · 아직 발행 전'}`}
        actions={
          <>
            <Link
              href={`/dashboard/sites/${site.id}/editor`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
            >
              <PencilRuler className="h-4 w-4" />
              에디터 열기
            </Link>
            <Button
              onClick={() => publishMutation.mutate()}
              loading={publishMutation.isPending}
              disabled={!site.draftConfig}
              title={site.draftConfig ? undefined : '발행할 초안이 없습니다'}
            >
              <Rocket className="h-4 w-4" />
              {isPublished ? '재발행' : '발행하기'}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <SiteStatusBadge status={site.status} />
        {site.domain ? (
          <a
            href={`/s/${site.domain}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-[#c8a96a]"
          >
            <Globe className="h-3.5 w-3.5" />
            {site.domain}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-neutral-600">발행하면 서브도메인이 즉시 할당됩니다</span>
        )}
      </div>

      <PreviewCard site={site} />

      <DomainSection site={site} />

      <EditHistory siteId={siteId} />
    </div>
  );
}
