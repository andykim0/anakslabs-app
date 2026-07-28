'use client';

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
  createUsMedicalDemoPreview,
  crawlUsMedicalDemo,
  enableUsDemoQaExclusion,
  getUsMedicalDemoArtifact,
  type AdminUsDemoArtifactResponse,
  type AdminUsDemoPreviewResponse,
  type AdminUsDemoSourceBlock,
} from './api';

const GROUP_LABELS = {
  entity: '병원 정보 연결',
  structuredSchema: '구조화된 병원 정보',
  evidence: '근거와 출처',
  answerExtraction: '질문·답변 구조',
  access: '검색 접근',
} as const;

const BLOCK_KIND_LABELS = {
  business_name: '병원명',
  introduction: '소개',
  service: '진료 항목',
  provider_name: '의료진 이름',
  provider_credential: '의료진 자격',
  provider_bio: '의료진 약력',
  insurance: '보험',
  price_or_financing: '가격·금융',
  faq_question: '질문',
  faq_answer: '답변',
  phone: '전화',
  address: '주소',
  opening_hours: '진료 시간',
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
  const [error, setError] = useState<string | null>(null);

  const blocksById = new Map(
    detail?.artifact.usDemo.blocks.map((block) => [block.id, block]) ?? [],
  );
  const orderedBlocks = orderedIds
    .map((id) => blocksById.get(id))
    .filter((block): block is AdminUsDemoSourceBlock => Boolean(block));

  async function runCrawl() {
    setStatus('crawling');
    setError(null);
    setPreview(null);
    try {
      const crawled = await crawlUsMedicalDemo(url, allowTlsHttpFallback);
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
      setError(reason instanceof Error ? reason.message : '수집에 실패했습니다.');
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
      );
      setPreview(response.preview);
      setStatus('ready');
    } catch (reason) {
      setStatus('ready');
      setError(reason instanceof Error ? reason.message : '프리뷰 생성에 실패했습니다.');
    }
  }

  async function openPreview() {
    if (!preview) return;
    setError(null);
    try {
      await enableUsDemoQaExclusion();
      window.open(preview.url, '_blank', 'noopener,noreferrer');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '내부 QA 제외 설정에 실패했습니다.');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5" data-us-demo-pipeline>
      <header className="rounded-2xl border border-[#DCE4F0] bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-[#174DDA]">
              US MEDICAL OUTREACH
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0B1736]">
              영어 병원 데모 조립
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5F6B7C]">
              공개 영어 원문만 수집해 구조를 진단하고, Andy가 사용할 블록을 확인한 뒤
              14일짜리 비공개 프리뷰를 만듭니다. 환자 정보·후기·번역·새 효능 문구는 넣지 않습니다.
            </p>
          </div>
          <div className="rounded-xl bg-[#EEF4FF] p-3 text-[#174DDA]">
            <Globe2 size={24} aria-hidden />
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[#DCE4F0] bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-sm font-semibold text-[#22304A]">타깃 병원 URL</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://clinic.example.com"
              className="mt-2 w-full rounded-lg border border-[#C9D5E7] bg-white px-3 py-2.5 text-sm outline-none ring-[#174DDA] focus:ring-2"
            />
          </label>
          <button
            type="button"
            disabled={!url || status === 'crawling' || status === 'publishing'}
            onClick={runCrawl}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#174DDA] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {status === 'crawling' && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
            수집하고 진단하기
          </button>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-[#667085]">
          <input
            type="checkbox"
            checked={allowTlsHttpFallback}
            onChange={(event) => setAllowTlsHttpFallback(event.target.checked)}
          />
          사전 승인된 파일럿 호스트만 인증서 오류 시 HTTP 공개 페이지로 계속 수집
        </label>
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </section>

      {detail && (
        <>
          <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <article className="rounded-2xl border border-[#DCE4F0] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" aria-hidden />
                <h2 className="font-bold text-[#0B1736]">수집 안전 기록</h2>
              </div>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-[#667085]">읽은 공개 페이지</dt>
                  <dd className="mt-1 font-semibold">{detail.artifact.visitedUrls.length}개</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#667085]">보관 만료</dt>
                  <dd className="mt-1">{new Date(detail.artifact.expiresAt).toLocaleString('ko-KR')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#667085]">영어 원문 충분성</dt>
                  <dd className="mt-1 font-semibold">
                    {detail.artifact.usDemo.englishSourceReady ? '컴파일 가능' : '원문 부족 — 생성 중단'}
                  </dd>
                </div>
              </dl>
              <details className="mt-4 text-xs text-[#5F6B7C]">
                <summary className="cursor-pointer font-semibold">방문 URL 보기</summary>
                <ul className="mt-2 space-y-1 break-all">
                  {detail.artifact.visitedUrls.map((visitedUrl) => (
                    <li key={visitedUrl}>{visitedUrl}</li>
                  ))}
                </ul>
              </details>
            </article>

            <article className="rounded-2xl border border-[#DCE4F0] bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-[#667085]">미국 의료 아웃리치 진단</p>
                  <h2 className="mt-1 text-xl font-bold text-[#0B1736]">
                    {detail.artifact.usDemo.sourceVisibility.score} / 100
                  </h2>
                </div>
                <span className="text-xs text-[#667085]">
                  검색·AI가 읽는 서버 HTML 구조
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {Object.entries(GROUP_LABELS).map(([group, label]) => {
                  const score = detail.artifact.usDemo.sourceVisibility.groups[
                    group as keyof typeof GROUP_LABELS
                  ];
                  return (
                    <div key={group} className="rounded-lg bg-[#F4F7FB] p-3">
                      <p className="text-[11px] leading-4 text-[#667085]">{label}</p>
                      <p className="mt-1 text-sm font-bold text-[#22304A]">
                        {score.earned}/{score.weight}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-[#DCE4F0] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-[#0B1736]">공개 원문 수동 마감</h2>
                <p className="mt-1 text-sm text-[#667085]">
                  원문을 고르고 순서만 바꿀 수 있습니다. 문장을 새로 쓰거나 번역할 수 없습니다.
                </p>
              </div>
              <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-semibold text-[#174DDA]">
                선택 {includedIds.size} / {orderedBlocks.length}
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
                    aria-label={`${BLOCK_KIND_LABELS[block.kind]} 원문 사용`}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#22304A]">
                        {BLOCK_KIND_LABELS[block.kind]}
                      </span>
                      <span className="rounded bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#667085]">
                        {block.disposition === 'allowed'
                          ? '사용 가능'
                          : block.disposition === 'review'
                            ? 'Andy 확인 필요'
                            : '사용 차단'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#22304A]">{block.text}</p>
                    <p className="mt-2 truncate text-[11px] text-[#667085]">
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
                      aria-label="원문 블록 위로 이동"
                      className="rounded border border-[#C9D5E7] bg-white p-1.5 disabled:opacity-35"
                    >
                      <ArrowUp size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={index === orderedBlocks.length - 1}
                      onClick={() => setOrderedIds((ids) => moveBlock(ids, block.id, 1))}
                      aria-label="원문 블록 아래로 이동"
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
                <p className="flex items-center gap-2 text-xs text-[#667085]">
                  <LockKeyhole size={14} aria-hidden />
                  두 모드 모두 색인 차단되며 14일 뒤 404가 됩니다.
                </p>
                <label className="block text-xs font-semibold text-[#22304A]">
                  렌더 모드
                  <select
                    value={renderMode}
                    onChange={(event) => setRenderMode(
                      event.target.value as 'preview-full' | 'outreach-safe',
                    )}
                    className="ml-2 rounded-lg border border-[#C9D5E7] bg-white px-3 py-2 text-sm"
                  >
                    <option value="preview-full">내부 평가 · full 멀티페이지</option>
                    <option value="outreach-safe">발송용 · safe 단일페이지</option>
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
                비공개 데모 만들기
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
                공유 프리뷰가 준비됐습니다
              </p>
              <p className="mt-2 text-sm text-emerald-800">
                원문 {preview.sourceReport.usedBlocks}개 사용 · {preview.sourceReport.excludedBlocks}개 제외
              </p>
              <p className="mt-1 break-all text-xs text-emerald-700">
                {preview.url} · {new Date(preview.expiresAt).toLocaleString('ko-KR')} 만료
              </p>
            </div>
            <button
              type="button"
              onClick={openPreview}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white"
            >
              내부 QA 제외 후 열기
              <ExternalLink size={15} aria-hidden />
            </button>
          </div>
          <p className="mt-3 text-xs text-emerald-800">{preview.warning}</p>
        </section>
      )}
    </div>
  );
}
