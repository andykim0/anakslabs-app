import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Bot, Check, FileWarning, Search } from 'lucide-react';
import { INITIAL_GRANT, PRICE_RANGES } from '@/lib/credits/constants';
import { VIDEO_ADDON_PRICE_KRW } from '@/lib/services/entitlements';
import { LandingScanner } from '@/components/landing/LandingScanner';
import { ScannerCta } from '@/components/marketing/ui';
import { Eyebrow } from '@/components/marketing/Eyebrow';
import { TrustStrip } from '@/components/marketing/TrustStrip';
import { HeroVideo } from '@/components/marketing/HeroVideo';
import { ScrollCue } from '@/components/marketing/ScrollCue';
import { FadeIn } from '@/components/motion/FadeIn';
import { BrowserFrame } from '@/components/marketing/mockups/BrowserFrame';
import { ReportMockup } from '@/components/marketing/mockups/ReportMockup';
import { EditorMockup } from '@/components/marketing/mockups/EditorMockup';
import { SiteExampleMockup } from '@/components/marketing/mockups/SiteExampleMockup';

export const metadata: Metadata = {
  title: '검색과 AI가 찾아오는 홈페이지, 처음부터 그렇게 짓습니다',
  description:
    '무료 SEO·AEO·GEO 진단 후, 검색·AI가 읽을 수 있는 사이트로 다시 짓기. AI가 설계하고 캔버스에서 다듬어 즉시 호스팅 — 아낙스랩스.',
};

function man(krw: number): string {
  return `${Math.round(krw / 10_000)}만원`;
}

const PROBLEMS = [
  { icon: <Search className="h-5 w-5" />, title: '검색에서 사라짐', body: '“근처 맛집”·“이 동네 치과”에 안 잡히면 후보에조차 오르지 못합니다.' },
  { icon: <Bot className="h-5 w-5" />, title: 'AI 답변에서 누락', body: '손님은 AI에게 추천을 묻는데, 읽을 수 없는 사이트는 인용되지 않습니다.' },
  { icon: <FileWarning className="h-5 w-5" />, title: '있어도 없는 것', body: '홈페이지가 있어도 구조가 비면 검색엔진엔 존재하지 않는 것과 같습니다.' },
];

const CORE_FEATURES = ['이미지 중심 정적 사이트', '서브도메인 + SSL', 'AI 디자인 3안 + 캔버스 에디터', '다중 페이지 + 자동 헤더 내비', 'SEO·AEO·GEO 기본 세팅', `편집 크레딧 ${INITIAL_GRANT.basic}개`];

/**
 * [마케팅] 메인 — 진단기 히어로 → 가치 → 문제(3열) → 목업 지그재그 → 가격 → 최종 CTA.
 * 진단 진입점은 딱 2곳: 히어로 입력창 + 하단 최종 CTA(#hero-scanner). 나머지는 텍스트 링크.
 */
export default function MarketingHome() {
  return (
    <>
      {/* 1) 진단기 히어로 (승격) — 시네마틱 영상 배경 + LandingScanner(h1) + 리포트 목업 + 신뢰 지표 */}
      <div className="relative overflow-hidden">
        <HeroVideo />
        <div className="relative z-10">
          <LandingScanner />
          <div className="mx-auto -mt-2 max-w-md px-6">
            <ReportMockup className="mx-auto" />
          </div>
          <div className="mx-auto max-w-5xl px-6 pt-12 pb-10">
            <TrustStrip />
          </div>
        </div>
        <ScrollCue />
      </div>

      {/* 2) 구 히어로 카피 — h2로 강등, CTA 없음 */}
      <section className="mx-auto max-w-3xl px-6 py-14 text-center">
        <FadeIn>
          <h2 className="text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">
            검색과 AI가 찾아오는 사이트,
            <br />
            AI가 처음부터 그렇게 짓습니다
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#5C6068]">
            예쁘기만 한 사이트가 아니라, 검색엔진과 생성형 AI가 읽고 인용할 수 있게 태어난 사이트.
            제목·구조화 데이터·시맨틱 마크업·사업자 정보를 기본값으로 깔아 발행합니다.
          </p>
        </FadeIn>
      </section>

      {/* 3) 문제 공감 — 3열 카드 */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <FadeIn>
            <h2 className="text-center text-xl font-semibold tracking-tight text-[#17181C] sm:text-2xl">
              검색에 안 나오는 가게는, 손님에게 없는 가게입니다
            </h2>
          </FadeIn>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <FadeIn key={p.title} delay={i * 0.08} className="h-full">
                <div className="group h-full rounded-2xl border border-[#E8E6E0] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-transform duration-200 hover:-translate-y-1">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3ECD8] text-[#856A26] transition-transform duration-200 group-hover:scale-110">
                    {p.icon}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-[#17181C]">{p.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5C6068]">{p.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* 4) 지그재그 — 캔버스 편집 (텍스트 좌 / 목업 우) */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <FadeIn>
            <Eyebrow>드래그로 완성</Eyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">
              코드 몰라도, 끌어서 다듬습니다
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#5C6068]">
              AI가 만든 3안 중 하나를 고르면, PPT처럼 요소를 끌어 옮기고 크기를 바꿉니다. 페이지별
              자유배치 캔버스에서 원하는 부분만 손대면 됩니다.
            </p>
            <Link href="/features" className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#856A26] transition-colors hover:text-[#17181C]">
              기능 전체 보기
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </FadeIn>
          <FadeIn delay={0.08}>
            <BrowserFrame url="editor.anakslabs.com">
              <EditorMockup />
            </BrowserFrame>
          </FadeIn>
        </div>
      </section>

      {/* 5) 지그재그 — 업종별 사이트 (목업 좌 / 텍스트 우) */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <FadeIn className="md:order-2">
              <Eyebrow>업종 맞춤</Eyebrow>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">
                업종에 맞게 태어납니다
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#5C6068]">
                카페·치과·학원 — 업종을 고르면 그에 맞는 페이지 구성과 섹션이 자동으로 잡힙니다.
                검색·AI 최적화 기본 세팅은 어느 업종이든 동일하게 들어갑니다.
              </p>
              <Link href="/cases" className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#856A26] transition-colors hover:text-[#17181C]">
                고객사례 보기
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </FadeIn>
            <FadeIn delay={0.08} className="md:order-1">
              <SiteExampleMockup />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* 6) 가격 요약 — 단일 제품 + 영상 애드온 */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <FadeIn>
          <h2 className="text-center text-2xl font-semibold tracking-tight text-[#17181C]">제작비 1회 + 월 유지보수</h2>
          <p className="mt-2 text-center text-sm text-[#5C6068]">숨은 비용 없음. 단일 제품. (표시가는 부가세 별도)</p>
        </FadeIn>
        <div className="mx-auto mt-10 max-w-md">
          <FadeIn delay={0} className="h-full">
            <div className="h-full rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-transform duration-200 hover:-translate-y-1">
              <h3 className="text-sm font-semibold tracking-widest text-[#856A26] uppercase">
                홈페이지 제작 + 호스팅
              </h3>
              <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-normal text-[#696E76] line-through">
                  {man(PRICE_RANGES.buildFee.basic[1])}
                </span>
                <span className="text-3xl font-semibold text-[#17181C]">
                  {man(PRICE_RANGES.buildFee.basic[0])}
                </span>
              </p>
              <p className="mt-1 text-xs text-[#5C6068]">
                + 월 {man(PRICE_RANGES.maintenanceMonthly.basic[1])} 관리
              </p>
              <ul className="mt-5 space-y-2.5">
                {CORE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#5C6068]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#856A26]" />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-xl bg-white px-4 py-3 text-xs leading-5 text-[#5C6068]">
                AI 영상 히어로·시네마틱 영상은 원할 때만 추가하는 애드온입니다 — +{man(VIDEO_ADDON_PRICE_KRW)}.
              </p>
            </div>
          </FadeIn>
        </div>
        <div className="mt-8 text-center">
          <Link href="/pricing" className="group inline-flex items-center gap-1.5 text-sm font-medium text-[#856A26] transition-colors hover:text-[#17181C]">
            가격 자세히 보기
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* 7) 최종 CTA — 진단 히어로로 스크롤 (두 번째 진단 진입점) */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <FadeIn>
            <h2 className="text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">
              지금 내 가게는 검색·AI에 어떻게 보일까요?
            </h2>
            <p className="mt-3 text-sm text-[#5C6068]">1분이면 확인합니다. 가입 없이 무료.</p>
            <div className="mt-8 flex justify-center">
              <ScannerCta href="#hero-scanner">내 가게 무료 진단받기</ScannerCta>
            </div>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
