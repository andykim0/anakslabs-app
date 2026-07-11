'use client';

/**
 * [v3 Phase 6] 랜딩 최상단 — SEO/AEO/GEO 무료 진단기.
 * ScannerHero(큰 URL 입력) + 같은 화면 인라인 확장 ScanResultPanel.
 * 성공 시 scanId를 쿠키 anaks_scan_id(30일)에 저장 — Phase 7이 가입 후 claim.
 *
 * 카피 원칙: 수치는 실제 스캔 값 바인딩만(하드코딩 예시 금지),
 * 순위·노출 보장 표현 금지 — 상태 서술("검색·AI가 읽을 수 있는 100점 기반").
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronDown, Info, Loader2, ScanSearch, TriangleAlert, XCircle } from 'lucide-react';
import type { ScanIssue, ScanResult } from '@/lib/data/types';

const SCAN_MESSAGES = [
  '페이지를 불러오는 중…',
  '검색엔진 관점으로 구조를 읽는 중…',
  '답변 엔진(FAQ·요약) 신호를 확인하는 중…',
  'AI가 인용할 수 있는지 검사하는 중…',
];

/** 입력창 예시 로테이션 (3초 fade, 입력 시작 시 정지) */
const PLACEHOLDERS = ['예: mysite.co.kr', '예: 우리가게.com', '예: cafe-dodum.kr'];

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

// 라이트 배경(#FDFDFB) 위 대비 보정 — 시맨틱(양호/경고/불량) 유지. 대형 점수 숫자 3:1 이상.
function scoreColor(score: number): string {
  if (score >= 75) return '#16a34a';
  if (score >= 50) return '#b45309';
  return '#dc2626';
}

function Gauge({ name, sub, score }: { name: string; sub: string; score: number }) {
  const color = scoreColor(score);
  return (
    <div className="rounded-xl border border-[#E8E6E0] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-[#17181C]">{name}</span>
        <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-[#5C6068]">{sub}</p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#EDEBE4]">
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
  critical: { icon: <XCircle className="h-3.5 w-3.5" />, tone: 'text-red-600' },
  warn: { icon: <TriangleAlert className="h-3.5 w-3.5" />, tone: 'text-amber-600' },
  info: { icon: <Info className="h-3.5 w-3.5" />, tone: 'text-sky-600' },
};

function IssueList({ issues }: { issues: ScanIssue[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? issues : issues.slice(0, 4);
  return (
    <div className="rounded-xl border border-[#E8E6E0] bg-white">
      <ul className="divide-y divide-[#EDEBE4]">
        {shown.map((issue) => (
          <li key={issue.code} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={SEVERITY_META[issue.severity].tone}>{SEVERITY_META[issue.severity].icon}</span>
              <span className="text-sm text-[#17181C]">{issue.label}</span>
              <span className="ml-auto shrink-0 rounded-full bg-[#F3F1EB] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#5C6068]">
                {issue.pillar}
              </span>
            </div>
            <p className="mt-1 pl-5.5 text-xs leading-5 text-[#5C6068]">{issue.detail}</p>
          </li>
        ))}
      </ul>
      {issues.length > 4 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-full items-center justify-center gap-1 border-t border-[#E8E6E0] text-xs text-[#5C6068] transition-colors hover:text-[#17181C]"
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
          <p className="truncate font-mono text-xs text-[#5C6068]">{scan.url}</p>
          <p className="mt-1 text-sm text-[#5C6068]">
            종합 <span className="text-3xl font-semibold tabular-nums" style={{ color: scoreColor(scan.scores.total) }}>{scan.scores.total}</span>
            <span className="text-[#696E76]">/100</span>
            <span className="ml-2 rounded-md border border-[#E8E6E0] px-2 py-0.5 text-sm font-semibold text-[#17181C]">
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
      <div className="mt-5 rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-6">
        <p className="text-sm leading-7 text-[#17181C]">
          지금 <span className="font-semibold text-[#856A26]">{scan.scores.total}점</span> —{' '}
          {scan.scores.total < 60
            ? '검색도 AI도 제대로 못 읽는 사이트입니다.'
            : '기본기는 있지만 비어 있는 신호가 남아 있습니다.'}{' '}
          아낙스랩스로 다시 지으면 위 <span className="font-semibold text-[#856A26]">{issueCount}개 문제가 0</span>이
          되고, 검색·AI가 읽을 수 있는 <span className="font-semibold text-[#856A26]">100점 기반</span>으로
          시작합니다.
        </p>
        <Link
          href="/login"
          className="group mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#17181C] px-6 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-black hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
        >
          내 사이트 다시 만들기
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
  const reduce = useReducedMotion() ?? false;
  const [phIdx, setPhIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  // 하이드레이션 후에만 로테이션 오버레이 사용 — SSR/no-JS는 native placeholder(가시)로 LCP 보호
  useEffect(() => setMounted(true), []);
  const rotatePh = mounted && !reduce && !url;

  // 예시 placeholder 로테이션 — 입력 시작(url 존재)·reduced-motion 시 정지
  useEffect(() => {
    if (!rotatePh) return;
    const id = window.setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 3000);
    return () => window.clearInterval(id);
  }, [rotatePh]);

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
    <section id="hero-scanner" className="mx-auto max-w-5xl scroll-mt-20 px-6 pt-16 pb-10 text-center md:pt-24">
      <p className="mb-5 text-xs font-medium tracking-[0.2em] text-[#856A26] uppercase">
        무료 SEO · AEO · GEO 진단
      </p>
      {/* [visual] 진단기가 히어로로 승격 — 이 h1이 메인 유일 h1 */}
      <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-[#17181C] md:text-5xl md:leading-[1.15]">
        내 사이트, 검색과 AI가
        <br />
        읽을 수 있을까요?
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#5C6068]">
        주소만 넣으면 30초 안에 진단합니다 — 네이버·구글 검색(SEO), 답변 발췌(AEO),
        ChatGPT·Perplexity 인용(GEO) 관점으로.
      </p>

      {/* URL 입력 */}
      <div className="mx-auto mt-8 flex max-w-xl gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void startScan();
            }}
            placeholder={rotatePh ? '' : PLACEHOLDERS[0]}
            className="h-13 w-full rounded-xl border border-[#E8E6E0] bg-white px-4 text-sm text-[#17181C] outline-none transition-colors placeholder:text-[#696E76] focus:border-[#9A7B33]"
          />
          {/* 예시 로테이션 오버레이 (fade) — 마운트 후·입력 없을 때만 (SSR은 native placeholder) */}
          {rotatePh ? (
            <AnimatePresence mode="wait">
              <motion.span
                key={phIdx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-[#696E76]"
              >
                {PLACEHOLDERS[phIdx]}
              </motion.span>
            </AnimatePresence>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void startScan()}
          disabled={scanning || !url.trim()}
          className="relative inline-flex h-13 shrink-0 items-center gap-2 overflow-hidden rounded-xl bg-[#17181C] px-6 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-black hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {/* 골드 shine — 5초 주기, 입력 중·reduced-motion이면 정지 (§6.6) */}
          {!reduce && !url && !scanning ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -inset-x-2 -skew-x-12"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(214,178,94,0.35), transparent)' }}
              initial={{ x: '-160%' }}
              animate={{ x: ['-160%', '260%'] }}
              transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
            />
          ) : null}
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          무료로 진단하기
        </button>
      </div>
      <p className="mt-2.5 text-[11px] text-[#5C6068]">가입 없이 바로. 결과는 30일간 다시 볼 수 있어요.</p>

      {/* 진행 애니메이션 */}
      <AnimatePresence>
        {scanning ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-auto mt-8 max-w-md overflow-hidden"
          >
            <div className="rounded-xl border border-[#E8E6E0] bg-white px-5 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <motion.p
                key={msgIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-[#5C6068]"
              >
                {SCAN_MESSAGES[msgIdx]}
              </motion.p>
              <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[#EDEBE4]">
                <motion.div
                  className="h-full w-1/3 rounded-full bg-[#9A7B33]"
                  animate={{ x: ['-100%', '300%'] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p className="mx-auto mt-6 max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {scan ? <ScanResultPanel scan={scan} /> : null}
    </section>
  );
}
