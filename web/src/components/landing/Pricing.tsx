/**
 * [v3 Phase 6] 가격 섹션 — 기존 랜딩에서 그대로 이동 (CTA는 /login).
 */
import Link from 'next/link';
import { Check } from 'lucide-react';
import { PRICE_RANGES } from '@/lib/credits/constants';
import { HOSTING_ONLY_FOOTNOTE } from '@/lib/legal/notices';

function formatMan(krw: number): string {
  return `${Math.round(krw / 10_000)}만원`;
}

const BASIC_FEATURES = [
  '이미지 중심 정적 사이트',
  'xxx.anakslabs.com 서브도메인 + SSL',
  'AI 디자인 3안 + 캔버스 에디터',
  '편집 크레딧 1개 기본 제공',
];

const PREMIUM_FEATURES = [
  '영상 · 애니메이션 포함 동적 사이트',
  '폼 · 예약 등 동적 기능',
  '편집 크레딧 3개 기본 제공',
  '커스텀 도메인 연결 지원',
  '우선 지원',
];

export function Pricing() {
  const { buildFee, maintenanceMonthly } = PRICE_RANGES;
  return (
    <>
      {/* 가격 */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-neutral-50">가격</h2>
        <p className="mt-2 text-center text-sm text-neutral-500">
          제작비 1회 + 월 유지보수. 숨은 비용 없음.
        </p>
        <div className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-2">
          {/* Basic */}
          <div className="flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900/40 p-7">
            <h3 className="text-sm font-semibold tracking-widest text-neutral-400 uppercase">Basic</h3>
            <p className="mt-4 text-3xl font-semibold text-neutral-50">
              {formatMan(buildFee.basic[0])}
              <span className="text-base font-normal text-neutral-500">부터</span>
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              + 월 {maintenanceMonthly.basic[0].toLocaleString()}~
              {maintenanceMonthly.basic[1].toLocaleString()}원 유지보수
            </p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {BASIC_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border border-neutral-700 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
            >
              Basic으로 시작
            </Link>
          </div>

          {/* Premium */}
          <div className="relative flex flex-col rounded-2xl border border-[#4a3a22] bg-[#151310] p-7">
            <span className="absolute -top-3 right-6 rounded-full bg-[#c8a96a] px-3 py-1 text-[11px] font-semibold text-neutral-950">
              추천
            </span>
            <h3 className="text-sm font-semibold tracking-widest text-[#c8a96a] uppercase">Premium</h3>
            <p className="mt-4 text-3xl font-semibold text-neutral-50">
              {formatMan(buildFee.premium[0])}
              <span className="text-base font-normal text-neutral-500">부터</span>
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              + 월 {maintenanceMonthly.premium[0].toLocaleString()}~
              {maintenanceMonthly.premium[1].toLocaleString()}원 유지보수
            </p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-neutral-200">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c8a96a]" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-[#c8a96a] text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              Premium으로 시작
            </Link>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-neutral-600">
          편집 크레딧: 텍스트 1 · 이미지 1 · 영상 3(Premium) · 구조 변경 2 — 팩 구매 1개 15,000원부터
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[11px] leading-5 text-neutral-700">
          {HOSTING_ONLY_FOOTNOTE}
        </p>
      </section>
    </>
  );
}
