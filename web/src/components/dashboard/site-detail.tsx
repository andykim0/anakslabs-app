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
  Download,
  ExternalLink,
  Globe,
  Film,
  Inbox,
  Monitor,
  Package,
  PencilRuler,
  Play,
  Rocket,
  Smartphone,
} from 'lucide-react';
import type { Site, Tier } from '@/lib/types/domain';
import { DYNAMIC_FEATURE_NOTICE } from '@/lib/legal/notices';
import {
  allPublishHumanChecksConfirmed,
  emptyPublishHumanChecks,
  type PublishHumanCheckId,
  type PublishHumanChecks,
} from '@/lib/publish/human-checks';
import { hasVideoAddon } from '@/lib/services/entitlements';
import { heroVideoResumePlan } from '@/lib/onboarding/hero-video-process';
import {
  VIDEO_FULFILLMENT_COPY,
  VIDEO_FULFILLMENT_STATUS_LABELS,
  type VideoFulfillmentStatus,
} from '@/lib/fulfillment-sla';
import {
  ApiError,
  confirmPublishPayment,
  createExport,
  getSite,
  listEditRequests,
  listFormSubmissions,
  publishSite,
} from './api';
import { DomainSection } from './domain-connect';
import { Modal } from './modal';
import { HumanPublishChecklist } from '@/components/publish/HumanPublishChecklist';
import { PublishPaymentDialog } from '@/components/publish/PublishPaymentDialog';
import {
  publishPaymentQuoteFromExtra,
  type PublishPaymentQuote,
} from '@/lib/billing/publish-payment-contract';
import { businessInfoRequiredForPublish } from '@/lib/legal/templates';
import { SitePreview } from './site-preview';
import { useToast } from './toast';
import {
  Badge,
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

function PreviewCard({ site, tier }: { site: Site; tier: Tier }) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const { toast } = useToast();
  const [source, setSource] = useState<'draft' | 'published'>(site.draftConfig ? 'draft' : 'published');
  // [G1] 모션 미리보기 — 발행 전 reveal/ken-burns 실동작을 기본 재생(토글은 '끄기' 용도)
  const [motionOn, setMotionOn] = useState(true);
  const [previewAsAddon, setPreviewAsAddon] = useState(false);
  const ownsVideoAddon = hasVideoAddon(tier);

  const hasBoth = Boolean(site.draftConfig && site.siteConfig);
  const config = source === 'draft' ? (site.draftConfig ?? site.siteConfig) : (site.siteConfig ?? site.draftConfig);

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-400">Preview</span>
          {hasBoth ? (
            <div className="flex overflow-hidden rounded-lg border border-neutral-700 text-[11px]">
              {(
                [
                  ['draft', "draft"],
                  ['published', "edition"],
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
              {site.draftConfig ? "draft basis" : "Based on published version"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
        {!ownsVideoAddon ? (
          <button
            type="button"
            onClick={() => setPreviewAsAddon((value) => !value)}
            aria-pressed={previewAsAddon}
            className={cn(
              'flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors',
              previewAsAddon
                ? 'border-ob-accent-strong bg-ob-accent-soft font-medium text-ob-accent-strong'
                : 'border-ob-border text-ob-muted hover:border-ob-muted hover:text-ob-ink',
            )}
          >
            <Film className="h-3 w-3" />
            Example of application of embedded video
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setMotionOn((v) => !v)}
          aria-pressed={motionOn}
          className={cn(
            'flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors',
            motionOn
              ? 'border-[#c8a96a] bg-[#2a2117] font-medium text-[#d9b878]'
              : 'border-neutral-700 text-neutral-500 hover:text-neutral-300',
          )}
        >
          <Play className="h-3 w-3" />
          motion
        </button>
        <div className="flex overflow-hidden rounded-lg border border-neutral-700">
          <button
            type="button"
            onClick={() => setMode('desktop')}
            aria-label="desktop preview"
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
            aria-label="Mobile Preview"
            className={cn(
              'flex h-7 w-9 items-center justify-center transition-colors',
              mode === 'mobile' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300',
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
        </div>
      </div>
      <div className="bg-neutral-950 p-4">
        {config ? (
          <div className={cn('mx-auto overflow-hidden rounded-lg border border-neutral-800', mode === 'mobile' && 'max-w-[300px]')}>
            <SitePreview
              config={config}
              mode={mode}
              maxHeight={560}
              scroll
              interactive
              motion={motionOn}
              previewAsAddon={previewAsAddon}
              tier={tier}
              onFormSubmit={() => toast('info', "After publication, an inquiry will be sent from the actual site.")}
            />
          </div>
        ) : (
          <EmptyState
            title="There is no content to display"
            description="If you edit your site in the editor, you can preview it here."
          />
        )}
      </div>
    </Card>
  );
}

// ---------- 정적 HTML 백업 (§5) ----------

function BackupCard({ site }: { site: Site }) {
  const { toast } = useToast();
  const [downloadUrl, setDownloadUrl] = useState<string | null>(
    site.exportStatus === 'ready' && site.exportUrl ? `/api/sites/${site.id}/export/download` : null,
  );

  const mutation = useMutation({
    mutationFn: () => createExport(site.id),
    onSuccess: (result) => {
      setDownloadUrl(result.downloadUrl);
      const warned = result.warnings && result.warnings.length > 0;
      toast(
        warned ? 'info' : 'success',
        warned
          ? `Backup creation complete — some asset warnings${result.warnings!.length}Gun (maintain original link)`
          : "Your backup is ready. Download it below.",
      );
    },
    onError: (err) => {
      toast('error', err instanceof Error ? err.message : "Backup creation failed.");
    },
  });

  return (
    <Card className="mt-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-300">
          <Package className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-neutral-200">HTML backup (transfer/download)</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            You can download the published version as a static HTML bundle (zip) and run it directly on any web hosting.
            Includes desktop/mobile layouts, images, and fonts. {DYNAMIC_FEATURE_NOTICE}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={!site.siteConfig}
              title={site.siteConfig ? undefined : "Can be backed up after publication"}
            >
              <Package className="h-4 w-4" />
              {downloadUrl ? "Recreate backup" : "Create HTML Backup"}
            </Button>
            {downloadUrl ? (
              <a
                href={downloadUrl}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#4a3a22] bg-[#151310] px-4 text-sm text-[#d9b878] transition-colors hover:border-[#c8a96a]"
              >
                <Download className="h-4 w-4" />
                zip download
              </a>
            ) : null}
          </div>
          {!site.siteConfig ? (
            <p className="mt-2 text-[11px] text-neutral-600">Publishing allows you to create a backup.</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ---------- AI 영상 이행 상태 ----------

function HeroVideoStatusCard({ site, tier }: { site: Site; tier: Tier }) {
  const config = site.draftConfig ?? site.siteConfig;
  const plan = heroVideoResumePlan(config);
  if (!plan.requested) return null;
  const status: VideoFulfillmentStatus = plan.applied
    ? 'applied'
    : hasVideoAddon(tier)
      ? 'reviewing'
      : 'received';

  return (
    <Card className="mt-6 border-[#4a3a22] bg-[#151310]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2a2117] text-[#d9b878]">
          <Film className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-100">AI video homepage</h2>
            <Badge tone={status === 'applied' ? 'emerald' : 'blue'}>
              {VIDEO_FULFILLMENT_STATUS_LABELS[status]}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-400">
            {VIDEO_FULFILLMENT_COPY}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------- [v3 Phase 3] 문의함 ----------

const SUBMISSION_FIELD_LABELS: Record<string, string> = {
  name: "name",
  phone: "contact",
  email: "email",
  message: "Inquiry details",
};

function FormInbox({ siteId }: { siteId: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['form-submissions', siteId],
    queryFn: () => listFormSubmissions(siteId),
  });

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-neutral-400" />
        <h2 className="text-sm font-semibold text-neutral-300">Inquiry</h2>
        {data && data.length > 0 ? (
          <span className="rounded-full bg-[#2a2117] px-2 py-0.5 text-[11px] font-medium text-[#d9b878]">
            {data.length}
          </span>
        ) : null}
      </div>
      {isPending ? (
        <Skeleton className="h-16" />
      ) : isError ? (
        <ErrorState message="Failed to load inquiry box." onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title="No inquiries have been received yet"
          description="If you put an inquiry form on your site, visitors’ inquiries will accumulate here."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-neutral-800">
            {data.map((sub) => (
              <li key={sub.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                    {(['name', 'phone', 'email'] as const)
                      .filter((k) => sub.payload[k])
                      .map((k) => (
                        <span key={k} className="text-neutral-200">
                          <span className="mr-1 text-[11px] text-neutral-500">{SUBMISSION_FIELD_LABELS[k]}</span>
                          {sub.payload[k]}
                        </span>
                      ))}
                  </div>
                  <span className="text-[11px] text-neutral-600">{formatDateTime(sub.createdAt)}</span>
                </div>
                {sub.payload.message ? (
                  <p className="mt-1 text-xs leading-5 whitespace-pre-wrap text-neutral-400">{sub.payload.message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
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
        <h2 className="text-sm font-semibold text-neutral-300">Edit request history</h2>
        <Link
          href="/dashboard/credits"
          className="text-xs text-neutral-500 transition-colors hover:text-[#c8a96a]"
        >
          New edit request →
        </Link>
      </div>
      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : isError ? (
        <ErrorState message="Failed to load edit request history." onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title="There are no editorial requests for this site"
          description="Editing directly in the editor is free. Use credits only for AI regeneration or managed editing services."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-neutral-800">
            {data.map((req) => (
              <li key={req.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-200">
                    <span className="font-medium">{EDIT_TYPE_LABELS[req.type]}</span>
                    <span className="text-neutral-500"> · Credits {req.creditCost} items</span>
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

export function SiteDetail({
  siteId,
  tier,
  aiEditAvailable,
}: {
  siteId: string;
  tier: Tier;
  aiEditAvailable: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // 발행 전 사업자 정보 + 휴먼 3체크 모달
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [bizConfirmed, setBizConfirmed] = useState(false);
  const [humanChecks, setHumanChecks] = useState<PublishHumanChecks>(emptyPublishHumanChecks);
  const [publishQuote, setPublishQuote] = useState<PublishPaymentQuote | null>(null);
  const [pendingHumanChecks, setPendingHumanChecks] = useState<PublishHumanChecks | null>(null);
  const [paying, setPaying] = useState(false);

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => getSite(siteId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const publishMutation = useMutation({
    mutationFn: (checks: PublishHumanChecks) => publishSite(siteId, checks),
    onSuccess: (result) => {
      setPublishConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast(
        'success',
        result.preflight.warnings.length > 0
          ? `Publication completed · Operation QA confirmed${result.preflight.warnings.length} records`
          : result.url
            ? `Published —${result.url.replace(/^https?:\/\//, '')}live at`
            : "Publication has been completed.",
      );
    },
    onError: (err, checks) => {
      if (err instanceof ApiError && err.code === 'PUBLISH_PAYMENT_REQUIRED') {
        const quote = publishPaymentQuoteFromExtra(err.extra);
        if (quote) {
          setPendingHumanChecks(checks);
          setPublishQuote(quote);
          setPublishConfirmOpen(false);
          return;
        }
      }
      toast('error', err instanceof Error ? err.message : "Publishing failed.");
    },
  });

  const handlePublishPayment = async () => {
    if (!publishQuote || !pendingHumanChecks || paying) return;
    setPaying(true);
    try {
      const payment = await confirmPublishPayment(siteId, publishQuote);
      if (!payment.paid) {
        window.location.assign(payment.checkoutUrl);
        return;
      }
      const result = await publishSite(siteId, pendingHumanChecks);
      setPublishQuote(null);
      setPendingHumanChecks(null);
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast(
        'success',
        result.url
          ? `Payment confirmation/issuance completed —${result.url.replace(/^https?:\/\//, '')}`
          : "After payment is confirmed, issuance is complete.",
      );
    } catch (err) {
      toast('error', err instanceof Error ? err.message : "Payment confirmation failed.");
    } finally {
      setPaying(false);
    }
  };

  if (siteQuery.isPending) return <DetailSkeleton />;

  if (siteQuery.isError) {
    const notFound = siteQuery.error instanceof ApiError && siteQuery.error.status === 404;
    return (
      <div className="py-10">
        {notFound ? (
          <EmptyState
            icon={<Globe className="h-8 w-8" />}
            title="Site not found"
            description="The site has been deleted or you do not have access to it."
            action={
              <Link href="/dashboard" className="text-sm text-[#c8a96a] hover:underline">
                Return to My Site List
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
  const businessInfoRequired = site.draftConfig
    ? businessInfoRequiredForPublish(site.draftConfig)
    : true;
  const updateHumanCheck = (id: PublishHumanCheckId, checked: boolean) => {
    setHumanChecks((current) => ({ ...current, [id]: checked }));
  };

  return (
    <div>
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />my site
      </Link>

      <PageHeader
        title={site.name}
        description={`generation${formatDate(site.createdAt)}${site.publishedAt ? `· Recently published${formatDateTime(site.publishedAt)}` : "· Before publication"}`}
        actions={
          <>
            <Link
              href={`/dashboard/sites/${site.id}/editor`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
            >
              <PencilRuler className="h-4 w-4" />
              Open editor
            </Link>
            <Button
              onClick={() => {
                setBizConfirmed(false);
                setHumanChecks(emptyPublishHumanChecks());
                setPublishConfirmOpen(true);
              }}
              loading={publishMutation.isPending}
              disabled={!site.draftConfig}
              title={site.draftConfig ? undefined : "There are no drafts to publish"}
            >
              <Rocket className="h-4 w-4" />
              {isPublished ? "reissue" : "Publish"}
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
            className="inline-flex items-center gap-1 text-xs text-ob-muted transition-colors hover:text-ob-accent-strong"
          >
            <Globe className="h-3.5 w-3.5" />
            {site.domain}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-ob-muted">Upon publishing, your subdomain will be assigned immediately</span>
        )}
      </div>

      <PreviewCard site={site} tier={tier} />

      <HeroVideoStatusCard site={site} tier={tier} />

      {isPublished ? <BackupCard site={site} /> : null}

      <DomainSection site={site} />

      <FormInbox siteId={siteId} />

      {aiEditAvailable ? <EditHistory siteId={siteId} /> : null}

      {/* 사업자 정보 확인과 휴먼 3체크는 서로 별도이며 서버도 둘 다 요구한다. */}
      <Modal
        open={publishConfirmOpen}
        onClose={() => setPublishConfirmOpen(false)}
        title="Final confirmation before publication"
        footer={
          site.draftConfig && (site.draftConfig.businessInfo || !businessInfoRequired) ? (
            <>
              <Button variant="ghost" onClick={() => setPublishConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  (Boolean(site.draftConfig.businessInfo) && !bizConfirmed)
                  || !allPublishHumanChecksConfirmed(humanChecks)
                }
                loading={publishMutation.isPending}
                onClick={() => publishMutation.mutate(humanChecks)}
              >
                <Rocket className="h-4 w-4" />
                Publish
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPublishConfirmOpen(false)}>
                Close
              </Button>
              <Link
                href={`/dashboard/sites/${siteId}/editor`}
                className="inline-flex h-10 items-center gap-1.5 rounded-ob bg-ob-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-ob-accent-strong"
              >
                <PencilRuler className="h-4 w-4" />
                Enter in the editor
              </Link>
            </>
          )
        }
      >
        {site.draftConfig?.businessInfo ? (
          <div className="space-y-3">
            <div className="space-y-1.5 rounded-ob border border-ob-border bg-ob-bg px-3.5 py-3 text-sm">
              {site.draftConfig.businessInfo.isPersonal ? (
                <p className="text-[11px] font-medium text-ob-accent-strong">privately operated site</p>
              ) : null}
              {(
                [
                  ["mutual", site.draftConfig.businessInfo.businessName],
                  [site.draftConfig.businessInfo.isPersonal ? "operator" : "exponent", site.draftConfig.businessInfo.ownerName],
                  ["Business registration number", site.draftConfig.businessInfo.businessNumber],
                  ["address", site.draftConfig.businessInfo.address],
                  ["phone call", site.draftConfig.businessInfo.phone],
                ] as const
              )
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} className="flex gap-3">
                    <span className="w-28 shrink-0 text-[11px] leading-5 text-ob-muted">{label}</span>
                    <span className="min-w-0 flex-1 text-ob-ink">{v}</span>
                  </div>
                ))}
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-ob border border-ob-border bg-ob-surface px-3.5 py-3">
              <input
                type="checkbox"
                checked={bizConfirmed}
                onChange={(e) => setBizConfirmed(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#174DDA]"
              />
              <span className="text-xs leading-5 text-ob-ink">
                I have verified that the above information is accurate. It is posted as a legal notation at the bottom of the published site.
              </span>
            </label>
            <HumanPublishChecklist value={humanChecks} onChange={updateHumanCheck} />
          </div>
        ) : !businessInfoRequired ? (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-ob-muted">
              Business information is optional for this site. No legal footer will be shown unless you add it.
            </p>
            <HumanPublishChecklist value={humanChecks} onChange={updateHumanCheck} />
          </div>
        ) : (
          <p className="text-sm leading-6 text-ob-muted">
            To issue, business (or operator) information is required. at the bottom left of the editor{' '}
            <span className="text-ob-accent-strong">Business information</span>Please enter it in and then publish it.
          </p>
        )}
      </Modal>
      <PublishPaymentDialog
        quote={publishQuote}
        paying={paying}
        onClose={() => {
          setPublishQuote(null);
          setPendingHumanChecks(null);
        }}
        onConfirm={() => void handlePublishPayment()}
      />
    </div>
  );
}
