import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import {
  GUARANTEE_CRITERIA_COPY,
  GUARANTEE_MARKETING_COPY,
  GUARANTEE_NAVER_REFERRAL_THRESHOLD,
  GUARANTEE_WINDOW_DAYS,
} from '@/lib/guarantee';

export const metadata: Metadata = {
  title: '90일 성과 보장 조건',
  description: '발행 후 90일 네이버 색인과 유입 집계로 판정하는 다보임 제작비 환불 보장 조건과 신청 절차입니다.',
  alternates: { canonical: '/guarantee' },
};

const STEPS = [
  '발행일로부터 90일이 지난 뒤 대시보드 또는 고객센터에서 보장 판정을 요청합니다.',
  '다보임이 네이버 색인 신호와 발행 후 90일간의 네이버 유입 누적 건수를 확인합니다.',
  '두 기준이 모두 미달이고 예외 사유가 없으면 결제한 기본 제작비의 환불 절차를 안내합니다.',
] as const;

export default function GuaranteePage() {
  return (
    <div className="bg-[#F8FBFF] text-[#0B1736]">
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8 md:py-24">
        <div className="rounded-[32px] border border-[#C8D8EC] bg-white p-7 shadow-[0_24px_70px_rgba(11,23,54,.08)] sm:p-10">
          <p className="mkt-type-eyebrow inline-flex items-center gap-2 font-mono tracking-[0.14em] text-[#03A995]">
            <ShieldCheck className="h-4 w-4" aria-hidden /> 90일 성과 보장
          </p>
          <h1 className="mkt-type-page-title mt-5 max-w-3xl font-semibold tracking-[-0.05em] break-keep">
            {GUARANTEE_MARKETING_COPY}
          </h1>
          <p className="mkt-type-body mt-6 max-w-3xl text-[#526174] break-keep">{GUARANTEE_CRITERIA_COPY}</p>

          <div role="status" className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">시행 전 법무 검토 필요</p>
              <p className="mkt-type-support mt-1 leading-6">
                전자상거래법상 보증·환불 조건과 절차 표시, 표시광고법상 조건의 명확성을 최종 검토한 뒤 시행합니다.
                검토 완료 전에는 이 페이지가 계약 체결 또는 자동 환불 승인을 뜻하지 않습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-6 px-5 pb-16 sm:px-8 md:grid-cols-2 md:pb-24">
        <article className="rounded-3xl border border-[#DCE4F0] bg-white p-7">
          <h2 className="mkt-type-card-title font-semibold">판정 기준</h2>
          <ul className="mkt-type-body mt-5 space-y-4 text-[#526174]">
            <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#03A995]" />발행 후 정확히 {GUARANTEE_WINDOW_DAYS}일이 지난 시점에 판정합니다.</li>
            <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#03A995]" />네이버 서치어드바이저 색인 리포트 또는 URL 확인에서 색인 신호가 없어야 합니다.</li>
            <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#03A995]" />다보임 비콘의 네이버 유입 pageview가 누적 {GUARANTEE_NAVER_REFERRAL_THRESHOLD}회 미만이어야 합니다.</li>
          </ul>
          <p className="mkt-type-support mt-5 rounded-xl bg-[#F1F6FC] p-4 text-[#5F6B7C]">
            두 조건이 모두 미달일 때만 대상입니다. 유입 건수는 방문자를 식별하지 않는 날짜별 합계이며, 같은 사람의 반복 방문이 포함될 수 있습니다. 검색 순위는 조회하거나 보장하지 않습니다.
          </p>
        </article>

        <article className="rounded-3xl border border-[#DCE4F0] bg-white p-7">
          <h2 className="mkt-type-card-title font-semibold">제외 조건</h2>
          <ul className="mkt-type-body mt-5 list-disc space-y-3 pl-5 text-[#526174]">
            <li>사장님이 사이트를 비공개 또는 정지 상태로 바꾼 기간</li>
            <li>도메인 해지·만료·DNS 변경으로 사이트에 접속할 수 없었던 기간</li>
            <li>검색에 필요한 페이지나 핵심 콘텐츠를 삭제한 경우</li>
            <li>검색 서비스 장애, 재난, 법령·정책 변경 등 합리적으로 통제하기 어려운 사유</li>
          </ul>
          <p className="mkt-type-support mt-5 text-[#5F6B7C]">
            예외는 사유 코드와 확인 시각만 기록하며, 감이나 추정만으로 제외하지 않습니다.
          </p>
        </article>
      </section>

      <section className="border-y border-[#DCE4F0] bg-white">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 md:py-20">
          <h2 className="mkt-type-section-title font-semibold tracking-[-0.04em]">환불 신청 절차</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step} className="rounded-2xl border border-[#DCE4F0] bg-[#F8FBFF] p-5">
                <span className="font-mono text-sm font-semibold text-[#174DDA]">0{index + 1}</span>
                <p className="mkt-type-body mt-3 text-[#526174]">{step}</p>
              </li>
            ))}
          </ol>
          <p className="mkt-type-support mt-6 text-[#5F6B7C]">
            환불 금액·지급 수단·처리 기한은 법무 검토와 결제수단별 절차를 확정한 뒤 결제 전 약관에 동일하게 표시합니다.
          </p>
          <Link href="/pricing" className="mkt-type-control mt-8 inline-flex items-center gap-2 font-semibold text-[#174DDA]">
            제작 비용 보기 <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
