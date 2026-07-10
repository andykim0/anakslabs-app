import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingScanner } from '@/components/landing/LandingScanner';
import { PillarExplainer } from '@/components/landing/PillarExplainer';
import { Pricing } from '@/components/landing/Pricing';
import { WhatWeOffer } from '@/components/landing/WhatWeOffer';

export const metadata: Metadata = {
  title: '아낙스랩스 — 내 사이트, 검색과 AI가 읽을 수 있을까요?',
  description:
    '무료 SEO·AEO·GEO 진단 후, 검색·AI가 읽을 수 있는 100점 기반 사이트로 다시 짓기. AI가 설계하고, 캔버스에서 다듬고, 즉시 호스팅.',
};

/**
 * [v3 Phase 6] 랜딩 — 진단기 훅 우선 구조:
 * ScannerHero(+인라인 결과) → PillarExplainer → WhatWeOffer(기존 3단계 흡수) → Pricing → 푸터.
 * CTA는 전부 /login (OAuth 로그인 = 가입).
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0b] text-neutral-100 antialiased">
      {/* 네비게이션 */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#c8a96a] text-[11px] font-black text-neutral-950">
            A
          </span>
          아낙스랩스
        </div>
        <Link
          href="/login"
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
        >
          로그인
        </Link>
      </header>

      {/* 진단기 히어로 (+ 인라인 결과 패널) — 회사 소개보다 먼저 */}
      <LandingScanner />

      <PillarExplainer />

      <WhatWeOffer />

      <Pricing />

      {/* 푸터 */}
      <footer className="border-t border-neutral-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 text-xs text-neutral-600">
          <span>© 2026 아낙스랩스</span>
          <a href="mailto:hello@anakslabs.com" className="transition-colors hover:text-neutral-400">
            hello@anakslabs.com
          </a>
        </div>
      </footer>
    </div>
  );
}
