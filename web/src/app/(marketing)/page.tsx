import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  Code2,
  Layers3,
  MessageSquareQuote,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { INITIAL_GRANT } from '@/lib/credits/constants';
import { ROOT_DOMAIN } from '@/lib/env';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import {
  CREDIT_CONTRACT_COPY,
  formatKrw,
  PRICING,
  SUBSCRIPTION_BENEFIT_COPY,
  SUBSCRIPTION_VALUE_COPY,
} from '@/lib/pricing';
import { FaqList, faqJsonLd, type FaqItem } from '@/components/marketing/Faq';
import { LandingCinematicShowcase } from '@/components/marketing/LandingCinematicShowcase';
import { LandingFullFilm } from '@/components/marketing/LandingFullFilm';
import { LandingStoryContinuation } from '@/components/marketing/LandingStoryContinuation';
import { LaunchPrice } from '@/components/marketing/LaunchPrice';
import { BrowserFrame } from '@/components/marketing/mockups/BrowserFrame';
import { EditorMockup } from '@/components/marketing/mockups/EditorMockup';
import { SiteExampleMockup } from '@/components/marketing/mockups/SiteExampleMockup';
import { FadeIn } from '@/components/motion/FadeIn';

const PAGE_TITLE = `손님이 찾고 믿을 수 있는 홈페이지 제작 | ${PUBLIC_BRAND_NAMES.brand}`;
const PAGE_DESCRIPTION =
  `손님이 네이버·구글에서 가게를 찾고 AI에 물을 때 공식 정보를 확인하기 쉬운 홈페이지를 만듭니다. 업종별 설계, 디자인 3안, 직접 편집, 호스팅과 월간 성과 리포트까지 ${PUBLIC_BRAND_NAMES.brand} 하나로 제공합니다.`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: ['AI 홈페이지 제작', '홈페이지 제작', 'SEO 홈페이지', 'AEO 최적화', 'GEO 최적화', '소상공인 홈페이지'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: '/',
    siteName: PUBLIC_BRAND_NAMES.brandBilingual,
    title: `손님이 찾고 믿을 수 있게 | ${PUBLIC_BRAND_NAMES.brand}`,
    description: PAGE_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: `손님이 찾고 믿을 수 있게 | ${PUBLIC_BRAND_NAMES.brand}`,
    description: PAGE_DESCRIPTION,
  },
};

const ENGINES = [
  {
    no: '01',
    name: 'SEO',
    label: '손님이 검색하면 찾기 쉽게',
    icon: Search,
    body: '가게 이름, 지역, 서비스와 각 페이지 내용을 분명히 적어 네이버와 구글이 찾기 쉽게 만듭니다.',
    detail: 'META · SEMANTIC HTML · SITEMAP',
  },
  {
    no: '02',
    name: 'AEO',
    label: '“주차 되나요?”에 바로 답하게',
    icon: MessageSquareQuote,
    body: '영업시간, 주차, 예약처럼 손님이 자주 묻는 내용을 질문과 답으로 또렷하게 정리합니다.',
    detail: 'SEMANTIC ANSWERS · ENTITY · JSON-LD',
  },
  {
    no: '03',
    name: 'GEO',
    label: 'AI도 공식 정보를 확인하기 쉽게',
    icon: Bot,
    body: '가게 이름, 지역, 서비스, 연락처와 공식 채널을 한뜻으로 적어 AI가 정보를 덜 헷갈리게 합니다.',
    detail: 'CRAWLER ACCESS · EVIDENCE · ENTITY',
  },
];

const COMPARISON = [
  {
    label: '누가 만드나요',
    builder: '사장님이 직접',
    agency: '상담·견적을 거쳐 업체가',
    anaks: '다보임이 처음부터 끝까지',
  },
  {
    label: '시작하는 법',
    builder: '템플릿 고르고 직접 조립',
    agency: '상담→견적→제작',
    anaks: '질문에 답하면 디자인 3안이 도착',
  },
  {
    label: '검색·AI 노출',
    builder: '사장님이 직접 설정',
    agency: '계약 범위에 따라',
    anaks: '기본 포함 — 네이버·구글·AI까지 설계',
  },
  {
    label: '오픈 후 수정',
    builder: '사장님이 직접',
    agency: '요청·계약에 따라',
    anaks: '무제한 무료',
  },
  {
    label: '성과 확인',
    builder: '스스로 분석',
    agency: '별도 관리 계약',
    anaks: '매달 리포트가 숫자로 도착',
  },
];

const PROCESS = [
  { no: '01', title: '장사에 필요한 내용을 묻습니다', body: '업종, 지역, 원하는 분위기와 가진 자료를 받아 필요한 페이지부터 정합니다.' },
  { no: '02', title: '만들기 전에 구성을 보여드립니다', body: '비용이 드는 생성 전에 어느 페이지에 무엇이 들어갈지 글로 먼저 확인합니다.' },
  { no: '03', title: '서로 다른 디자인 3안을 만듭니다', body: '마음에 드는 방향을 고른 뒤, 하나로 이어지는 화면에서 직접 다듬을 수 있습니다.' },
  { no: '04', title: '빠진 정보를 확인하고 엽니다', body: '손님이 찾는 정보와 문의 동선을 점검한 뒤 안전한 주소와 여러 페이지로 발행합니다.' },
];

const CORE_FEATURES = [
  '업종별 페이지·섹션 설계',
  'AI 디자인 후보 3안',
  '자유배치 캔버스 에디터',
  '네이버·구글·AI가 읽기 쉬운 기본 구성',
  '멀티페이지 + SSL 호스팅',
  `편집 크레딧 ${INITIAL_GRANT.basic}개`,
  SUBSCRIPTION_BENEFIT_COPY.report,
  SUBSCRIPTION_BENEFIT_COPY.credits,
];

const FAQS: FaqItem[] = [
  {
    q: '일반 템플릿 빌더와 무엇이 다른가요?',
    a: `범용 빌더는 많은 기능을 직접 조립하는 데 강점이 있습니다. ${PUBLIC_BRAND_NAMES.brand}은 사장님 업종에 필요한 페이지와 손님이 찾는 정보를 먼저 정리하고, 디자인 3안부터 호스팅과 매달 성과 리포트까지 한 번에 제공합니다.`,
  },
  {
    q: '검색 순위나 AI 답변 노출을 보장하나요?',
    a: `아니요. 순위와 AI 답변 노출은 네이버·구글·AI 서비스가 결정합니다. ${PUBLIC_BRAND_NAMES.brand}은 가게 이름, 지역, 서비스와 공식 정보를 읽고 확인하기 쉬운 홈페이지를 만듭니다.`,
  },
  {
    q: '완성된 홈페이지를 직접 수정할 수 있나요?',
    a: CREDIT_CONTRACT_COPY,
  },
  {
    q: '사이트 운영 구독에는 무엇이 포함되나요?',
    a: `${SUBSCRIPTION_BENEFIT_COPY.operations}, ${SUBSCRIPTION_BENEFIT_COPY.report}, ${SUBSCRIPTION_BENEFIT_COPY.credits}이 포함됩니다. ${SUBSCRIPTION_VALUE_COPY}`,
  },
  {
    q: 'AI 영상 홈페이지도 만들 수 있나요?',
    a: `기본 모션은 제작비에 포함되어 무료입니다. ${PUBLIC_BRAND_NAMES.ai}가 만드는 시네마틱 영상 히어로는 AI 영상 홈페이지 옵션으로 +${formatKrw(PRICING.videoHeroAddon)}에 추가할 수 있습니다.`,
  },
];

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${PUBLIC_BRAND_NAMES.ai} 홈페이지 제작·호스팅`,
    serviceType: 'AI 기반 업종 맞춤 홈페이지 제작 및 관리형 호스팅',
    description: PAGE_DESCRIPTION,
    areaServed: { '@type': 'Country', name: '대한민국' },
    provider: {
      '@type': 'Organization',
      name: 'Anaks Labs',
      alternateName: '아낙스랩스',
      url: `https://${ROOT_DOMAIN}`,
      logo: `https://${ROOT_DOMAIN}/daboim-mark.svg`,
    },
    brand: {
      '@type': 'Brand',
      name: PUBLIC_BRAND_NAMES.brand,
      alternateName: PUBLIC_BRAND_NAMES.brandBilingual,
    },
  },
  faqJsonLd(FAQS),
];

export default function MarketingHome() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <LandingFullFilm>
        {/* 상단은 필름 스크럽, 후속 구간은 같은 progress runtime의 DOM 안무로 이어진다. */}
        <LandingCinematicShowcase />

        <LandingStoryContinuation>

      {/* 범용 AI 제작이 아니라 홈페이지 전문 최적화 AI라는 카테고리 정의 */}
      <section data-story-chapter="01" className="overflow-hidden bg-[#F8FBFF]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div data-story-copy="category" className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
              <div>
                <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">A NEW WEBSITE CATEGORY</p>
                <p className="mkt-type-body mt-4 text-[#666A73]">예쁘게만 만들지 않습니다.<br />손님이 찾는 정보까지 채웁니다.</p>
              </div>
              <h2 className="mkt-type-section-title max-w-4xl font-semibold tracking-[-0.045em] text-[#0B1736]">
                손님이 찾고 궁금해할 내용을
                <br className="hidden sm:block" /> 홈페이지에 먼저 담아드립니다.
              </h2>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 세 최적화 엔진 */}
      <section data-story-chapter="02" className="border-y border-[#DCE4F0] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div data-story-copy="engines" className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">ONE SITE · THREE ENGINES</p>
                <h2 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.04em] text-[#0B1736]">손님이 가게를 찾는 세 순간을 한 번에.</h2>
              </div>
              <p className="mkt-type-body max-w-md text-[#666A73]">검색 결과에서 찾고, 궁금한 답을 확인하고, AI도 공식 정보를 구분할 수 있게 필요한 내용을 넣습니다. 순위나 노출은 보장하지 않습니다.</p>
            </div>
          </FadeIn>

          <div className="mt-12 grid gap-px overflow-hidden rounded-[28px] border border-[#DCE4F0] bg-[#DCE4F0] lg:grid-cols-3">
            {ENGINES.map(({ no, name, label, icon: Icon, body, detail }, i) => (
              <FadeIn key={name} delay={i * 0.08} className="h-full bg-white">
                <article className="group flex h-full min-h-[330px] flex-col p-7 transition-colors hover:bg-[#F7F7F3] sm:p-9">
                  <div className="flex items-start justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#174DDA] via-[#08B8E8] to-[#03D1B8] text-white transition-transform group-hover:-rotate-3 group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="mkt-type-support font-mono text-[#8A8E96]">ENGINE / {no}</span>
                  </div>
                  <div className="mt-12">
                    <p className="mkt-type-eyebrow font-mono font-semibold tracking-[0.14em] text-[#174DDA]">{name}</p>
                    <h3 className="mkt-type-card-title mt-2 font-semibold tracking-[-0.035em] text-[#0B1736]">{label}</h3>
                    <p className="mkt-type-body mt-4 text-[#666A73]">{body}</p>
                  </div>
                  <p className="mkt-type-support mt-auto border-t border-[#E4E6E0] pt-5 font-mono tracking-[0.1em] text-[#8A8E96]">{detail}</p>
                </article>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* 범용 빌더·대행사와의 공정한 비교 */}
      <section data-story-chapter="03" className="border-y border-[#DCE4F0] bg-[#EEF5FF] text-[#0B1736]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div data-story-copy="comparison" className="grid gap-8 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#08AFC5] uppercase">왜 다보임인가</p>
                <h2 data-comparison-title className="mkt-type-section-title mt-4 font-semibold tracking-[-0.04em] text-balance break-keep">직접 만드는 것보다 쉽고,<br />맡기는 것보다 빠릅니다.</h2>
              </div>
              <p data-comparison-support className="mkt-type-body max-w-lg break-keep text-[#5F6B7C] lg:justify-self-end">{PUBLIC_BRAND_NAMES.brand}이 처음부터 끝까지 만들어 드립니다. 사장님은 원하는 것만 말씀하세요. 오픈 후에는 매달 성과를 숫자로 받아봅니다.</p>
            </div>
          </FadeIn>

          <FadeIn delay={0.08}>
            <div className="mt-12 overflow-x-auto rounded-[28px] border border-[#C8D8EC] bg-white shadow-[0_18px_55px_rgba(11,23,54,.06)]">
              <div className="min-w-[820px]">
                <div data-comparison-header className="mkt-type-table-title grid grid-cols-[.62fr_1.12fr_1fr_1fr] break-keep border-b border-[#DCE4F0] bg-[#F8FBFF]">
                  <div className="p-5" />
                  <div data-comparison-column="daboim" className="border-x border-[#A8DDE2] bg-gradient-to-r from-[#EDF4FF] to-[#EAFBF7] p-5 font-semibold text-[#0B1736]">{PUBLIC_BRAND_NAMES.brand}</div>
                  <div data-comparison-column="builder" className="p-5 font-medium text-[#667085]">일반 템플릿 빌더</div>
                  <div data-comparison-column="agency" className="p-5 font-medium text-[#667085]">웹 제작대행사</div>
                </div>
                {COMPARISON.map((row) => (
                  <div key={row.label} data-comparison-row className="mkt-type-body grid grid-cols-[.62fr_1.12fr_1fr_1fr] break-keep border-b border-[#E4EAF2] last:border-b-0">
                    <div className="mkt-type-eyebrow p-5 font-mono tracking-[0.1em] text-[#174DDA]">{row.label}</div>
                    <div data-comparison-column="daboim" className="border-x border-[#A8DDE2] bg-gradient-to-r from-[#EDF4FF] to-[#EAFBF7] p-5 leading-6 font-semibold text-[#26354D]">{row.anaks}</div>
                    <div data-comparison-column="builder" className="p-5 leading-6 text-[#667085]">{row.builder}</div>
                    <div data-comparison-column="agency" className="p-5 leading-6 text-[#667085]">{row.agency}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 에이전시 품질을 제품 흐름으로 */}
      <section data-story-chapter="04" className="bg-[#F8FBFF]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div data-story-copy="process" className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">AGENCY FLOW · PRODUCT SPEED</p>
                <h2 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.04em] text-[#0B1736]">사장님이 중간마다 고르고,<br />확인한 만큼만 만들어집니다.</h2>
              </div>
              <Link href="/features" className="mkt-type-control group inline-flex items-center gap-2 font-semibold text-[#174DDA]">
                전체 기능 보기 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </FadeIn>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PROCESS.map((step, i) => (
              <FadeIn key={step.no} delay={i * 0.06} className="h-full">
                <article className="h-full rounded-2xl border border-[#DCE4F0] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <span className="mkt-type-eyebrow font-mono tracking-[0.14em] text-[#174DDA]">STEP {step.no}</span>
                    {i === 0 ? <Layers3 className="h-4 w-4 text-[#8A8E96]" /> : i === 1 ? <Code2 className="h-4 w-4 text-[#8A8E96]" /> : i === 2 ? <Sparkles className="h-4 w-4 text-[#8A8E96]" /> : <ShieldCheck className="h-4 w-4 text-[#8A8E96]" />}
                  </div>
                  <h3 className="mkt-type-card-title mt-10 font-semibold tracking-[-0.025em] text-[#0B1736]">{step.title}</h3>
                  <p className="mkt-type-body mt-3 text-[#666A73]">{step.body}</p>
                </article>
              </FadeIn>
            ))}
          </div>

          <div className="mt-16 grid items-center gap-12 lg:grid-cols-[.88fr_1.12fr]">
            <FadeIn>
              <div data-story-copy="editor">
                <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">DIRECTABLE AI</p>
                <h3 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.04em] text-[#0B1736]">AI가 시작하고,<br />사장님이 방향을 잡습니다.</h3>
                <p className="mkt-type-body mt-5 max-w-lg text-[#666A73]">먼저 페이지 구성을 확인하고, 서로 다른 디자인 3안에서 방향을 고릅니다. 하나로 이어지는 홈페이지 화면에서 PPT를 다루듯 요소를 옮기고 크기를 바꿀 수 있습니다. 직접 수정은 횟수 제한 없이 무료입니다.</p>
                <ul className="mkt-type-body mt-7 grid gap-3 text-[#41444C] sm:grid-cols-2">
                  {['생성 전 구성 확인', '디자인 3안 비교', '드래그·리사이즈 편집', '구조 진단 후 발행'].map((item) => (
                    <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#03A995]" />{item}</li>
                  ))}
                </ul>
              </div>
            </FadeIn>
            <FadeIn delay={0.08}>
              <BrowserFrame url="editor.anakslabs.com">
                <div className="p-4 sm:p-7"><EditorMockup /></div>
              </BrowserFrame>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* 업종 시스템 + 모션 제품 시연 */}
      <section data-story-chapter="05" className="border-y border-[#DCE4F0] bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-2">
          <FadeIn>
            <div className="flex min-h-[340px] items-center justify-center rounded-[28px] border border-[#DCE4F0] bg-[#F8FBFF] p-10">
              <SiteExampleMockup className="scale-125 sm:scale-150" />
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <div data-story-copy="industry">
              <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">NICHE-NATIVE DESIGN</p>
              <h2 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.04em] text-[#0B1736]">카페와 병원은<br />같은 홈페이지일 수 없습니다.</h2>
              <p className="mkt-type-body mt-5 max-w-lg text-[#666A73]">카페 손님은 메뉴와 위치를, 병원 방문자는 진료 안내와 예약 방법을 먼저 찾습니다. 업종에 맞는 페이지와 버튼부터 다르게 설계합니다.</p>
              <Link href="/cases" className="mkt-type-control group mt-7 inline-flex items-center gap-2 font-semibold text-[#174DDA]">업종별 구성 보기 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 단일 제품 가격 */}
      <section data-story-chapter="06" className="border-y border-[#DCE4F0] bg-[#F8FBFF]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
          <FadeIn>
            <div data-story-copy="pricing">
              <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">ONE PRODUCT · CLEAR PRICE</p>
              <h2 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.04em] text-[#0B1736]">만들고 끝내지 않고,<br />계속 좋아지게 관리합니다.</h2>
              <p className="mkt-type-body mt-5 max-w-md text-[#666A73]">처음 만들 때 제작비를 내고, 운영 중에는 매달 방문·전화·예약·길찾기 결과를 받습니다. 첫 화면에 실제 영상이 필요한 경우에만 AI 영상 홈페이지를 더하면 됩니다.</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <div className="rounded-[28px] border border-[#173060] bg-gradient-to-br from-[#0B1736] to-[#113E70] p-7 text-white shadow-[0_24px_70px_rgba(11,23,54,.18)] sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mkt-type-eyebrow font-mono tracking-[0.14em] text-[#5DE0D0]">WEBSITE + MANAGED HOSTING</p>
                  <h3 className="mkt-type-card-title mt-3 font-semibold">홈페이지 제작 + 호스팅</h3>
                </div>
                <LaunchPrice tone="dark" align="right" />
              </div>
              <p className="mkt-type-support mt-2 text-right text-white/48">+ 사이트 운영 구독 월 {formatKrw(PRICING.subscription.monthly)} · 부가세 별도</p>
              <p className="mkt-type-support mt-2 text-right font-medium text-[#5DE0D0]">{SUBSCRIPTION_VALUE_COPY}</p>
              <ul className="mkt-type-body mt-8 grid gap-3 border-t border-white/10 pt-7 text-white/68 sm:grid-cols-2">
                {CORE_FEATURES.map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#5DE0D0]" />{feature}</li>)}
              </ul>
              <div className="mt-7 flex flex-col justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.045] p-4 sm:flex-row sm:items-center">
                <p className="mkt-type-support text-white/52">AI 영상 홈페이지<br /><span className="text-white/78" data-brand-bilingual="core-first">{PUBLIC_BRAND_NAMES.aiBilingual} 시네마틱 영상 히어로 · 선택</span></p>
                <span className="mkt-type-body font-mono font-semibold text-[#5DE0D0]">+{formatKrw(PRICING.videoHeroAddon)}</span>
              </div>
              <Link href="/pricing" className="mkt-type-control group mt-7 inline-flex items-center gap-2 font-semibold text-white">가격 자세히 보기 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* AEO용 실제 질문·답변 */}
      <section data-story-chapter="07" className="bg-white">
        <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div data-story-copy="faq" className="mx-auto text-center">
              <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-[#174DDA] uppercase">DIRECT ANSWERS</p>
              <h2 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.04em] text-[#0B1736]">결정 전에 많이 묻는 질문</h2>
            </div>
            <div data-story-copy="faq-list" className="mt-12"><FaqList items={FAQS} /></div>
          </FadeIn>
        </div>
      </section>

      {/* 최종 CTA */}
      <section data-story-chapter="08" className="relative overflow-hidden bg-[linear-gradient(115deg,#174DDA_0%,#08AFC5_45%,#03BFA9_70%,#0B1736_100%)] text-white">
        <div data-story-decoration className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,.2),transparent_30%),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
        <div className="relative mx-auto max-w-5xl px-5 py-20 text-center sm:px-8 md:py-28">
          <FadeIn>
            <div data-story-copy="final" className="mx-auto">
              <p className="mkt-type-eyebrow font-mono tracking-[0.16em] text-white/82 uppercase">START WITH A SIGNAL CHECK</p>
              <h2 className="mkt-type-section-title mt-5 font-semibold tracking-[-0.045em]">이미 홈페이지가 있다면,<br />먼저 읽히는 상태부터 확인하세요.</h2>
              <p className="mkt-type-body mx-auto mt-5 max-w-lg text-white/68">홈페이지 주소만 넣으면 손님이 검색하거나 AI에 물을 때 빠진 정보가 무엇인지 확인할 수 있습니다. 가입 없이 무료입니다.</p>
              <Link href="#hero-scanner" className="mkt-type-control group mt-8 inline-flex h-13 items-center gap-2 rounded-xl bg-[#0B1736] px-7 font-semibold text-white transition-transform hover:-translate-y-1">내 사이트 무료 진단 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            </div>
          </FadeIn>
        </div>
      </section>
        </LandingStoryContinuation>
      </LandingFullFilm>
    </>
  );
}
