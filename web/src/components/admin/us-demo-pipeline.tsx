'use client';

import { US_MEDICAL_PREVIEW_RETENTION_DAYS } from '@/lib/crawl/contracts';

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  Info,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  createUsMedicalDemoConsent,
  createUsMedicalDemoPreview,
  crawlUsMedicalConsentedDemo,
  crawlUsMedicalDemo,
  enableUsDemoQaExclusion,
  getUsMedicalDemoArtifact,
  type AdminUsDemoArtifactResponse,
  type AdminUsDemoPreviewResponse,
  type AdminUsDemoSourceBlock,
} from './api';
import { normalizeUrlInput } from '@/lib/url-input';
import {
  collectDisabledReason,
  crawlElapsedLabel,
  crawlExpectationLine,
  errorBelongsToSlot,
  previewDisabledReason,
  type UsDemoErrorSlot,
  type UsDemoPipelineError,
} from './us-demo-feedback';

const BLOCKER_NATURE_LABELS = {
  claim: 'a claim in the copy',
  omission: 'a required statement that is missing',
  classification: 'a classification mismatch',
} as const;

const GROUP_LABELS = {
  entity: "Hospital information link",
  structuredSchema: "Structured Hospital Information",
  evidence: "Evidence and Sources",
  answerExtraction: "Question/answer structure",
  access: "Search Access",
} as const;

const BLOCK_KIND_LABELS = {
  business_name: "Hospital name",
  introduction: "introduction",
  service: "Medical treatment items",
  service_detail: "treatment text",
  provider_name: "medical staff name",
  provider_credential: "Medical staff qualifications",
  provider_bio: "Medical staff biographies",
  insurance: "insurance",
  price_or_financing: "Price/Finance",
  faq_question: "question",
  faq_answer: "answer",
  cta: "Original CTA",
  phone: "phone call",
  address: "address",
  opening_hours: "clinic hours",
} as const;

type PipelineStatus = 'idle' | 'crawling' | 'ready' | 'publishing';

function moveBlock(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const next = [...ids];
  const from = next.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function dispositionClasses(block: AdminUsDemoSourceBlock): string {
  if (block.disposition === 'blocked') return 'border-red-200 bg-red-50/70';
  if (block.disposition === 'review') return 'border-amber-200 bg-amber-50/70';
  return 'border-emerald-200 bg-emerald-50/40';
}

/**
 * One alert per action, rendered where the action is. A single error slot at the top of the form
 * put a failed preview roughly 150,000 px above the button that failed on a real practice page,
 * which is indistinguishable from the button doing nothing.
 */
function SlotAlert({
  error,
  slot,
}: {
  error: UsDemoPipelineError | null;
  slot: UsDemoErrorSlot;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const visible = errorBelongsToSlot(error, slot);
  const message = visible ? error?.message : undefined;
  useEffect(() => {
    if (!message) return;
    // 'nearest' so an alert already on screen does not yank the page out from under the operator.
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [message]);
  if (!visible || !error) return null;
  return (
    <p
      ref={ref}
      role="alert"
      data-error-slot={slot}
      className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {error.message}
    </p>
  );
}

/** The sentence a disabled button owes the operator. Never rendered when `reason` is null. */
function DisabledReason({ reason, slot }: { reason: string | null; slot: string }) {
  if (!reason) return null;
  return (
    <p data-disabled-reason={slot} className="mt-1.5 max-w-xs text-right text-xs leading-4 text-[#6a7286]">
      {reason}
    </p>
  );
}

function CopyPreviewLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined);
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

export function UsDemoPipeline() {
  const [url, setUrl] = useState('');
  const [allowTlsHttpFallback, setAllowTlsHttpFallback] = useState(false);
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [detail, setDetail] = useState<AdminUsDemoArtifactResponse | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [approvedReviewIds, setApprovedReviewIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<AdminUsDemoPreviewResponse['preview'] | null>(null);
  const [renderMode, setRenderMode] = useState<'preview-full' | 'outreach-safe'>('outreach-safe');
  const [consentedTransfer, setConsentedTransfer] = useState(false);
  const [prospectId, setProspectId] = useState('');
  const [consenterName, setConsenterName] = useState('');
  const [consenterTitle, setConsenterTitle] = useState('');
  const [consentedAt, setConsentedAt] = useState('');
  const [consentNotes, setConsentNotes] = useState('');
  const [error, setError] = useState<UsDemoPipelineError | null>(null);
  const [crawlElapsedSeconds, setCrawlElapsedSeconds] = useState(0);
  const previewPanelRef = useRef<HTMLElement | null>(null);

  // Only ever false for US medical previews, which are the ones that get sent to a prospect.
  const previewUndeliverable = preview?.deliverable === false;

  /**
   * A collection is one POST that returns after every page, so elapsed time is the only honest
   * signal the browser has. A spinner alone cannot tell a two-minute crawl from a hung request.
   */
  useEffect(() => {
    if (status !== 'crawling') return;
    // The counter is zeroed by runCrawl, not here: a synchronous setState in an effect body
    // cascades a render, and the reset belongs to the event that starts the collection anyway.
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setCrawlElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [status]);

  /** The link is the product of the whole page; it must not appear below the fold it was made at. */
  useEffect(() => {
    if (!preview?.id) return;
    previewPanelRef.current?.scrollIntoView?.({ block: 'start' });
  }, [preview?.id]);

  const blocksById = new Map(
    detail?.artifact.usDemo.blocks.map((block) => [block.id, block]) ?? [],
  );
  const orderedBlocks = orderedIds
    .map((id) => blocksById.get(id))
    .filter((block): block is AdminUsDemoSourceBlock => Boolean(block));

  /**
   * One source for both `disabled` and the sentence under the button: a reason that could appear
   * beside a working button would be worse than the silent fade it replaces.
   */
  const collectReason = collectDisabledReason({
    url,
    status,
    consentedTransfer,
    prospectId,
    consenterName,
    consenterTitle,
    consentedAt,
  });
  const previewReason = detail
    ? previewDisabledReason({
        status,
        includedBlockCount: includedIds.size,
        englishSourceReady: detail.artifact.usDemo.englishSourceReady,
      })
    : null;

  async function runCrawl() {
    const target = normalizeUrlInput(url);
    if (!target.ok) {
      setError({ slot: 'collect', message: target.reason });
      return;
    }
    setUrl(target.url);
    setStatus('crawling');
    setCrawlElapsedSeconds(0);
    setError(null);
    setPreview(null);
    try {
      const crawled = consentedTransfer
        ? await (async () => {
            const recorded = await createUsMedicalDemoConsent({
              prospectId,
              consenterName,
              consenterTitle,
              consentedAt: new Date(consentedAt).toISOString(),
              notes: consentNotes,
            });
            return crawlUsMedicalConsentedDemo({
              url: target.url,
              consentId: recorded.consent.id,
              prospectId,
              allowTlsHttpFallback,
            });
          })()
        : await crawlUsMedicalDemo(target.url, allowTlsHttpFallback);
      const artifact = await getUsMedicalDemoArtifact(crawled.artifact.id);
      const sourceBlocks = artifact.artifact.usDemo.blocks;
      setDetail(artifact);
      setOrderedIds(sourceBlocks.map((block) => block.id));
      setIncludedIds(new Set(
        sourceBlocks
          .filter((block) => block.disposition === 'allowed')
          .map((block) => block.id),
      ));
      setApprovedReviewIds(new Set());
      setStatus('ready');
    } catch (reason) {
      setStatus('idle');
      setError({
        slot: 'collect',
        message: reason instanceof Error ? reason.message : "Collection failed.",
      });
    }
  }

  function toggleBlock(block: AdminUsDemoSourceBlock) {
    if (block.disposition === 'blocked') return;
    setIncludedIds((current) => {
      const next = new Set(current);
      if (next.has(block.id)) {
        next.delete(block.id);
        setApprovedReviewIds((approvals) => {
          const reduced = new Set(approvals);
          reduced.delete(block.id);
          return reduced;
        });
      } else {
        next.add(block.id);
        if (block.disposition === 'review') {
          setApprovedReviewIds((approvals) => new Set(approvals).add(block.id));
        }
      }
      return next;
    });
  }

  async function publishPreview() {
    if (!detail) return;
    setStatus('publishing');
    setError(null);
    try {
      const response = await createUsMedicalDemoPreview(
        detail.artifact.id,
        {
          includeBlockIds: orderedIds.filter((id) => includedIds.has(id)),
          orderedBlockIds: orderedIds.filter((id) => includedIds.has(id)),
          approvedReviewBlockIds: orderedIds.filter((id) => approvedReviewIds.has(id)),
        },
        renderMode,
        consentedTransfer,
      );
      setPreview(response.preview);
      setStatus('ready');
    } catch (reason) {
      setStatus('ready');
      setError({
        slot: 'preview',
        message: reason instanceof Error ? reason.message : "Preview creation failed.",
      });
    }
  }

  async function openPreview() {
    if (!preview) return;
    setError(null);
    try {
      await enableUsDemoQaExclusion();
      window.open(preview.url, '_blank', 'noopener,noreferrer');
    } catch (reason) {
      setError({
        slot: 'qa',
        message: reason instanceof Error
          ? reason.message
          : "Setting up internal QA exclusions failed.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5" data-us-demo-pipeline>
      <header className="rounded-2xl border border-[#DFE1E6] bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-[#2D63F0]">
              US MEDICAL OUTREACH
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#141A3A]">
              English Hospital Demonstration Assembly
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#545C70]">
              After collecting only the public English text, diagnosing the structure, and checking which blocks Andy will use,
              Create a private {US_MEDICAL_PREVIEW_RETENTION_DAYS}-day preview. Patient information, reviews, translations, and new efficacy statements are not included.
            </p>
          </div>
          <div className="rounded-xl bg-[#EEF4FF] p-3 text-[#2D63F0]">
            <Globe2 size={24} aria-hidden />
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[#DFE1E6] bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-sm font-semibold text-[#22304A]">Target hospital URL</span>
            <input
              type="text"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="clinic.example.com"
              className="mt-2 w-full rounded-lg border border-[#C9D5E7] bg-white px-3 py-2.5 text-sm outline-none ring-[#2D63F0] focus:ring-2"
            />
          </label>
          <div className="flex flex-col items-stretch lg:items-end">
            <button
              type="button"
              disabled={collectReason !== null}
              onClick={runCrawl}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#2D63F0] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {status === 'crawling' && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
              Collect and Diagnose
            </button>
            <DisabledReason reason={collectReason} slot="collect" />
          </div>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-[#6a7286]">
          <input
            type="checkbox"
            checked={allowTlsHttpFallback}
            onChange={(event) => setAllowTlsHttpFallback(event.target.checked)}
          />
          Only pre-approved pilot hosts continue to collect certificate errors as HTTP public pages
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#22304A]">
          <input
            type="checkbox"
            checked={consentedTransfer}
            onChange={(event) => setConsentedTransfer(event.target.checked)}
          />
          Full transfer demo based on verbal consent
        </label>
        {consentedTransfer ? (
          <div className="mt-3 grid gap-3 rounded-xl border border-[#C9D5E7] bg-[#F7F9FC] p-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#22304A]">
              Prospect ID
              <input
                required
                value={prospectId}
                onChange={(event) => setProspectId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#C9D5E7] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-[#22304A]">
              call date and time
              <input
                required
                type="datetime-local"
                value={consentedAt}
                onChange={(event) => setConsentedAt(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#C9D5E7] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-[#22304A]">
              consenter name
              <input
                required
                value={consenterName}
                onChange={(event) => setConsenterName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#C9D5E7] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-[#22304A]">
              consenter title
              <input
                required
                value={consenterTitle}
                onChange={(event) => setConsenterTitle(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#C9D5E7] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-[#22304A] sm:col-span-2">
              call notes
              <input
                type="text"
                value={consentNotes}
                onChange={(event) => setConsentNotes(event.target.value)}
                maxLength={2000}
                className="mt-1 w-full rounded-lg border border-[#C9D5E7] bg-white px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs leading-5 text-[#6a7286] sm:col-span-2">
              The scope of consent is fixed to demo-by-email. robots·Once per second·Identifiable crawler UA remains the same.
            </p>
          </div>
        ) : null}
        <SlotAlert error={error} slot="collect" />
        {status === 'crawling' && (
          <div
            data-crawl-progress
            aria-live="polite"
            className="mt-4 rounded-xl border border-[#C9D5E7] bg-[#F7F9FC] p-4"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-[#22304A]">
              <LoaderCircle size={16} className="animate-spin" aria-hidden />
              Collecting public pages · {crawlElapsedLabel(crawlElapsedSeconds)}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[#6a7286]">
              {/*
                * null, deliberately: the effective cap is `consentedCrawlMaxPages()` from the
                * server-side US_CONSENTED_CRAWL_MAX_PAGES, which the browser cannot read. A
                * number guessed from the compiled default would be a number the server may not
                * be using.
                */}
              {crawlExpectationLine(null)}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#6a7286]">
              This is a single request, so nothing updates until it returns. Leave the tab open.
            </p>
          </div>
        )}
      </section>

      {detail && (
        <>
          <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <article className="rounded-2xl border border-[#DFE1E6] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" aria-hidden />
                <h2 className="font-bold text-[#141A3A]">Collect safety records</h2>
              </div>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-[#6a7286]">public pages read</dt>
                  <dd className="mt-1 font-semibold">{detail.artifact.visitedUrls.length} items</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#6a7286]">Storage expiration</dt>
                  <dd className="mt-1">{new Date(detail.artifact.expiresAt).toLocaleString('ko-KR')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#6a7286]">English text sufficiency</dt>
                  <dd className="mt-1 font-semibold">
                    {detail.artifact.usDemo.englishSourceReady ? "Compilable" : "Lack of original text — production halted"}
                  </dd>
                </div>
                {detail.artifact.crawlCoverage ? (
                  <div>
                    <dt className="text-xs text-[#6a7286]">Consent Crawl Coverage</dt>
                    <dd className="mt-1 font-semibold">
                      {detail.artifact.crawlCoverage.crawledPages}
                      {' / '}
                      {detail.artifact.crawlCoverage.estimatedSourcePages}page
                    </dd>
                  </div>
                ) : null}
              </dl>
              <details className="mt-4 text-xs text-[#545C70]">
                <summary className="cursor-pointer font-semibold">View visit URL</summary>
                <ul className="mt-2 space-y-1 break-all">
                  {detail.artifact.visitedUrls.map((visitedUrl) => (
                    <li key={visitedUrl}>{visitedUrl}</li>
                  ))}
                </ul>
              </details>
            </article>

            <article className="rounded-2xl border border-[#DFE1E6] bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-[#6a7286]">American Medical Outreach Diagnosis</p>
                  <h2 className="mt-1 text-xl font-bold text-[#141A3A]">
                    {detail.artifact.usDemo.sourceVisibility.score} / 100
                  </h2>
                </div>
                <span className="text-xs text-[#6a7286]">
                  Server HTML structure read by search and AI
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {Object.entries(GROUP_LABELS).map(([group, label]) => {
                  const score = detail.artifact.usDemo.sourceVisibility.groups[
                    group as keyof typeof GROUP_LABELS
                  ];
                  return (
                    <div key={group} className="rounded-lg bg-[#F4F7FB] p-3">
                      <p className="text-[11px] leading-4 text-[#6a7286]">{label}</p>
                      <p className="mt-1 text-sm font-bold text-[#22304A]">
                        {score.earned}/{score.weight}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-[#DFE1E6] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-[#141A3A]">Public original text manual closure</h2>
                <p className="mt-1 text-sm text-[#6a7286]">
                  You can just select the original text and change the order. You cannot rewrite or translate sentences.
                </p>
              </div>
              <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-semibold text-[#2D63F0]">
                Select {includedIds.size} / {orderedBlocks.length}
              </span>
            </div>

            <ol className="mt-4 space-y-3">
              {orderedBlocks.map((block, index) => (
                <li
                  key={block.id}
                  className={`grid gap-3 rounded-xl border p-4 md:grid-cols-[auto_1fr_auto] ${dispositionClasses(block)}`}
                >
                  <input
                    type="checkbox"
                    checked={includedIds.has(block.id)}
                    disabled={block.disposition === 'blocked'}
                    onChange={() => toggleBlock(block)}
                    aria-label={`${BLOCK_KIND_LABELS[block.kind]}Use original text`}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#22304A]">
                        {BLOCK_KIND_LABELS[block.kind]}
                      </span>
                      <span className="rounded bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#6a7286]">
                        {block.disposition === 'allowed'
                          ? "available"
                          : block.disposition === 'review'
                            ? "Andy needs confirmation"
                            : "Block use"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#22304A]">{block.text}</p>
                    <p className="mt-2 truncate text-[11px] text-[#6a7286]">
                      {block.sourceUrl} · SHA {block.originalSha256.slice(0, 12)}
                    </p>
                    {block.violations.map((violation) => (
                      <p key={`${violation.category}-${violation.matchedText}`} className="mt-1 text-xs text-amber-800">
                        {violation.rationale}
                      </p>
                    ))}
                  </div>
                  <div className="flex items-start gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => setOrderedIds((ids) => moveBlock(ids, block.id, -1))}
                      aria-label="Move up text block"
                      className="rounded border border-[#C9D5E7] bg-white p-1.5 disabled:opacity-35"
                    >
                      <ArrowUp size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={index === orderedBlocks.length - 1}
                      onClick={() => setOrderedIds((ids) => moveBlock(ids, block.id, 1))}
                      aria-label="Move down text block"
                      className="rounded border border-[#C9D5E7] bg-white p-1.5 disabled:opacity-35"
                    >
                      <ArrowDown size={14} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-[#E8EEF6] pt-4">
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs text-[#6a7286]">
                  <LockKeyhole size={14} aria-hidden />
                  Both modes will be index blocked and will result in a 404 after {US_MEDICAL_PREVIEW_RETENTION_DAYS} days.
                </p>
                <label className="block text-xs font-semibold text-[#22304A]">
                  render mode
                  <select
                    value={renderMode}
                    onChange={(event) => setRenderMode(
                      event.target.value as 'preview-full' | 'outreach-safe',
                    )}
                    className="ml-2 rounded-lg border border-[#C9D5E7] bg-white px-3 py-2 text-sm"
                  >
                    <option value="preview-full">Internal evaluation · full multi-page</option>
                    <option value="outreach-safe">For shipping · safe single page</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-col items-stretch sm:items-end">
                <button
                  type="button"
                  disabled={previewReason !== null}
                  onClick={publishPreview}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#0B765C] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {status === 'publishing' && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
                  Create a private demo
                </button>
                <DisabledReason reason={previewReason} slot="preview" />
                {/*
                  * The failure of this button belongs beside this button. The old single slot sat
                  * at the top of the form, up to 155,000 px above here on a 63-page practice.
                  */}
                <SlotAlert error={error} slot="preview" />
              </div>
            </div>
          </section>
        </>
      )}

      {preview && (
        <section
          ref={previewPanelRef}
          data-preview-panel
          className={
            previewUndeliverable
              ? 'rounded-2xl border border-amber-300 bg-amber-50 p-5'
              : 'rounded-2xl border border-emerald-200 bg-emerald-50 p-5'
          }
        >
          {/*
            * First in the panel, because it is the thing the operator came for and the panel is
            * the bottom of a page that can run to six figures of pixels. The deliverability
            * warning stays immediately below it — still on the panel that carries the link, still
            * before any send — so scrolling the link into view brings the warning with it.
            */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-white/80 p-3">
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 break-all text-sm font-semibold text-emerald-900 underline"
            >
              {preview.url}
            </a>
            <CopyPreviewLink url={preview.url} />
          </div>
          {previewUndeliverable ? (
            /**
             * Shown here, on the panel that carries the link, because the only thing this warning
             * can accomplish is stopping a send. An operator who has already emailed the prospect
             * cannot act on it.
             */
            <div className="mb-4 rounded-xl border border-amber-400 bg-white/70 p-4">
              <p className="flex items-center gap-2 font-bold text-amber-900">
                <AlertTriangle size={18} aria-hidden />
                This preview is not deliverable as a paid site
              </p>
              <p className="mt-2 text-sm text-amber-900">
                The prospect can open it, but the US medical advertising screen would refuse this
                page at build time. Sending it offers something we cannot currently produce.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {(preview.deliveryBlockers ?? []).map((blocker) => (
                  <li key={`${blocker.ruleId}:${blocker.detail}`}>
                    <code className="font-semibold">{blocker.ruleId}</code>
                    {' — '}
                    {BLOCKER_NATURE_LABELS[blocker.nature]}
                    {': '}
                    {blocker.detail}
                    {blocker.nature === 'omission' ? (
                      <> Nothing in the copy can be rewritten to fix an absence, so this needs a decision, not an edit.</>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview.deliveryAdvisories?.length ? (
            /**
             * Same panel as the link, for the same reason as the blocker list: this is something
             * to check before sending, not afterwards. It is worded as a check rather than a
             * refusal because the sentence is the practice's own factual claim and the screen has
             * no registry to verify it against — it does not stop the send.
             */
            <div className="mb-4 rounded-xl border border-slate-300 bg-white/70 p-4">
              <p className="flex items-center gap-2 font-bold text-slate-900">
                <Info size={18} aria-hidden />
                Credential claims to confirm with the practice
              </p>
              <p className="mt-2 text-sm text-slate-700">
                These are deliverable. The practice is the party attesting to them, so confirm the
                claim is current before the page goes out.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {preview.deliveryAdvisories.map((advisory) => (
                  <li key={`${advisory.ruleId}:${advisory.detail}`}>
                    <code className="font-semibold">{advisory.ruleId}</code>
                    {' — '}
                    {advisory.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-bold text-emerald-900">
                <CheckCircle2 size={18} aria-hidden />
                Share preview is ready
              </p>
              <p className="mt-2 text-sm text-emerald-800">
                original text {preview.sourceReport.usedBlocks}Dog use · {preview.sourceReport.excludedBlocks}excluding dogs
              </p>
              {preview.sourceReport.policyExcludedBlocks ? (
                <p className="mt-1 text-xs text-amber-800">
                  US medical advertising policy on hold {preview.sourceReport.policyExcludedBlocks} items
                </p>
              ) : null}
              {preview.emailEvidenceLine ? (
                <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs text-emerald-900">
                  Email supporting text: {preview.emailEvidenceLine}
                </p>
              ) : null}
              <p className="mt-1 break-all text-xs text-emerald-700">
                {/* The link itself now leads the panel; this keeps only what it did not carry. */}
                Expires {new Date(preview.expiresAt).toLocaleString('ko-KR')}
              </p>
              {/*
                * The hand-off to delivery. Once the prospect says yes, this id is what ships their
                * approved bytes as a paid site — every other operator mode compiles a second,
                * different site. The clients page opens on the delivery mode when it carries it.
                */}
              <p className="mt-2 break-all text-xs text-emerald-800">
                Approved? Deliver preview{' '}
                <code className="rounded bg-white/70 px-1 py-0.5 font-mono">{preview.id}</code>{' '}
                <a
                  className="underline"
                  href={`/admin/clients?previewId=${encodeURIComponent(preview.id)}`}
                >
                  on the customer&apos;s page
                </a>
              </p>
            </div>
            <div className="flex flex-col items-stretch sm:items-end">
              <button
                type="button"
                onClick={openPreview}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Open after excluding internal QA
                <ExternalLink size={15} aria-hidden />
              </button>
              {/* The QA-cookie call is this button's own failure; it belongs under this button. */}
              <SlotAlert error={error} slot="qa" />
            </div>
          </div>
          <p className="mt-3 text-xs text-emerald-800">{preview.warning}</p>
        </section>
      )}
    </div>
  );
}
