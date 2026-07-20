import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ClipboardCheck,
  MessageSquareQuote,
  Search,
  Sparkles,
} from 'lucide-react';
import { BrowserFrame } from '@/components/marketing/mockups/BrowserFrame';
import { EditorMockup } from '@/components/marketing/mockups/EditorMockup';
import { SiteExampleMockup } from '@/components/marketing/mockups/SiteExampleMockup';
import { GuaranteeBadge } from '@/components/marketing/GuaranteeBadge';
import { LaunchPrice } from '@/components/marketing/LaunchPrice';
import { MonthlyReportPreview } from '@/components/marketing/MonthlyReportPreview';
import { PricingMotionComparison } from '@/components/marketing/PricingMotionComparison';
import { ScannerCta } from '@/components/marketing/ui';
import {
  CREDIT_CONTRACT_COPY,
  formatKrw,
  PRICING,
  SUBSCRIPTION_BENEFIT_COPY,
} from '@/lib/pricing';

export const metadata: Metadata = {
  title: '기능 — 홈페이지 제작부터 검색 등록·성과 증명까지',
  description:
    '업종에 맞는 홈페이지 제작, 네이버·구글·AI가 확인하기 쉬운 구성, 검색 등록 대행, 월간 성과 리포트와 90일 성과 보장까지 한 흐름으로 제공합니다.',
  alternates: { canonical: '/features' },
};

const BUILD_STEPS = [
  ['01', '필요한 내용을 먼저 정합니다', '업종과 고객이 자주 찾는 정보를 받아 필요한 페이지부터 구성합니다.'],
  ['02', '서로 다른 디자인을 비교합니다', '사진 배치와 색, 글꼴이 다른 세 가지 방향을 보고 하나를 고릅니다.'],
  ['03', '직접 다듬고 바로 엽니다', '하나로 이어지는 화면에서 글과 사진을 옮긴 뒤 안전한 주소로 발행합니다.'],
] as const;

const DISCOVERY_STEPS = [
  {
    badge: 'SEO',
    title: "손님이 네이버에 ‘근처 ○○’를 검색할 때 사장님 가게가 나오기 쉬운 구조로 만듭니다.",
    example: '예: 성수동 세탁소를 찾는 손님에게 지역·서비스·영업 정보를 한 페이지에서 분명히 보여줍니다.',
    question: 'SEO가 뭔가요?',
    href: '/faq#seo',
  },
  {
    badge: 'AEO',
    title: '“주차 되나요?” 같은 질문에 검색이 홈페이지의 답을 보여주기 쉽게 정리합니다.',
    example: '예: 주차 가능 시간, 예약 방법, 쉬는 날을 질문과 바로 이어지는 답으로 정리합니다.',
    question: 'AEO가 뭔가요?',
    href: '/faq#aeo',
  },
  {
    badge: 'GEO',
    title: '요즘 손님은 AI에게 물어봅니다. AI가 사장님 가게를 인용할 공식 근거를 만듭니다.',
    example: '예: 상호·주소·전화번호·공식 채널을 같은 정보로 맞춰 AI가 출처를 확인하기 쉽게 합니다.',
    question: 'GEO가 뭔가요?',
    href: '/faq#geo',
  },
] as const;

export default function FeaturesPage() {
  return (
    <div className="overflow-hidden bg-[#F8FBFF] text-[#0B1736]">
      <section data-features-section="website" className="border-b border-[#DCE4F0] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-24">
          <div className="grid items-end gap-10 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">
                Website is the beginning
              </p>
              <h1 className="mkt-type-page-title mt-5 max-w-4xl font-semibold tracking-[-0.055em] break-keep">
                홈페이지는 기본입니다.
                <br />완성도는 직접 보세요.
              </h1>
            </div>
            <div className="pb-1">
              <p className="mkt-type-body max-w-xl text-[#526174] break-keep">
                업종에 맞는 페이지와 디자인 세 가지를 만들고, 사장님이 직접 다듬어 발행합니다.
                말로 설명하는 대신 실제로 열린 홈페이지를 보여드립니다.
              </p>
              <Link
                href="/cases"
                className="mkt-type-control group mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-[#174DDA] px-7 font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                직접 보세요
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="mt-16 grid items-center gap-12 lg:grid-cols-[.78fr_1.22fr]">
            <div className="flex min-h-[300px] items-center justify-center border-y border-[#DCE4F0] bg-[#F3F7FC] py-12">
              <SiteExampleMockup className="scale-125 sm:scale-150" />
            </div>
            <BrowserFrame url="editor.anakslabs.com">
              <div className="p-4 sm:p-7">
                <EditorMockup />
              </div>
            </BrowserFrame>
          </div>

          <ol className="mt-12 grid border-y border-[#DCE4F0] md:grid-cols-3 md:divide-x md:divide-[#DCE4F0]">
            {BUILD_STEPS.map(([number, title, body]) => (
              <li key={number} className="px-2 py-7 md:px-7">
                <span className="mkt-type-eyebrow font-mono text-[#174DDA]">{number}</span>
                <h2 className="mkt-type-card-title mt-5 font-semibold tracking-[-0.025em]">{title}</h2>
                <p className="mkt-type-body mt-3 text-[#5F6B7C]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section data-features-section="discovery" className="border-b border-[#DCE4F0]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
            <div>
              <Search className="h-8 w-8 text-[#174DDA]" aria-hidden />
              <h2 className="mkt-type-section-title mt-6 font-semibold tracking-[-0.045em] break-keep">
                만드는 것보다 중요한 건,
                <br />손님에게 찾아지는 것입니다.
              </h2>
              <p className="mkt-type-body mt-5 max-w-lg text-[#526174]">
                홈페이지를 연 뒤 손님이 검색하고 질문하는 세 순간까지 준비합니다.
              </p>
            </div>
            <div>
              <div className="grid gap-px border-y border-[#C8D8EC] bg-[#C8D8EC] md:grid-cols-3">
                {DISCOVERY_STEPS.map((item, index) => {
                  const Icon = index === 0 ? Search : index === 1 ? MessageSquareQuote : Bot;
                  return (
                    <article key={item.badge} className="flex min-h-full flex-col bg-[#F8FBFF] px-5 py-7 md:px-6 md:py-9">
                      <div className="flex items-center justify-between gap-4">
                        <Icon className="h-5 w-5 text-[#174DDA]" aria-hidden />
                        <span className="mkt-type-eyebrow rounded-full border border-[#AFC6F8] bg-[#EDF4FF] px-2.5 py-1 font-mono font-semibold tracking-[0.12em] text-[#174DDA]">
                          {item.badge}
                        </span>
                      </div>
                      <h3 className="mkt-type-card-title mt-8 font-semibold tracking-[-0.025em] break-keep">
                        {item.title}
                      </h3>
                      <p className="mkt-type-body mt-4 text-[#5F6B7C]">{item.example}</p>
                      <Link
                        href={item.href}
                        className="mkt-type-control group mt-7 inline-flex items-center gap-1.5 self-start font-semibold text-[#174DDA]"
                      >
                        {item.question}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                      </Link>
                    </article>
                  );
                })}
              </div>
              <p className="mkt-type-support mt-5 text-[#667085]">
                검색 순위나 AI 답변 노출을 보장하는 말이 아닙니다. 가게의 공식 정보를 네이버·구글과 AI가 읽고 확인하기 쉬운 구조로 만드는 일입니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section data-features-section="registration" className="border-b border-[#DCE4F0] bg-[#0B1736] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
          <div>
            <ClipboardCheck className="h-8 w-8 text-[#5DE0D0]" aria-hidden />
            <h2 className="mkt-type-section-title mt-6 font-semibold tracking-[-0.045em] break-keep">
              등록까지 저희가 대신합니다.
            </h2>
            <p className="mkt-type-body mt-5 max-w-xl text-white/68 break-keep">
              네이버·구글 검색 등록까지 다보임이 대신합니다. 사장님은 아무것도 안 하셔도 됩니다.
            </p>
          </div>
          <ol className="grid gap-6 border-l border-white/15 pl-7 sm:grid-cols-3">
            {['확인 정보를 넣고', '검색 서비스에 등록하고', '완료 여부까지 확인합니다'].map((item, index) => (
              <li key={item}>
                <span className="font-mono text-sm font-semibold text-[#5DE0D0]">0{index + 1}</span>
                <p className="mkt-type-body mt-4 font-semibold text-white/88">{item}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section data-features-section="report" className="border-b border-[#DCE4F0] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <BarChart3 className="h-8 w-8 text-[#174DDA]" aria-hidden />
              <h2 className="mkt-type-section-title mt-6 font-semibold tracking-[-0.045em] break-keep">
                매달 성과를 숫자로 보여드립니다.
              </h2>
              <p className="mkt-type-body mt-5 max-w-xl text-[#526174] break-keep">
                매달 이메일로 보내드립니다. 홈페이지가 열린 횟수, 어디서 왔는지(네이버·구글·인스타그램), 전화·예약·길찾기 버튼이 몇 번 눌렸는지 보여드립니다.
              </p>
            </div>
            <MonthlyReportPreview />
          </div>

          <div className="mt-16 border-y border-[#C8D8EC] py-9">
            <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr]">
              <div>
                <p className="mkt-type-eyebrow font-mono tracking-[0.14em] text-[#174DDA]">MONTHLY SUBSCRIPTION</p>
                <p className="mkt-type-card-title mt-3 font-semibold tracking-[-0.025em]">
                  사이트 운영 구독 월 {formatKrw(PRICING.subscription.monthly)}
                </p>
                <p className="mkt-type-support mt-2 text-[#667085]">VAT 별도</p>
              </div>
              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <div>
                  <p className="mkt-type-body flex items-center gap-2 font-semibold text-[#26354D]">
                    <Check className="h-4 w-4 shrink-0 text-[#03A995]" aria-hidden />
                    {SUBSCRIPTION_BENEFIT_COPY.report} + 클릭 추적
                  </p>
                  <p className="mkt-type-support mt-2 text-[#667085]">방문 흐름과 전화·예약·길찾기 반응을 매달 확인합니다.</p>
                </div>
                <div>
                  <p className="mkt-type-body flex items-center gap-2 font-semibold text-[#26354D]">
                    <Check className="h-4 w-4 shrink-0 text-[#03A995]" aria-hidden />
                    {SUBSCRIPTION_BENEFIT_COPY.credits}
                  </p>
                  <p className="mkt-type-support mt-2 text-[#667085]">{CREDIT_CONTRACT_COPY}</p>
                </div>
                <div>
                  <p className="mkt-type-body flex items-center gap-2 font-semibold text-[#26354D]">
                    <Check className="h-4 w-4 shrink-0 text-[#03A995]" aria-hidden />
                    검색·AI용 기본 구조 업데이트
                  </p>
                  <p className="mkt-type-support mt-2 text-[#667085]">검색과 AI가 홈페이지를 읽는 방식이 바뀌면 기본 구조도 함께 점검하고 업데이트합니다.</p>
                </div>
                <div>
                  <p className="mkt-type-body flex items-center gap-2 font-semibold text-[#26354D]">
                    <Check className="h-4 w-4 shrink-0 text-[#03A995]" aria-hidden />
                    {SUBSCRIPTION_BENEFIT_COPY.operations}
                  </p>
                  <p className="mkt-type-support mt-2 text-[#667085]">사이트를 안전하게 열어두는 운영까지 포함합니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section data-features-section="guarantee" className="border-b border-[#DCE4F0]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div>
            <Sparkles className="h-8 w-8 text-[#03A995]" aria-hidden />
            <h2 className="mkt-type-section-title mt-6 font-semibold tracking-[-0.045em]">
              90일 성과 보장
            </h2>
            <p className="mkt-type-body mt-5 max-w-lg text-[#526174]">
              만들었다는 말보다 실제로 찾아오는 신호로 판단합니다.
            </p>
          </div>
          <GuaranteeBadge />
        </div>
      </section>

      <section data-features-section="motion" className="border-b border-[#DCE4F0] bg-[#F4F7FA]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
            <div>
              <p className="mkt-type-eyebrow font-mono tracking-[0.14em] text-[#174DDA]">OPTIONAL VIDEO</p>
              <h2 className="mkt-type-section-title mt-5 font-semibold tracking-[-0.045em] break-keep">
                기본 움직임과 영상 첫 화면을 같은 장면으로 비교하세요.
              </h2>
              <p className="mkt-type-body mt-5 max-w-lg text-[#526174] break-keep">
                모든 홈페이지에는 기본 움직임이 포함됩니다. 더 깊은 공간감이 필요할 때만 AI 영상 홈페이지를 추가할 수 있습니다.
              </p>
            </div>
            <PricingMotionComparison />
          </div>
        </div>
      </section>

      <section data-features-section="cta" className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">Start with evidence</p>
            <h2 className="mkt-type-section-title mt-5 max-w-3xl font-semibold tracking-[-0.045em] break-keep">
              지금 홈페이지가 있다면 먼저 진단하고,
              <br />없다면 가격부터 확인하세요.
            </h2>
            <div className="mt-8 flex flex-wrap gap-3">
              <ScannerCta href="/#hero-scanner">내 사이트 무료 진단</ScannerCta>
              <Link href="/pricing" className="mkt-type-control inline-flex h-12 items-center gap-2 rounded-xl border border-[#C8D8EC] px-7 font-semibold text-[#0B1736]">
                가격과 포함 기능 보기 <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
          <div className="min-w-[260px] border-t border-[#DCE4F0] pt-6 lg:text-right">
            <LaunchPrice align="right" />
            <p className="mkt-type-support mt-2 text-[#667085]">
              + 사이트 운영 구독 월 {formatKrw(PRICING.subscription.monthly)} · VAT 별도
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
