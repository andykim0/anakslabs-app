'use client';

/**
 * [v3 Phase 6] 랜딩 최상단 — SEO/AEO/GEO 무료 진단기.
 * ScannerHero(큰 URL 입력) + 같은 화면 인라인 확장 ScanResultPanel.
 * 성공 시 scanId를 쿠키 anaks_scan_id(30일)에 저장 — Phase 7이 가입 후 claim.
 *
 * 카피 원칙: 수치는 실제 스캔 값 바인딩만(하드코딩 예시 금지),
 * 순위·노출 보장 표현 금지 — 상태 서술("검색·AI가 읽을 수 있는 100점 기반").
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, Info, Loader2, ScanSearch, TriangleAlert, XCircle } from 'lucide-react';
import type { ScanIssue, ScanResult } from '@/lib/data/types';
import { guidanceFor } from '@/lib/scan/guidance';
import { OptimizationConsole } from '@/components/marketing/OptimizationConsole';
import { useFailClosedReducedMotion } from '@/components/marketing/use-fail-closed-reduced-motion';

const SCAN_MESSAGES = [
  '홈페이지를 여는 중…',
  '네이버·구글이 내용을 찾을 수 있는지 보는 중…',
  '“주차 되나요?” 같은 질문에 답이 있는지 보는 중…',
  'AI가 가게 정보를 확인할 근거가 있는지 보는 중…',
];

/** 입력창 예시 로테이션 (3초 fade, 입력 시작 시 정지) */
const PLACEHOLDERS = ['예: mysite.co.kr', '예: 우리가게.com', '예: cafe-dodum.kr'];

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

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
        <span className="mkt-type-card-title font-semibold text-[#17181C]">{name}</span>
        <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
      <p className="mkt-type-support mt-0.5 text-[#5C6068]">{sub}</p>
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
          <li key={issue.code} className="px-4 py-4">
            <div className="flex items-start gap-2">
              <span className={SEVERITY_META[issue.severity].tone}>{SEVERITY_META[issue.severity].icon}</span>
              <span className="mkt-type-body font-medium text-[#17181C]">{guidanceFor(issue.code)?.title ?? issue.label}</span>
              <span className="mkt-type-support ml-auto shrink-0 rounded-full bg-[#F3F1EB] px-2 py-0.5 uppercase tracking-wider text-[#5C6068]">
                {issue.pillar}
              </span>
            </div>
            <p className="mkt-type-support mt-1.5 pl-5.5 text-[#4F5867]">
              {guidanceFor(issue.code)?.action ?? issue.detail}
            </p>
            {guidanceFor(issue.code)?.effect ? (
              <p className="mkt-type-support mt-1 pl-5.5 text-[#087D70]">바뀌는 점: {guidanceFor(issue.code)?.effect}</p>
            ) : null}
            {guidanceFor(issue.code) ? (
              <details className="mkt-type-support mt-2 pl-5.5 text-[#697386]">
                <summary className="cursor-pointer select-none">기술 설명 보기</summary>
                <p className="mt-1">{issue.label} — {issue.detail}</p>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
      {issues.length > 4 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mkt-type-control flex h-10 w-full items-center justify-center gap-1 border-t border-[#E8E6E0] text-[#5C6068] transition-colors hover:text-[#17181C]"
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
      className="mx-auto mt-14 max-w-3xl rounded-[28px] border border-[#DCE4F0] bg-white p-5 text-left shadow-[0_24px_70px_rgba(11,23,54,0.12)] sm:p-7"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mkt-type-support truncate font-mono text-[#5C6068]">{scan.url}</p>
          <p className="mkt-type-body mt-1 text-[#5C6068]">
            종합 <span className="text-3xl font-semibold tabular-nums" style={{ color: scoreColor(scan.scores.total) }}>{scan.scores.total}</span>
            <span className="text-[#696E76]">/100</span>
            <span className="mkt-type-body ml-2 rounded-md border border-[#E8E6E0] px-2 py-0.5 font-semibold text-[#17181C]">
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
      <div className="mt-5 rounded-2xl border border-[#CFEAE7] bg-[#EFFBF9] p-6">
        <p className="mkt-type-body text-[#17181C]">
          지금 <span className="font-semibold text-[#174DDA]">{scan.scores.total}점</span> —{' '}
          {scan.scores.total < 60
            ? '손님이 검색하거나 AI에 물을 때 핵심 정보를 찾기 어려운 상태입니다.'
            : '기본 정보는 있지만 손님이 찾기 어려운 항목이 남아 있습니다.'}{' '}
          다보임은 위 <span className="font-semibold text-[#174DDA]">{issueCount}개 빠진 항목</span>을 제작 단계에서
          보완해, 가게 이름·지역·서비스를 네이버·구글·AI가 읽기 쉽게 정리합니다.
        </p>
        <Link
          href="/login"
          className="mkt-type-control group mt-4 inline-flex h-12 items-center gap-2 rounded-xl bg-[#174DDA] px-6 font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-[#123FB7] hover:shadow-[0_6px_20px_rgba(23,77,218,0.24)]"
        >
          내 사이트 다시 만들기
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </motion.div>
  );
}

// ---------- 히어로 + 스캐너 ----------

export function LandingScanner({ consoleMedia = 'film' }: { consoleMedia?: 'film' | 'poster' | 'interface' }) {
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const reduce = useFailClosedReducedMotion();
  const [phIdx, setPhIdx] = useState(0);
  // 하이드레이션 후에만 로테이션 오버레이 사용 — SSR/no-JS는 native placeholder(가시)로 LCP 보호
  const mounted = useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerSnapshot);
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
    <section id="hero-scanner" className="mx-auto max-w-7xl scroll-mt-24 px-5 pt-14 pb-20 sm:px-8 md:pt-20 md:pb-28">
      <div className="grid items-center gap-16 lg:grid-cols-[.9fr_1.1fr] lg:gap-12 xl:gap-20">
        <div data-film-scrim="hero" className="text-left">
          <p className="mkt-type-eyebrow mb-6 inline-flex items-center gap-2 rounded-full border border-white/18 bg-[#07142F]/72 px-3 py-1.5 font-mono tracking-[0.14em] text-[#68E8D8] uppercase shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#03BFA9] shadow-[0_0_8px_rgba(3,191,169,.45)]" />
            무료 SEO · AEO · GEO 진단
          </p>
          <h1 className="mkt-type-hero max-w-2xl font-semibold tracking-[-0.065em] text-[#0B1736]">
            손님이 내 가게를
            <br />검색할 때,
            <br />
            <span className="bg-gradient-to-r from-[#174DDA] via-[#08AFC5] to-[#03A995] bg-clip-text text-transparent">
              홈페이지가 보일까요?
            </span>
          </h1>
          <p className="mkt-type-body mt-7 max-w-xl text-[#5F6B7C]">
            홈페이지 주소를 넣으면 손님이 검색하거나 AI에 물을 때 빠진 정보를 바로 보여드립니다.
            결과를 확인한 뒤 업종에 맞는 새 홈페이지 제작까지 이어갈 수 있습니다.
          </p>

          <div className="mt-8 rounded-2xl border border-[#CAD5E5] bg-white/90 p-2 shadow-[0_18px_50px_rgba(11,23,54,0.1)] backdrop-blur-xl">
            <label htmlFor="landing-scan-url" className="sr-only">무료 진단을 받을 홈페이지 주소</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <input
                  id="landing-scan-url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void startScan();
                  }}
                  placeholder={rotatePh ? '' : PLACEHOLDERS[0]}
                  className="mkt-type-control h-13 w-full rounded-xl border border-transparent bg-white px-4 text-[#0B1736] outline-none transition-shadow placeholder:text-[#667085] focus:ring-2 focus:ring-[#08AFC5]"
                />
                {rotatePh ? (
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={phIdx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="mkt-type-control pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#747780]"
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
                className="mkt-type-control relative inline-flex h-13 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#174DDA] via-[#08AFC5] to-[#03BFA9] px-5 font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_30px_rgba(8,175,197,.28)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {!reduce && !url && !scanning ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -inset-x-2 -skew-x-12"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.24), transparent)' }}
                    initial={{ x: '-160%' }}
                    animate={{ x: ['-160%', '260%'] }}
                    transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
                  />
                ) : null}
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                내 사이트 무료 진단
              </button>
            </div>
          </div>
          <div className="mkt-type-support mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[#6C7788]">
            {['가입 없이 바로', '검색 · 질문 · AI 신호 동시 확인', '결과 30일 보관'].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3 text-[#03A995]" /> {item}
              </span>
            ))}
          </div>

          <AnimatePresence>
            {scanning ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 overflow-hidden"
              >
                <div className="rounded-xl border border-[#DCE4F0] bg-white/85 px-5 py-4 shadow-sm backdrop-blur">
                  <motion.p key={msgIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mkt-type-support text-[#5F6B7C]">
                    {SCAN_MESSAGES[msgIdx]}
                  </motion.p>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#E4EAF2]">
                    <motion.div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#174DDA] via-[#08B8E8] to-[#03D1B8]" animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }} />
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {error ? (
            <p className="mkt-type-support mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</p>
          ) : null}
        </div>

        <OptimizationConsole mediaMode={consoleMedia} />
      </div>

      {scan ? <ScanResultPanel scan={scan} /> : null}
    </section>
  );
}
