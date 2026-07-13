'use client';

/**
 * [v3 Phase 7] 스캔→재생성 전환 배너 — 로그인 직전 무료 진단이 있으면
 * 대시보드·온보딩 상단에 노출. "다시 지어볼까요?" → 온보딩.
 * 닫으면 anaks_recent_scan 쿠키를 지워 다시 뜨지 않게 한다.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ScanSearch, X } from 'lucide-react';

export interface RecentScanSummary {
  url: string;
  total: number;
  issueCount: number;
}

// [I1] 기본 진입 = 개선 모드(진단 컨텍스트 유지). scanId는 쿠키(anaks_recent_scan) 연속이라 쿼리에 안 실음.
export function ScanBanner({ scan, ctaHref = '/onboarding?mode=improve' }: { scan: RecentScanSummary; ctaHref?: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const close = () => {
    document.cookie = 'anaks_recent_scan=; path=/; max-age=0; samesite=lax';
    setDismissed(true);
  };

  let host = scan.url;
  try {
    host = new URL(scan.url).hostname.replace(/^www\./, '');
  } catch {
    // raw url 그대로
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-[#4a3a22] bg-[#151310] px-5 py-4 pr-11">
      <button
        type="button"
        onClick={close}
        aria-label="닫기"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2a2117] text-[#d9b878]">
          <ScanSearch className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm leading-6 text-neutral-200">
          아까 진단한 <span className="font-medium text-[#d9b878]">{host}</span> — 문제{' '}
          <span className="font-semibold text-[#d9b878]">{scan.issueCount}개</span>,{' '}
          <span className="font-semibold text-[#d9b878]">{scan.total}점</span>이었어요. 이 문제들을 해결한 100점 기반으로 다시 지어볼까요?
        </p>
        <Link
          href={ctaHref}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#c8a96a] px-5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
        >
          다시 만들기
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
