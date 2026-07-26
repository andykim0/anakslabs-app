import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { SiteRenderer } from '@/components/site-renderer';
import { INDUSTRY_PROFILES, formatKrw } from '@/lib/pricing';
import { interiorLandingExampleConfig } from '@/lib/marketing/interior-landing';

const PROFILE = INDUSTRY_PROFILES.interior;

export const metadata: Metadata = {
  title: '인테리어 홈페이지 제작·성과 관리',
  description:
    `인테리어 회사의 소개·사업분야·실적 구조를 먼저 만들어 보여드립니다. 발행할 때 월 ${formatKrw(PROFILE.monthlyKrw)}으로 시작하며 별도 제작비는 없습니다.`,
  alternates: { canonical: '/interior' },
};

export default async function InteriorPage() {
  const example = await interiorLandingExampleConfig();

  return (
    <article className="overflow-hidden bg-[#F4F1EB] text-[#18201E]">
      <section className="relative isolate overflow-hidden px-5 pt-16 pb-20 sm:px-8 md:pt-24 md:pb-28">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(145deg,#EEE7DC_0%,#F7F4EF_48%,#DCE7E2_100%)]"
        />
        <div className="mx-auto grid max-w-7xl items-end gap-12 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <p className="mkt-type-eyebrow font-semibold tracking-[0.14em] text-[#5A735F] uppercase">
              Interior website · monthly care
            </p>
            <h1 className="mkt-type-page-title mt-5 max-w-4xl font-semibold tracking-[-0.055em] break-keep">
              완성된 공간만큼,
              <br />그 과정을 보여주는 홈페이지도 중요합니다.
            </h1>
            <p className="mkt-type-body mt-6 max-w-2xl text-[#53605B] break-keep">
              회사소개·사업분야·실적을 깊이 읽히는 구조로 만들고, 문의 행동과 검색 상태를 매달 함께 확인합니다.
              먼저 결과를 보고 발행을 결정하세요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/onboarding"
                className="mkt-type-control inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-xl bg-[#1C3A31] px-6 font-semibold text-white"
              >
                내 홈페이지 먼저 보기
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="#interior-example"
                className="mkt-type-control inline-flex h-12 items-center whitespace-nowrap rounded-xl border border-[#B7C3BC] bg-white/70 px-6 font-semibold text-[#243B34]"
              >
                구성 예시 보기
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/72 p-6 shadow-[0_24px_70px_rgba(31,51,44,.12)] backdrop-blur-sm sm:p-8">
            <p className="mkt-type-eyebrow font-semibold tracking-[0.12em] text-[#5A735F] uppercase">
              발행 후 매월
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              월 {formatKrw(PROFILE.monthlyKrw)}
            </p>
            <p className="mkt-type-support mt-2 text-[#66736E]">부가세 포함 · 홈페이지 1개 · 자동 갱신</p>
            <p className="mkt-type-body mt-5 text-[#46534E]">
              별도 제작비 없이 홈페이지 제작, 상담 연결, 문의 행동 추적, 월간 리포트와 운영이 포함됩니다.
            </p>
            <p className="mkt-type-support mt-4 font-medium text-[#315C4D]">
              연납 {formatKrw(PROFILE.annualKrw)} · 2개월분 면제
            </p>
          </div>
        </div>
      </section>

      <section id="interior-example" className="px-5 py-16 sm:px-8 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-end gap-7 md:grid-cols-[1fr_.72fr]">
            <div>
              <p className="mkt-type-eyebrow font-semibold tracking-[0.12em] text-[#5A735F] uppercase">
                Zero-cost generator example
              </p>
              <h2 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.045em] break-keep">
                인테리어 업종의 긴 호흡을
                <br />실제 생성 구조로 보여드립니다.
              </h2>
            </div>
            <p className="mkt-type-body text-[#5A6762] break-keep">
              아래 화면은 외부 유료 생성 없이 다보임의 레이아웃·절차적 배경·모션 시스템으로 만든 가상 예시입니다.
              실제 고객이나 프로젝트가 아닙니다.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-[28px] border border-[#CAD3CE] bg-[#111A17] shadow-[0_30px_90px_rgba(24,39,34,.18)]">
            <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-[#E9A39A]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#E5C878]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#8BC3A2]" />
              <span className="mkt-type-support ml-3 text-white/54">예시 · 실제 고객이 아닙니다</span>
            </div>
            <div
              data-interior-zero-cost-example
              className="pointer-events-none h-[720px] overflow-hidden bg-white sm:h-[820px]"
              aria-label="인테리어 홈페이지 생성 예시"
            >
              <SiteRenderer
                config={example}
                pageSlug=""
                tier="basic"
                interactive={false}
                animate
                runtimeDelivery="client"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#17241F] px-5 py-16 text-white sm:px-8 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <ShieldCheck className="h-9 w-9 text-[#9FCDB8]" aria-hidden />
            <h2 className="mkt-type-section-title mt-5 font-semibold tracking-[-0.045em] break-keep">
              AI로 원가를 줄이고,
              <br />품질은 직접 검수합니다.
            </h2>
            <p className="mkt-type-body mt-5 max-w-xl text-white/68 break-keep">
              자동화는 반복 작업을 줄이는 데 쓰고, 공개 전 화면과 문구는 사람이 확인합니다.
              검색 순위나 문의 결과를 약속하지 않고, 실제 행동은 매달 숫자로 보여드립니다.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PROFILE.included.map((item) => (
              <div key={item.id} className="flex gap-3 border-t border-white/14 py-4">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#9FCDB8]" aria-hidden />
                <span className="mkt-type-body text-white/82">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 text-center sm:px-8 md:py-28">
        <p className="mkt-type-eyebrow font-semibold tracking-[0.12em] text-[#5A735F] uppercase">
          See it before publishing
        </p>
        <h2 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.045em] break-keep">
          우리 회사 내용으로 먼저 확인하세요.
        </h2>
        <p className="mkt-type-body mx-auto mt-4 max-w-xl text-[#5A6762]">
          만드는 동안에는 결제하지 않습니다. 완성된 결과를 확인하고 발행할 때 월 이용을 시작합니다.
        </p>
        <Link
          href="/onboarding"
          className="mkt-type-control mt-8 inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-xl bg-[#1C3A31] px-7 font-semibold text-white"
        >
          인테리어 홈페이지 먼저 보기
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </article>
  );
}
