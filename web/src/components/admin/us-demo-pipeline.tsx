'use client';

import { US_MEDICAL_PREVIEW_RETENTION_DAYS } from '@/lib/crawl/contracts';

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);

  const blocksById = new Map(
    detail?.artifact.usDemo.blocks.map((block) => [block.id, block]) ?? [],
  );
  const orderedBlocks = orderedIds
    .map((id) => blocksById.get(id))
    .filter((block): block is AdminUsDemoSourceBlock => Boolean(block));

  async function runCrawl() {
    const target = normalizeUrlInput(url);
    if (!target.ok) {
      setError(target.reason);
      return;
    }
    setUrl(target.url);
    setStatus('crawling');
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
      setError(reason instanceof Error ? reason.message : "Collection failed.");
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
      setError(reason instanceof Error ? reason.message : "Preview creation failed.");
    }
  }

  async function openPreview() {
    if (!preview) return;
    setError(null);
    try {
      await enableUsDemoQaExclusion();
      window.open(preview.url, '_blank', 'noopener,noreferrer');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Setting up internal QA exclusions failed.");
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
          <button
            type="button"
            disabled={
              !url
              || status === 'crawling'
              || status === 'publishing'
              || (consentedTransfer && (
                !prospectId || !consenterName || !consenterTitle || !consentedAt
              ))
            }
            onClick={runCrawl}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#2D63F0] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {status === 'crawling' && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
            Collect and Diagnose
          </button>
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
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
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
              <button
                type="button"
                disabled={
                  status === 'publishing'
                  || includedIds.size === 0
                  || !detail.artifact.usDemo.englishSourceReady
                }
                onClick={publishPreview}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0B765C] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {status === 'publishing' && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
                Create a private demo
              </button>
            </div>
          </section>
        </>
      )}

      {preview && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
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
                {preview.url} · {new Date(preview.expiresAt).toLocaleString('ko-KR')} expiration
              </p>
            </div>
            <button
              type="button"
              onClick={openPreview}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open after excluding internal QA
              <ExternalLink size={15} aria-hidden />
            </button>
          </div>
          <p className="mt-3 text-xs text-emerald-800">{preview.warning}</p>
        </section>
      )}
    </div>
  );
}
