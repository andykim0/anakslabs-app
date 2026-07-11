import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PRICE_RANGES } from '@/lib/credits/constants';
import { LandingScanner } from '@/components/landing/LandingScanner';
import { ScannerCta } from '@/components/marketing/ui';
import { Aurora } from '@/components/motion/Aurora';
import { FadeIn } from '@/components/motion/FadeIn';

export const metadata: Metadata = {
  title: '검색과 AI가 찾아오는 홈페이지, 처음부터 그렇게 짓습니다',
  description:
    '무료 SEO·AEO·GEO 진단 후, 검색·AI가 읽을 수 있는 사이트로 다시 짓기. AI가 설계하고 캔버스에서 다듬어 즉시 호스팅 — 아낙스랩스.',
};

function man(krw: number): string {
  return `${Math.round(krw / 10_000)}만원`;
}

/**
 * [마케팅] 메인 랜딩 — 진단기(#scanner)로 수렴하는 CTA 퍼널.
 * 히어로→문제공감→후킹(+CTA)→진단기→기능요약→가격요약→마지막 CTA.
 * 히어로 h1·첫 CTA는 즉시 표시(LCP 보호), 이하 섹션은 FadeIn 스크롤 리빌.
 */
export default function MarketingHome() {
  return (
    <>
      {/* 1) 히어로 — Aurora 배경, h1/CTA 즉시 표시 */}
      <section className="relative overflow-hidden">
        <Aurora />
        <div className="mx-auto max-w-5xl px-6 pt-20 pb-16 text-center sm:pt-28">
          <p className="text-xs font-semibold tracking-[0.3em] text-[#856A26] uppercase">
            SEO · AEO · GEO Ready
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-3xl leading-tight font-semibold tracking-tight text-[#17181C] sm:text-5xl sm:leading-[1.15]">
            검색과 AI가 찾아오는 사이트,
            <br />
            AI가 처음부터 그렇게 짓습니다
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-[#5C6068] sm:text-base">
            예쁘기만 한 사이트가 아니라, 검색엔진과 생성형 AI가 읽고 인용할 수 있게 태어난 사이트.
            먼저 내 가게가 지금 어떤 상태인지 무료로 확인해 보세요.
          </p>
          <div className="mt-9 flex justify-center">
            <ScannerCta href="#scanner">내 가게 무료 진단받기</ScannerCta>
          </div>
        </div>
      </section>

      {/* 2) 문제 공감 — 버튼 없음 */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <FadeIn>
            <h2 className="text-center text-xl font-semibold tracking-tight text-[#17181C] sm:text-2xl">
              검색에 안 나오는 가게는,
              <br className="sm:hidden" /> 손님에게 없는 가게입니다
            </h2>
            <div className="mt-8 space-y-5 text-sm leading-7 text-[#5C6068]">
              <p>
                손님은 이제 가게 이름을 외워서 찾지 않습니다. &ldquo;근처 맛집&rdquo;, &ldquo;이 동네 치과&rdquo;를 검색하고,
                점점 더 자주 AI에게 &ldquo;여기 괜찮은 곳 추천해줘&rdquo;라고 묻습니다.
              </p>
              <p>
                그 순간 내 가게가 검색과 AI의 답변에 등장하지 못하면, 아무리 실력이 좋아도 후보에조차 오르지 못합니다.
                멀쩡한 홈페이지가 있어도 검색엔진이 &ldquo;읽을 수 없는&rdquo; 구조라면 결과는 같습니다.
              </p>
              <p className="text-[#696E76]">문제는 디자인이 아니라, 처음부터 읽히도록 지어졌는가입니다.</p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 3) 후킹 + 두 번째 CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <FadeIn>
          <h2 className="text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">
            만들 거라면, 처음부터
            <br />
            검색·AI가 읽게 지어야 합니다
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#5C6068]">
            아낙스랩스는 제목·구조화 데이터(JSON-LD)·시맨틱 마크업·사업자 정보를 처음부터 갖춘 상태로 사이트를
            발행합니다. 검색(SEO)·답변 상자(AEO)·생성형 AI 인용(GEO) 세 관점을 기본값으로 깔아둡니다.
          </p>
          <div className="mt-8 flex justify-center">
            <ScannerCta href="#scanner">무료 진단</ScannerCta>
          </div>
        </FadeIn>
      </section>

      {/* 4) 진단기 — 모든 CTA의 종착지 */}
      <section id="scanner" className="scroll-mt-20 border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-[#17181C]">무료 진단</h2>
            <p className="mt-2 text-sm text-[#5C6068]">
              사이트 주소를 넣으면 SEO·AEO·GEO 관점의 현재 상태를 점수로 보여드립니다.
            </p>
          </div>
          <LandingScanner />
        </div>
      </section>

      {/* 5) 기능 요약 → /features */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <FadeIn>
          <h2 className="text-center text-2xl font-semibold tracking-tight text-[#17181C]">
            설문 한 번이면, 나머지는 자동입니다
          </h2>
        </FadeIn>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { no: '01', title: '설문 · AI 생성', body: '목적·업종을 고르면 디자인 3안이 자동 생성됩니다.' },
            { no: '02', title: '캔버스 편집', body: 'PPT처럼 끌어서 다듬습니다. 코드·디자인 지식 불필요.' },
            { no: '03', title: '즉시 호스팅', body: '버튼 하나로 서브도메인·SSL까지 라이브.' },
          ].map((s, i) => (
            <FadeIn key={s.no} delay={i * 0.08} className="h-full">
              <div className="h-full rounded-2xl border border-[#E8E6E0] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p className="text-xs font-semibold tracking-widest text-[#856A26]">{s.no}</p>
                <h3 className="mt-3 text-base font-semibold text-[#17181C]">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5C6068]">{s.body}</p>
              </div>
            </FadeIn>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/features"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-[#856A26] transition-colors hover:text-[#17181C]"
          >
            기능 전체 보기
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* 6) 가격 요약 → /pricing */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <FadeIn>
            <h2 className="text-center text-2xl font-semibold tracking-tight text-[#17181C]">
              제작비 1회 + 월 유지보수
            </h2>
            <p className="mt-2 text-center text-sm text-[#5C6068]">숨은 비용 없음. 두 요금제.</p>
          </FadeIn>
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
            <FadeIn delay={0} className="h-full">
              <div className="h-full rounded-2xl border border-[#E8E6E0] bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-transform duration-200 hover:-translate-y-1">
                <h3 className="text-sm font-semibold tracking-widest text-[#5C6068] uppercase">Basic</h3>
                <p className="mt-4 text-3xl font-semibold text-[#17181C]">
                  {man(PRICE_RANGES.buildFee.basic[0])}
                  <span className="text-base font-normal text-[#696E76]">부터</span>
                </p>
                <p className="mt-1 text-xs text-[#5C6068]">이미지 중심 정적 사이트 · 편집 크레딧 1개</p>
              </div>
            </FadeIn>
            <FadeIn delay={0.08} className="h-full">
              <div className="h-full rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-transform duration-200 hover:-translate-y-1">
                <h3 className="text-sm font-semibold tracking-widest text-[#856A26] uppercase">Premium</h3>
                <p className="mt-4 text-3xl font-semibold text-[#17181C]">
                  {man(PRICE_RANGES.buildFee.premium[0])}
                  <span className="text-base font-normal text-[#696E76]">부터</span>
                </p>
                <p className="mt-1 text-xs text-[#5C6068]">
                  영상·스크롤 모션·폼 등 동적 기능 · 편집 크레딧 3개
                </p>
              </div>
            </FadeIn>
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-[#856A26] transition-colors hover:text-[#17181C]"
            >
              가격 자세히 보기
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* 7) 마지막 CTA 밴드 */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <FadeIn>
          <h2 className="text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">
            지금 내 가게는 검색·AI에 어떻게 보일까요?
          </h2>
          <p className="mt-3 text-sm text-[#5C6068]">1분이면 확인합니다. 가입 없이 무료.</p>
          <div className="mt-8 flex justify-center">
            <ScannerCta href="#scanner">내 가게 무료 진단받기</ScannerCta>
          </div>
        </FadeIn>
      </section>
    </>
  );
}
