import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import {
  HOSTING_ONLY_FOOTNOTE,
  OWNERSHIP_SUMMARY,
  REFUND_NOTICE,
} from '@/lib/legal/notices';
import { FaqList, faqJsonLd, type FaqItem } from '@/components/marketing/Faq';
import { ScannerCta, SectionHeading } from '@/components/marketing/ui';
import { PricingMotionComparison } from '@/components/marketing/PricingMotionComparison';
import { PublishPrice } from '@/components/marketing/PublishPrice';
import {
  formatKrw,
  KO_BASIC_PROMOTION_END_DATE,
  PRICING,
  PUBLISH_PAYMENT_COPY,
  SITE_PRICE_UNIT_COPY,
  SUBSCRIPTION_BENEFIT_COPY,
} from '@/lib/pricing';
import { VIDEO_FULFILLMENT_COPY } from '@/lib/fulfillment-sla';

export const metadata: Metadata = {
  title: '홈페이지 제작비·유지비 — 다보임 베이직',
  description:
    `홈페이지 제작비 정가 ${formatKrw(PRICING.build.listAmountKrw)}, ${KO_BASIC_PROMOTION_END_DATE}까지 ${formatKrw(PRICING.build.promotionalAmountKrw)}. 유지비는 월 ${formatKrw(PRICING.subscription.amountKrw)}입니다.`,
  alternates: { canonical: '/pricing' },
};

const PRICING_FAQ: FaqItem[] = [
  {
    q: '언제 결제하나요?',
    a: `${PUBLISH_PAYMENT_COPY.lead} ${PUBLISH_PAYMENT_COPY.term} 기준이며 ${PUBLISH_PAYMENT_COPY.vat}입니다.`,
  },
  {
    q: '기간한정 제작비는 언제까지인가요?',
    a: `${KO_BASIC_PROMOTION_END_DATE}까지 제작비 ${formatKrw(PRICING.build.promotionalAmountKrw)}이 적용됩니다. 이후에는 정가 ${formatKrw(PRICING.build.listAmountKrw)}이 적용됩니다.`,
  },
  {
    q: '월 유지비에는 무엇이 포함되나요?',
    a: `${SUBSCRIPTION_BENEFIT_COPY.operations}와 ${SUBSCRIPTION_BENEFIT_COPY.selfEdit}가 포함됩니다.`,
  },
  {
    q: '영상 히어로는 별도 옵션인가요?',
    a: `아닙니다. ${PUBLISH_PAYMENT_COPY.videoIncluded}입니다. 설문 뒤 보여드리는 디자인 후보에는 영상을 생성하지 않고 기본 움직임으로 보여드리며, 한 디자인을 승인한 뒤에만 1회 생성합니다. ${VIDEO_FULFILLMENT_COPY}`,
  },
  {
    q: '자동 갱신과 해지는 어떻게 되나요?',
    a: `${PUBLISH_PAYMENT_COPY.renewal} 방식입니다. 해지 시점과 환불 조건은 실제 결제 기능을 열기 전 법률 검토를 거쳐 결제 화면과 약관에 같은 문구로 안내합니다. 현재는 실제 결제가 진행되지 않습니다.`,
  },
  {
    q: '해지하면 사이트는 어떻게 되나요?',
    a: OWNERSHIP_SUMMARY + ' 해지 시에는 정적 HTML 백업을 제공합니다.',
  },
  {
    q: '환불 규정은 어떻게 되나요?',
    a: REFUND_NOTICE,
  },
];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(PRICING_FAQ)) }}
      />

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
        <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#174DDA]">베이직 · 홈페이지 1개</p>
        <h1 className="mkt-type-page-title mt-3 font-semibold tracking-tight text-[#17181C]">
          홈페이지 제작비와 유지비
        </h1>
        <p className="mkt-type-body mx-auto mt-4 max-w-xl text-[#5C6068]">
          완성된 결과를 확인한 뒤 발행을 결정합니다. 별도 마케팅 상품이나 추가 사용량 상품 없이 제작과 유지 범위를 또렷하게 나눴습니다.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-12">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-7 sm:p-9">
          <PublishPrice />
          <p className="mkt-type-support mt-3 text-[#5C6068]">
            {PUBLISH_PAYMENT_COPY.vat} · <span data-site-price-unit>{SITE_PRICE_UNIT_COPY}</span>
          </p>
          <ul className="mkt-type-body mt-7 grid gap-3 text-[#5C6068] sm:grid-cols-2">
            {PRICING.profiles.interior.included.map((feature) => (
              <li key={feature.id} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#856A26]" />
                {feature.label}
              </li>
            ))}
          </ul>
          <div className="mt-7 rounded-xl border border-[#D9E3F5] bg-white p-5">
            <PricingMotionComparison />
          </div>
        </div>
      </section>

      <section className="border-y border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto grid max-w-3xl gap-6 px-6 py-16 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26]">제작</p>
            <h2 className="mkt-type-card-title mt-2 font-semibold text-[#17181C]">승인한 디자인을 완성</h2>
            <p className="mkt-type-body mt-3 text-[#5C6068]">
              페이지 구성과 디자인 후보를 먼저 확인합니다. 영상 히어로는 데모마다 만들지 않고 최종 디자인 승인 뒤 1회 생성합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26]">유지</p>
            <h2 className="mkt-type-card-title mt-2 font-semibold text-[#17181C]">
              {formatKrw(PRICING.subscription.amountKrw)}/월
            </h2>
            <p className="mkt-type-body mt-3 text-[#5C6068]">
              {SUBSCRIPTION_BENEFIT_COPY.operations}와 {SUBSCRIPTION_BENEFIT_COPY.selfEdit}가 포함됩니다.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="mkt-type-section-title text-center font-semibold tracking-tight text-[#17181C]">
          해지·소유권·환불
        </h2>
        <div className="mkt-type-body mt-8 space-y-4 text-[#5C6068]">
          <p>{OWNERSHIP_SUMMARY}</p>
          <p>{REFUND_NOTICE}</p>
          <p>자동 갱신 해지·환불 조건은 결제 기능 오픈 전 법률 검토 후 결제 화면과 약관에 동일하게 고지합니다.</p>
          <p className="mkt-type-support text-[#696E76]">{HOSTING_ONLY_FOOTNOTE}</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading title="가격 관련 자주 묻는 질문" />
        <div className="mt-10"><FaqList items={PRICING_FAQ} /></div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 text-center">
        <p className="mkt-type-body text-[#5C6068]">먼저 내 가게가 지금 어떤 상태인지 무료로 확인해 보세요.</p>
        <div className="mt-6 flex justify-center">
          <ScannerCta href="/#hero-scanner">무료 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}
