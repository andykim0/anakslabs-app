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
import { CREDIT_CONTRACT_COPY, formatKrw, PRICING } from '@/lib/pricing';
import { LandingScanner } from '@/components/landing/LandingScanner';
import { FaqList, faqJsonLd, type FaqItem } from '@/components/marketing/Faq';
import { HeroVideo } from '@/components/marketing/HeroVideo';
import { LandingCinematicShowcase } from '@/components/marketing/LandingCinematicShowcase';
import { LaunchPrice } from '@/components/marketing/LaunchPrice';
import { BrowserFrame } from '@/components/marketing/mockups/BrowserFrame';
import { EditorMockup } from '@/components/marketing/mockups/EditorMockup';
import { SiteExampleMockup } from '@/components/marketing/mockups/SiteExampleMockup';
import { FadeIn } from '@/components/motion/FadeIn';

const PAGE_TITLE = '홈페이지 전문 최적화 AI — SEO·AEO·GEO 기반 제작';
const PAGE_DESCRIPTION =
  '업종에 맞는 홈페이지를 AI가 설계하고, SEO·AEO·GEO 기반을 생성 기본값으로 적용합니다. 디자인 3안, 캔버스 편집, 멀티페이지 호스팅과 사이트 운영 구독까지 Daboim 하나로.';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: ['AI 홈페이지 제작', '홈페이지 제작', 'SEO 홈페이지', 'AEO 최적화', 'GEO 최적화', '소상공인 홈페이지'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: '/',
    siteName: 'Daboim',
    title: '검색과 AI가 읽을 수 있게 | Daboim 다보임',
    description: PAGE_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: '검색과 AI가 읽을 수 있게 | Daboim 다보임',
    description: PAGE_DESCRIPTION,
  },
};

const ENGINES = [
  {
    no: '01',
    name: 'SEO',
    label: '검색되는 구조',
    icon: Search,
    body: '페이지별 제목·설명, 시맨틱 HTML, 사이트맵을 기본으로 구성해 네이버와 구글이 내용을 발견하고 이해할 수 있게 합니다.',
    detail: 'META · SEMANTIC HTML · SITEMAP',
  },
  {
    no: '02',
    name: 'AEO',
    label: '답변되는 구조',
    icon: MessageSquareQuote,
    body: '질문에 바로 답하는 문장과 FAQ 구조화 데이터를 배치해 검색의 답변 영역이 발췌하기 좋은 형태로 만듭니다.',
    detail: 'FAQ · DIRECT ANSWER · JSON-LD',
  },
  {
    no: '03',
    name: 'GEO',
    label: '인용되는 구조',
    icon: Bot,
    body: '사업 주체·지역·서비스 정보를 텍스트와 구조화 데이터로 명확히 표현해 생성형 AI가 참고하기 쉬운 기반을 만듭니다.',
    detail: 'ENTITY · LOCAL SIGNAL · LLMS.TXT',
  },
];

const COMPARISON = [
  {
    label: '잘하는 일',
    builder: '쇼핑·예약 등 폭넓은 운영 도구',
    agency: '사람 중심의 맞춤 기획·디자인',
    anaks: '업종 홈페이지 최적화의 제품화',
  },
  {
    label: '시작 방식',
    builder: '템플릿·AI 결과를 직접 조립',
    agency: '상담 → 견적 → 제작',
    anaks: '질문 응답 → 구성 확인 → 디자인 3안',
  },
  {
    label: '검색·AI 구조',
    builder: '제공 기능과 가이드를 직접 설정',
    agency: '계약 범위와 업체 역량에 따라 적용',
    anaks: 'SEO·AEO·GEO가 생성 기본값',
  },
  {
    label: '오픈 후',
    builder: '사용자가 직접 운영',
    agency: '수정 요청 또는 별도 관리 계약',
    anaks: '직접 수정 무제한 무료 + 사이트 운영 구독',
  },
];

const PROCESS = [
  { no: '01', title: '업종을 이해', body: '목적·지역·톤·자료를 받아 필요한 페이지와 필수 섹션을 먼저 설계합니다.' },
  { no: '02', title: '구성을 승인', body: '비용이 드는 생성 전에 텍스트 와이어프레임으로 페이지 구성을 확인합니다.' },
  { no: '03', title: '3안을 생성', body: '업종과 레퍼런스를 반영한 디자인 후보 중 방향을 고르고 캔버스에서 다듬습니다.' },
  { no: '04', title: '최적화해 발행', body: '검색·답변·AI 인용 기반을 점검하고 SSL·멀티페이지 호스팅으로 발행합니다.' },
];

const CORE_FEATURES = [
  '업종별 페이지·섹션 설계',
  'AI 디자인 후보 3안',
  '자유배치 캔버스 에디터',
  'SEO·AEO·GEO 기본 구조',
  '멀티페이지 + SSL 호스팅',
  `편집 크레딧 ${INITIAL_GRANT.basic}개`,
];

const FAQS: FaqItem[] = [
  {
    q: '아임웹 같은 범용 웹 빌더와 무엇이 다른가요?',
    a: '범용 빌더는 쇼핑·예약을 포함한 폭넓은 도구를 직접 조합하는 데 강점이 있습니다. Daboim은 비개발자 사업자의 업종 홈페이지에 집중해, 페이지 기획과 SEO·AEO·GEO 구조를 생성 기본값으로 제공하고 호스팅과 사이트 운영 구독까지 한 제품으로 묶습니다.',
  },
  {
    q: 'SEO·AEO·GEO를 적용하면 검색 순위나 AI 인용이 보장되나요?',
    a: '아니요. 검색 순위와 AI 답변 인용은 외부 플랫폼의 판단이므로 보장할 수 없습니다. Daboim은 크롤러와 답변·생성형 AI가 사업 정보를 읽고 이해하기 쉬운 기술적 구조와 콘텐츠 기반을 제공합니다.',
  },
  {
    q: '완성된 홈페이지를 직접 수정할 수 있나요?',
    a: CREDIT_CONTRACT_COPY,
  },
  {
    q: 'AI 영상 홈페이지도 만들 수 있나요?',
    a: `기본 모션은 제작비에 포함되어 무료입니다. 실제 Veo 영상으로 만드는 AI 영상 히어로는 AI 영상 홈페이지 옵션으로 +${formatKrw(PRICING.videoHeroAddon)}에 추가할 수 있습니다.`,
  },
];

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Daboim AI 홈페이지 제작·호스팅',
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
    brand: { '@type': 'Brand', name: 'Daboim', alternateName: '다보임' },
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

      {/* 카테고리 선언 + 실제 무료 진단 + 제품 구조 시각화 */}
      <div className="relative overflow-hidden bg-[#F8FBFF]">
        <HeroVideo />
        <div className="relative z-10">
          <LandingScanner />
        </div>
        <div className="relative z-10 border-t border-[#DCE4F0] bg-white/55 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5 font-mono text-[9px] tracking-[0.13em] text-[#718096] sm:px-8 md:justify-between">
            {['SEMANTIC HTML', 'JSON-LD', 'LLMS.TXT', 'MULTI-PAGE SSR', 'SSL HOSTING', 'CANVAS EDITOR'].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[#03BFA9]" /> {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 실제 판매되는 데스크 scrub·모바일 loop 런타임을 기존 1080p 필름으로 비용 없이 시연 */}
      <LandingCinematicShowcase />

      {/* 범용 AI 제작이 아니라 홈페이지 전문 최적화 AI라는 카테고리 정의 */}
      <section className="overflow-hidden bg-[#F8FBFF]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
              <div>
                <p className="font-mono text-[10px] tracking-[0.16em] text-[#174DDA] uppercase">A NEW WEBSITE CATEGORY</p>
                <p className="mt-4 text-sm leading-6 text-[#666A73]">예쁜 화면 하나가 아니라<br />발견되는 사업 기반을 만듭니다.</p>
              </div>
              <h2 className="max-w-4xl text-3xl leading-[1.16] font-semibold tracking-[-0.045em] text-[#0B1736] sm:text-5xl lg:text-[3.5rem]">
                홈페이지 제작의 모든 결정을
                <br className="hidden sm:block" /> 사업자 대신 먼저 최적화합니다.
              </h2>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 세 최적화 엔진 */}
      <section className="border-y border-[#DCE4F0] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-[10px] tracking-[0.16em] text-[#174DDA] uppercase">ONE SITE · THREE ENGINES</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0B1736] sm:text-4xl">세 가지 발견 경로를 한 번에.</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#666A73]">기능을 나열하는 데서 끝나지 않고, 실제 발행 문서의 구조로 적용합니다. 순위나 인용을 보장하지는 않습니다.</p>
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
                    <span className="font-mono text-[10px] text-[#8A8E96]">ENGINE / {no}</span>
                  </div>
                  <div className="mt-12">
                    <p className="font-mono text-xs font-semibold tracking-[0.14em] text-[#174DDA]">{name}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-[#0B1736]">{label}</h3>
                    <p className="mt-4 text-sm leading-7 text-[#666A73]">{body}</p>
                  </div>
                  <p className="mt-auto border-t border-[#E4E6E0] pt-5 font-mono text-[9px] tracking-[0.1em] text-[#8A8E96]">{detail}</p>
                </article>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* 범용 빌더·대행사와의 공정한 비교 */}
      <section className="border-y border-[#DCE4F0] bg-[#EEF5FF] text-[#0B1736]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="font-mono text-[10px] tracking-[0.16em] text-[#08AFC5] uppercase">WHY DABOIM</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">빌더도, 일회성 외주도 아닌<br />관리형 홈페이지 제품.</h2>
              </div>
              <p className="max-w-lg text-sm leading-7 text-[#5F6B7C] lg:justify-self-end">범용 빌더와 제작대행은 각자의 강점이 있습니다. Daboim은 비개발자 사업자가 ‘최적화된 홈페이지를 계속 운영하는 일’에 집중합니다.</p>
            </div>
          </FadeIn>

          <FadeIn delay={0.08}>
            <div className="mt-12 overflow-x-auto rounded-[28px] border border-[#C8D8EC] bg-white shadow-[0_18px_55px_rgba(11,23,54,.06)]">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-[.62fr_1fr_1fr_1.12fr] border-b border-[#DCE4F0] bg-[#F8FBFF] text-sm">
                  <div className="p-5" />
                  <div className="p-5 font-medium text-[#667085]">범용 빌더 <span className="text-[#98A2B3]">(아임웹 등)</span></div>
                  <div className="p-5 font-medium text-[#667085]">웹 제작대행사</div>
                  <div className="border-l border-[#A8DDE2] bg-gradient-to-r from-[#EDF4FF] to-[#EAFBF7] p-5 font-semibold text-[#0B1736]">Daboim</div>
                </div>
                {COMPARISON.map((row) => (
                  <div key={row.label} className="grid grid-cols-[.62fr_1fr_1fr_1.12fr] border-b border-[#E4EAF2] text-sm last:border-b-0">
                    <div className="p-5 font-mono text-[10px] tracking-[0.1em] text-[#174DDA]">{row.label}</div>
                    <div className="p-5 leading-6 text-[#667085]">{row.builder}</div>
                    <div className="p-5 leading-6 text-[#667085]">{row.agency}</div>
                    <div className="border-l border-[#A8DDE2] bg-gradient-to-r from-[#EDF4FF] to-[#EAFBF7] p-5 leading-6 font-medium text-[#26354D]">{row.anaks}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 에이전시 품질을 제품 흐름으로 */}
      <section className="bg-[#F8FBFF]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-[10px] tracking-[0.16em] text-[#174DDA] uppercase">AGENCY FLOW · PRODUCT SPEED</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0B1736] sm:text-4xl">전문가의 제작 순서를<br />소프트웨어로 만들었습니다.</h2>
              </div>
              <Link href="/features" className="group inline-flex items-center gap-2 text-sm font-semibold text-[#174DDA]">
                전체 기능 보기 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </FadeIn>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PROCESS.map((step, i) => (
              <FadeIn key={step.no} delay={i * 0.06} className="h-full">
                <article className="h-full rounded-2xl border border-[#DCE4F0] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-[#174DDA]">STEP {step.no}</span>
                    {i === 0 ? <Layers3 className="h-4 w-4 text-[#8A8E96]" /> : i === 1 ? <Code2 className="h-4 w-4 text-[#8A8E96]" /> : i === 2 ? <Sparkles className="h-4 w-4 text-[#8A8E96]" /> : <ShieldCheck className="h-4 w-4 text-[#8A8E96]" />}
                  </div>
                  <h3 className="mt-10 text-lg font-semibold tracking-[-0.025em] text-[#0B1736]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#666A73]">{step.body}</p>
                </article>
              </FadeIn>
            ))}
          </div>

          <div className="mt-16 grid items-center gap-12 lg:grid-cols-[.88fr_1.12fr]">
            <FadeIn>
              <div>
                <p className="font-mono text-[10px] tracking-[0.16em] text-[#174DDA] uppercase">DIRECTABLE AI</p>
                <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0B1736]">AI가 시작하고,<br />사장님이 방향을 잡습니다.</h3>
                <p className="mt-5 max-w-lg text-sm leading-7 text-[#666A73]">결과를 그냥 받는 생성기가 아닙니다. 구성안을 승인하고, 세 가지 디자인에서 고르고, PPT처럼 직접 다듬습니다. 직접 수정은 무제한 무료이고 AI 재생성·다보임 수정 대행에만 크레딧을 사용합니다.</p>
                <ul className="mt-7 grid gap-3 text-sm text-[#41444C] sm:grid-cols-2">
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
      <section className="border-y border-[#DCE4F0] bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-2">
          <FadeIn>
            <div className="flex min-h-[340px] items-center justify-center rounded-[28px] border border-[#DCE4F0] bg-[#F8FBFF] p-10">
              <SiteExampleMockup className="scale-125 sm:scale-150" />
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <p className="font-mono text-[10px] tracking-[0.16em] text-[#174DDA] uppercase">NICHE-NATIVE DESIGN</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0B1736] sm:text-4xl">카페와 병원은<br />같은 홈페이지일 수 없습니다.</h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-[#666A73]">업종별로 손님이 찾는 정보, 필요한 페이지, 전환 버튼이 다릅니다. 목적에 맞는 설계 뼈대에서 시작하고 브랜드 톤과 레퍼런스로 인상을 구체화합니다.</p>
            <Link href="/cases" className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#174DDA]">업종별 구성 보기 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
          </FadeIn>
        </div>
      </section>

      {/* 단일 제품 가격 */}
      <section className="border-y border-[#DCE4F0] bg-[#F8FBFF]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
          <FadeIn>
            <p className="font-mono text-[10px] tracking-[0.16em] text-[#174DDA] uppercase">ONE PRODUCT · CLEAR PRICE</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0B1736] sm:text-4xl">만들고 끝내지 않고,<br />계속 좋아지게 관리합니다.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-[#666A73]">제작비 1회와 사이트 운영 구독으로 호스팅·운영을 이어갑니다. 실제 영상이 필요한 브랜드만 AI 영상 홈페이지를 선택하세요.</p>
          </FadeIn>
          <FadeIn delay={0.08}>
            <div className="rounded-[28px] border border-[#173060] bg-gradient-to-br from-[#0B1736] to-[#113E70] p-7 text-white shadow-[0_24px_70px_rgba(11,23,54,.18)] sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-[#5DE0D0]">WEBSITE + MANAGED HOSTING</p>
                  <h3 className="mt-3 text-xl font-semibold">홈페이지 제작 + 호스팅</h3>
                </div>
                <LaunchPrice tone="dark" align="right" />
              </div>
              <p className="mt-2 text-right text-xs text-white/48">+ 사이트 운영 구독 월 {formatKrw(PRICING.subscription.monthly)} · 부가세 별도</p>
              <ul className="mt-8 grid gap-3 border-t border-white/10 pt-7 text-sm text-white/68 sm:grid-cols-2">
                {CORE_FEATURES.map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#5DE0D0]" />{feature}</li>)}
              </ul>
              <div className="mt-7 flex flex-col justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.045] p-4 sm:flex-row sm:items-center">
                <p className="text-xs leading-5 text-white/52">AI 영상 홈페이지<br /><span className="text-white/78">실제 Veo 영상 히어로 · 선택</span></p>
                <span className="font-mono text-sm font-semibold text-[#5DE0D0]">+{formatKrw(PRICING.videoHeroAddon)}</span>
              </div>
              <Link href="/pricing" className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white">가격 자세히 보기 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* AEO용 실제 질문·답변 */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8 md:py-28">
          <FadeIn>
            <div className="text-center">
              <p className="font-mono text-[10px] tracking-[0.16em] text-[#174DDA] uppercase">DIRECT ANSWERS</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0B1736] sm:text-4xl">결정 전에 많이 묻는 질문</h2>
            </div>
            <div className="mt-12"><FaqList items={FAQS} /></div>
          </FadeIn>
        </div>
      </section>

      {/* 최종 CTA */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#174DDA] via-[#08AFC5] to-[#03BFA9] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,.2),transparent_30%),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
        <div className="relative mx-auto max-w-5xl px-5 py-20 text-center sm:px-8 md:py-28">
          <FadeIn>
            <p className="font-mono text-[10px] tracking-[0.16em] text-white/82 uppercase">START WITH A SIGNAL CHECK</p>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">이미 홈페이지가 있다면,<br />먼저 읽히는 상태부터 확인하세요.</h2>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/68">주소 하나면 SEO·AEO·GEO 관점의 비어 있는 신호를 확인할 수 있습니다. 가입 없이 무료입니다.</p>
            <Link href="#hero-scanner" className="group mt-8 inline-flex h-13 items-center gap-2 rounded-xl bg-[#0B1736] px-7 text-sm font-semibold text-white transition-transform hover:-translate-y-1">내 사이트 무료 진단 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
