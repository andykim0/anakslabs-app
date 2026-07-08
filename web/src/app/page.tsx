import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { PRICE_RANGES } from '@/lib/credits/constants';

export const metadata: Metadata = {
  title: '아낙스랩스 — AI가 만드는 프리미엄 웹사이트',
  description:
    '에이전시 1/5 가격. AI가 설계하고, 캔버스에서 다듬고, 즉시 호스팅되는 웹사이트. Basic 39만원부터.',
};

function formatMan(krw: number): string {
  return `${Math.round(krw / 10_000)}만원`;
}

const STEPS = [
  {
    no: '01',
    title: '설문',
    body: '레퍼런스 이미지, 컬러, 톤, 목적을 알려주세요. 5분이면 충분합니다.',
  },
  {
    no: '02',
    title: 'AI 디자인 3안',
    body: '3D 렌더 스타일을 포함한 디자인 방향 세 가지 중 하나를 고릅니다.',
  },
  {
    no: '03',
    title: '캔버스 편집 · 발행',
    body: 'PPT처럼 끌어서 다듬고, 버튼 하나로 라이브. 도메인과 SSL까지 포함.',
  },
];

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

export default function LandingPage() {
  const { buildFee, maintenanceMonthly } = PRICE_RANGES;
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

      {/* 히어로 */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-24 text-center md:pt-28">
        <p className="mb-5 text-xs font-medium tracking-[0.2em] text-[#c8a96a] uppercase">
          AI 웹사이트 스튜디오
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-neutral-50 md:text-6xl md:leading-[1.15]">
          에이전시 1/5 가격,
          <br />
          AI가 만드는 프리미엄 웹사이트
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-neutral-400">
          설문 한 번이면 AI가 디자인 세 가지를 제안합니다. PPT처럼 다듬고, 버튼 하나로 호스팅까지.
          제작부터 유지보수까지 한 곳에서.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#c8a96a] px-7 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
          >
            내 사이트 시작하기
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#pricing"
            className="inline-flex h-12 items-center rounded-xl border border-neutral-700 px-7 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
          >
            가격 보기
          </a>
        </div>

        {/* 신뢰 지표 */}
        <div className="mx-auto mt-20 grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-800">
          {[
            ['3일', '평균 제작 기간'],
            ['1/5', '에이전시 대비 가격'],
            ['0원', '호스팅 · SSL 추가 비용'],
          ].map(([value, label]) => (
            <div key={label} className="bg-[#0f0f10] px-4 py-6">
              <p className="text-2xl font-semibold text-[#c8a96a]">{value}</p>
              <p className="mt-1 text-xs text-neutral-500">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 진행 방식 */}
      <section className="border-t border-neutral-900 bg-[#0d0d0e]">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-neutral-50">
            세 단계면 끝납니다
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.no} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
                <p className="text-xs font-semibold tracking-widest text-[#c8a96a]">{step.no}</p>
                <h3 className="mt-3 text-base font-semibold text-neutral-100">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
      </section>

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
