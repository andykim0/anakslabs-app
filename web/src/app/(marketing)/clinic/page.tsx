import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { clinicAvailability } from '@/lib/industry/clinic-availability';
import { INDUSTRY_PROFILES, formatKrw } from '@/lib/pricing';

const PROFILE = INDUSTRY_PROFILES.interior;

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  if (!clinicAvailability().available) {
    return { robots: { index: false, follow: false } };
  }
  return {
    title: '의원·클리닉 홈페이지 제작·운영',
    description:
      `진료 안내와 예약 동선을 정리하고 공개 전 문구를 검사합니다. 제작비 ${formatKrw(PROFILE.setupPromotionalKrw)}, 유지비 월 ${formatKrw(PROFILE.monthlyKrw)}입니다.`,
    alternates: { canonical: '/clinic' },
  };
}

export default function ClinicPage() {
  if (!clinicAvailability().available) notFound();

  return (
    <article className="overflow-hidden bg-[#F4F7F8] text-[#15232A]">
      <section className="relative isolate overflow-hidden px-5 pt-16 pb-20 sm:px-8 md:pt-24 md:pb-28">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(145deg,#E9F1F2_0%,#F8FAFA_50%,#E6EEEA_100%)]"
        />
        <div className="mx-auto grid max-w-7xl items-end gap-12 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <p className="mkt-type-eyebrow font-semibold tracking-[0.14em] text-[#496D70] uppercase">
              Clinic website · monthly care
            </p>
            <h1 className="mkt-type-page-title mt-5 max-w-4xl font-semibold tracking-[-0.055em] break-keep">
              필요한 진료 정보를
              <br />찾기 쉬운 순서로 정리합니다.
            </h1>
            <p className="mkt-type-body mt-6 max-w-2xl text-[#53656A] break-keep">
              진료 범위·의료진·예약·오시는 길을 한 흐름으로 구성하고, 공개 전 의료광고 문구를 현재 정책으로 다시 확인합니다.
              먼저 완성된 구조를 확인하고 발행을 결정하세요.
            </p>
            <Link
              href="/onboarding"
              className="mkt-type-control mt-8 inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-xl bg-[#173D43] px-6 font-semibold text-white"
            >
              의원 홈페이지 먼저 보기
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/78 p-6 shadow-[0_24px_70px_rgba(28,54,58,.11)] backdrop-blur-sm sm:p-8">
            <p className="mkt-type-eyebrow font-semibold tracking-[0.12em] text-[#496D70] uppercase">
              제작비 · 기간한정
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              {formatKrw(PROFILE.setupPromotionalKrw)}
            </p>
            <p className="mkt-type-support mt-2 text-[#657579]">정가 {formatKrw(PROFILE.setupListKrw)} · {PROFILE.promotionEndsOn}까지</p>
            <p className="mkt-type-body mt-5 text-[#43575B]">
              홈페이지 제작과 승인한 영상 히어로 1회 생성이 포함됩니다. 유지비는 월 {formatKrw(PROFILE.monthlyKrw)}입니다.
            </p>
            <p className="mkt-type-support mt-4 font-medium text-[#315F62]">
              부가세 포함 · 홈페이지 1개
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#173239] px-5 py-16 text-white sm:px-8 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <ShieldCheck className="h-9 w-9 text-[#9CCFD0]" aria-hidden />
            <h2 className="mkt-type-section-title mt-5 font-semibold tracking-[-0.045em] break-keep">
              문구는 만들 때 한 번,
              <br />공개할 때 다시 확인합니다.
            </h2>
            <p className="mkt-type-body mt-5 max-w-xl text-white/68 break-keep">
              고객이 입력한 표현은 임의로 바꾸지 않고 확인이 필요한 위치와 수정 방향을 알려드립니다.
              공개 경계에서는 현재 초안 전체를 다시 검사합니다.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PROFILE.included.map((item) => (
              <div key={item.id} className="flex gap-3 border-t border-white/14 py-4">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#9CCFD0]" aria-hidden />
                <span className="mkt-type-body text-white/82">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
