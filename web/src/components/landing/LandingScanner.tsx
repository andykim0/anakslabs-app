'use client';

/**
 * [v3 Phase 6] 랜딩 최상단 — SEO/AEO/GEO 무료 진단기.
 * ScannerHero(큰 URL 입력) + 같은 화면 인라인 확장 ScanResultPanel.
 * 성공 시 scanId를 쿠키 anaks_scan_id(30일)에 저장 — Phase 7이 가입 후 claim.
 *
 * 카피 원칙: 수치는 실제 스캔 값 바인딩만(하드코딩 예시 금지),
 * 순위·노출 보장 표현 금지 — 상태 서술("검색·AI가 읽을 수 있는 100점 기반").
 */
import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Info, Loader2, ScanSearch, TriangleAlert, XCircle } from 'lucide-react';
import type { ScanIssue, ScanResult } from '@/lib/data/types';

const SCAN_MESSAGES = [
  '페이지를 불러오는 중…',
  '검색엔진 관점으로 구조를 읽는 중…',
  '답변 엔진(FAQ·요약) 신호를 확인하는 중…',
  'AI가 인용할 수 있는지 검사하는 중…',
];

async function requestScan(url: string): Promise<ScanResult> {
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const body = (await res.json().catch(() => null)) as { scan?: ScanResult; error?: { message?: string } } | null;
  if (!res.ok || !body?.scan) {
    throw new Error(body?.error?.message ?? '진단에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return body.scan;
}

function saveScanCookie(scanId: string) {
  document.cookie = `anaks_scan_id=${encodeURIComponent(scanId)}; path=/; max-age=${30 * 86400}; samesite=lax`;
}

// ---------- 게이지 ----------

const PILLAR_META: { key: 'seo' | 'aeo' | 'geo'; name: string; sub: string }[] = [
  { key: 'seo', name: 'SEO', sub: '네이버 · 구글 검색' },
  { key: 'aeo', name: 'AEO', sub: 'FAQ · 음성 · 요약 답변' },
  { key: 'geo', name: 'GEO', sub: 'ChatGPT · Perplexity 인용' },
];

function scoreColor(score: number): string {
  if (score >= 75) return '#4ade80';
  if (score >= 50) return '#facc15';
  return '#f87171';
}

function Gauge({ name, sub, score }: { name: string; sub: string; score: number }) {
  const color = scoreColor(score);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-neutral-100">{name}</span>
        <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ---------- 이슈 목록 ----------

const SEVERITY_META: Record<ScanIssue['severity'], { icon: React.ReactNode; tone: string }> = {
  critical: { icon: <XCircle className="h-3.5 w-3.5" />, tone: 'text-red-400' },
  warn: { icon: <TriangleAlert className="h-3.5 w-3.5" />, tone: 'text-amber-300' },
  info: { icon: <Info className="h-3.5 w-3.5" />, tone: 'text-sky-300' },
};

function IssueList({ issues }: { issues: ScanIssue[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? issues : issues.slice(0, 4);
  return (
    <div className="rounded-xl border border-neutral-800">
      <ul className="divide-y divide-neutral-800/70">
        {shown.map((issue) => (
          <li key={issue.code} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={SEVERITY_META[issue.severity].tone}>{SEVERITY_META[issue.severity].icon}</span>
              <span className="text-sm text-neutral-200">{issue.label}</span>
              <span className="ml-auto shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500">
                {issue.pillar}
              </span>
            </div>
            <p className="mt-1 pl-5.5 text-xs leading-5 text-neutral-500">{issue.detail}</p>
          </li>
        ))}
      </ul>
      {issues.length > 4 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-full items-center justify-center gap-1 border-t border-neutral-800 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
        >
          {open ? '접기' : `문제 ${issues.length - 4}개 더 보기`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : null}
    </div>
  );
}

// ---------- 결과 패널 ----------

function ScanResultPanel({ scan }: { scan: ScanResult }) {
  const issueCount = scan.issues.length;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto mt-10 max-w-3xl text-left"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-neutral-500">{scan.url}</p>
          <p className="mt-1 text-sm text-neutral-300">
            종합 <span className="text-3xl font-semibold tabular-nums" style={{ color: scoreColor(scan.scores.total) }}>{scan.scores.total}</span>
            <span className="text-neutral-500">/100</span>
            <span className="ml-2 rounded-md border border-neutral-700 px-2 py-0.5 text-sm font-semibold text-neutral-200">
              {scan.grade} 등급
            </span>
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PILLAR_META.map((p) => (
          <Gauge key={p.key} name={p.name} sub={p.sub} score={scan.scores[p.key]} />
        ))}
      </div>

      {issueCount > 0 ? (
        <div className="mt-4">
          <IssueList issues={scan.issues} />
        </div>
      ) : null}

      {/* 효과 요약 — 실제 스캔 값 바인딩 */}
      <div className="mt-5 rounded-2xl border border-[#4a3a22] bg-[#151310] p-6">
        <p className="text-sm leading-7 text-neutral-200">
          지금 <span className="font-semibold text-[#d9b878]">{scan.scores.total}점</span> —{' '}
          {scan.scores.total < 60
            ? '검색도 AI도 제대로 못 읽는 사이트입니다.'
            : '기본기는 있지만 비어 있는 신호가 남아 있습니다.'}{' '}
          아낙스랩스로 다시 지으면 위 <span className="font-semibold text-[#d9b878]">{issueCount}개 문제가 0</span>이
          되고, 검색·AI가 읽을 수 있는 <span className="font-semibold text-[#d9b878]">100점 기반</span>으로
          시작합니다.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#c8a96a] px-6 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
        >
          내 사이트 다시 만들기
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.div>
  );
}

// ---------- 히어로 + 스캐너 ----------

export function LandingScanner() {
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');

  const startScan = async () => {
    const target = url.trim();
    if (!target || scanning) return;
    setScanning(true);
    setError('');
    setScan(null);
    const ticker = window.setInterval(() => setMsgIdx((i) => (i + 1) % SCAN_MESSAGES.length), 1500);
    try {
      const result = await requestScan(target);
      saveScanCookie(result.id);
      setScan(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '진단에 실패했습니다.');
    } finally {
      window.clearInterval(ticker);
      setScanning(false);
      setMsgIdx(0);
    }
  };

  return (
    <section className="mx-auto max-w-5xl px-6 pt-16 pb-20 text-center md:pt-24">
      <p className="mb-5 text-xs font-medium tracking-[0.2em] text-[#c8a96a] uppercase">
        무료 SEO · AEO · GEO 진단
      </p>
      <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-neutral-50 md:text-5xl md:leading-[1.15]">
        내 사이트, 검색과 AI가
        <br />
        읽을 수 있을까요?
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-neutral-400">
        주소만 넣으면 30초 안에 진단합니다 — 네이버·구글 검색(SEO), 답변 발췌(AEO),
        ChatGPT·Perplexity 인용(GEO) 관점으로.
      </p>

      {/* URL 입력 */}
      <div className="mx-auto mt-8 flex max-w-xl gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void startScan();
          }}
          placeholder="예: mysite.co.kr"
          className="h-13 min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[#c8a96a]"
        />
        <button
          type="button"
          onClick={() => void startScan()}
          disabled={scanning || !url.trim()}
          className="inline-flex h-13 shrink-0 items-center gap-2 rounded-xl bg-[#c8a96a] px-6 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          무료로 진단하기
        </button>
      </div>
      <p className="mt-2.5 text-[11px] text-neutral-600">가입 없이 바로. 결과는 30일간 다시 볼 수 있어요.</p>

      {/* 진행 애니메이션 */}
      <AnimatePresence>
        {scanning ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-auto mt-8 max-w-md overflow-hidden"
          >
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-6">
              <motion.p
                key={msgIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-neutral-300"
              >
                {SCAN_MESSAGES[msgIdx]}
              </motion.p>
              <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
                <motion.div
                  className="h-full w-1/3 rounded-full bg-[#c8a96a]"
                  animate={{ x: ['-100%', '300%'] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p className="mx-auto mt-6 max-w-md rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-xs text-red-300">
          {error}
        </p>
      ) : null}

      {scan ? <ScanResultPanel scan={scan} /> : null}
    </section>
  );
}
