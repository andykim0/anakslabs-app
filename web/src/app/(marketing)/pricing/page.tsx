import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import {
  CREDIT_EXPIRY_DAYS,
  CREDIT_PACKS,
} from '@/lib/credits/constants';
import {
  HOSTING_ONLY_FOOTNOTE,
  OWNERSHIP_SUMMARY,
  REFUND_NOTICE,
} from '@/lib/legal/notices';
import { FaqList, faqJsonLd, type FaqItem } from '@/components/marketing/Faq';
import { ScannerCta, SectionHeading } from '@/components/marketing/ui';
import { PricingMotionComparison } from '@/components/marketing/PricingMotionComparison';
import { PublishPrice } from '@/components/marketing/PublishPrice';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import {
  CREDIT_CONSUMING_ACTION_LABELS,
  CREDIT_CONSUMING_ACTIONS,
  formatKrw,
  INCLUDED_ZERO_COST_ASSET_COPY,
  PRICING,
  PUBLISH_PAYMENT_COPY,
  RETAINER_COMPLEMENT_COPY,
  RETAINER_SCOPE_COPY,
  SITE_PRICE_UNIT_COPY,
  SUBSCRIPTION_BENEFIT_COPY,
  SUBSCRIPTION_VALUE_COPY,
} from '@/lib/pricing';
import { CREDIT_CONTRACT_COPY } from '@/lib/credits/contract-copy';
import { VIDEO_FULFILLMENT_COPY } from '@/lib/fulfillment-sla';

export const metadata: Metadata = {
  title: '홈페이지 성과 관리 이용료 — 결과를 보고 발행할 때 시작',
  description:
    `완성된 홈페이지를 먼저 확인하고 발행할 때 월 ${formatKrw(PRICING.subscription.amountKrw)} 구독을 시작합니다. 검색·AI 노출 최적화, 전환 리포팅, 호스팅과 월 ${PRICING.subscription.creditsPerMonth}크레딧이 포함됩니다.`,
  alternates: { canonical: '/pricing' },
};

const won = (n: number) => n.toLocaleString('ko-KR');

const PRICING_FAQ: FaqItem[] = [
  {
    q: '언제 결제하나요?',
    a: `${PUBLISH_PAYMENT_COPY.lead} 만드는 동안에는 결제가 없고, 완성된 결과를 확인한 뒤 발행할 때 월 구독 ${formatKrw(PRICING.subscription.amountKrw)}를 시작합니다. ${PUBLISH_PAYMENT_COPY.term}이며 ${PUBLISH_PAYMENT_COPY.noBuildFee}입니다.`,
  },
  {
    q: '월 이용료에는 무엇이 포함되나요?',
    a: `${SUBSCRIPTION_BENEFIT_COPY.operations}, ${SUBSCRIPTION_BENEFIT_COPY.report}, ${SUBSCRIPTION_BENEFIT_COPY.credits}이 포함됩니다. ${SUBSCRIPTION_VALUE_COPY} ${INCLUDED_ZERO_COST_ASSET_COPY}`,
  },
  {
    q: '무제한 수정과 크레딧은 뭐가 다른가요?',
    a: CREDIT_CONTRACT_COPY,
  },
  {
    q: 'AI 영상 홈페이지는 무엇인가요?',
    a: `기본 모션은 모든 홈페이지에 포함되어 무료입니다. ${PUBLIC_BRAND_NAMES.ai}가 만드는 시네마틱 영상 히어로는 원하는 분만 +${formatKrw(PRICING.videoHeroAddon)}에 추가합니다. ${VIDEO_FULFILLMENT_COPY} 완성 후 AI 영상 재생성에는 크레딧을 사용합니다.`,
  },
  {
    q: '자동 갱신과 해지는 어떻게 되나요?',
    a: `${PUBLISH_PAYMENT_COPY.renewal} 방식이며, ${PUBLISH_PAYMENT_COPY.annualOption} 선택지도 있습니다. 해지 시점과 환불 조건은 실제 결제 기능을 열기 전 법률 검토를 거쳐 결제 화면과 약관에 같은 문구로 명확히 안내합니다. 현재는 실제 결제가 진행되지 않습니다.`,
  },
  {
    q: '해지하면 사이트는 어떻게 되나요?',
    a: OWNERSHIP_SUMMARY + ' 해지 시에는 정적 HTML 백업을 제공합니다.',
  },
  {
    q: '환불 규정은 어떻게 되나요?',
    a: REFUND_NOTICE,
  },
  {
    q: '크레딧에 유효기간이 있나요?',
    a: `구매한 크레딧은 ${CREDIT_EXPIRY_DAYS.purchase}일, 구독으로 매월 지급되는 크레딧은 ${CREDIT_EXPIRY_DAYS.subscription_grant}일간 유효합니다. 소진은 만료가 임박한 것부터 자동 차감됩니다.`,
  },
];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(PRICING_FAQ)) }}
      />

      {/* 헤더 */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
        <h1 className="mkt-type-page-title font-semibold tracking-tight text-[#17181C]">
          검색·전환 성과 관리 이용료
        </h1>
        <p className="mkt-type-body mx-auto mt-4 max-w-xl text-[#5C6068]">
          {PUBLISH_PAYMENT_COPY.lead} 월 이용료에는 검색·AI 노출 관리와 전환 확인, 호스팅이 함께 들어갑니다.
        </p>
      </section>

      {/* 비용 구조 다이어그램 */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26]">먼저 확인</p>
            <h3 className="mkt-type-card-title mt-2 font-semibold text-[#17181C]">완성된 결과</h3>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              업종에 맞는 구성과 디자인 3안을 먼저 만들고 보여드립니다. 발행 전에는 결제하지 않습니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26]">발행할 때</p>
            <h3 className="mkt-type-card-title mt-2 font-semibold text-[#17181C]">월 성과 관리 시작</h3>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              {PUBLISH_PAYMENT_COPY.term}. {SUBSCRIPTION_BENEFIT_COPY.report}, {SUBSCRIPTION_BENEFIT_COPY.credits}, {SUBSCRIPTION_BENEFIT_COPY.operations}을 한 번에 제공합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26]">필요할 때만</p>
            <h3 className="mkt-type-card-title mt-2 font-semibold text-[#17181C]">AI·대행 크레딧</h3>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              AI로 다시 만들거나 다보임에 수정을 맡길 때만 사용합니다. 직접 수정은 무료입니다.
            </p>
          </div>
        </div>
      </section>

      {/* 공개 단일가는 pricing.ts의 업종 계약만 소비한다. */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className="mx-auto max-w-3xl">
          <div
            data-industry-profile={PRICING.profiles.interior.id}
            className="relative flex flex-col rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-7"
          >
            <h2 className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26] uppercase">
              {PRICING.profiles.interior.label} · 홈페이지 발행 + 매월 성과 관리
            </h2>
            <div className="mt-4">
              <PublishPrice />
            </div>
            <p className="mkt-type-support mt-1 text-[#5C6068]">
              {PUBLISH_PAYMENT_COPY.noBuildFee} · {PUBLISH_PAYMENT_COPY.vat}
            </p>
            <p data-site-price-unit className="mkt-type-support mt-1 text-[#696E76]">
              {SITE_PRICE_UNIT_COPY}
            </p>
            <p className="mkt-type-support mt-2 font-medium text-[#174DDA]">
              {SUBSCRIPTION_VALUE_COPY}
            </p>
            <ul className="mkt-type-body mt-6 space-y-3 text-[#5C6068]">
              {PRICING.profiles.interior.included.map((feature) => (
                <li key={feature.id} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#856A26]" />
                  {feature.label}
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-xl border border-[#D9E3F5] bg-white p-5">
              <PricingMotionComparison />
            </div>
          </div>
        </div>
      </section>

      {/* AI 영상 홈페이지 */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-6">
          <span className="mkt-type-support rounded-full bg-[#F3ECD8] px-3 py-1 font-semibold text-[#7A5E1E]">
            AI 영상 홈페이지 · +{formatKrw(PRICING.videoHeroAddon)}
          </span>
          <p className="mkt-type-body mt-3 text-[#5C6068]">
            기본 모션은 포함·무료입니다. {PUBLIC_BRAND_NAMES.ai} 시네마틱 영상 히어로는 선택 옵션이며, 완성 후 AI 영상
            재생성에만 크레딧을 사용합니다.
          </p>
          <p className="mkt-type-support mt-3 text-[#5C6068] break-keep">
            {VIDEO_FULFILLMENT_COPY}
          </p>
          <p data-site-price-unit className="mkt-type-support mt-2 text-[#696E76]">
            {SITE_PRICE_UNIT_COPY}
          </p>
        </div>
      </section>

      {/* 편집 크레딧 정책 (상수 렌더) */}
      <section data-credit-contract-section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <SectionHeading
            title="AI·대행 크레딧"
            subtitle={CREDIT_CONTRACT_COPY}
          />
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
              <h3 className="mkt-type-card-title font-semibold text-[#17181C]">크레딧 사용처</h3>
              <ul className="mkt-type-body mt-4 space-y-2 text-[#5C6068]">
                {CREDIT_CONSUMING_ACTIONS.map((action) => (
                  <li key={action}>{CREDIT_CONSUMING_ACTION_LABELS[action]}</li>
                ))}
              </ul>
              <p className="mkt-type-support mt-4 text-[#696E76]">
                텍스트를 직접 고치거나 이미지를 직접 교체하는 편집은 횟수 제한 없이 무료입니다.
              </p>
            </div>
            <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
              <h3 className="mkt-type-card-title font-semibold text-[#17181C]">크레딧 팩</h3>
              <ul className="mkt-type-body mt-4 space-y-2 text-[#5C6068]">
                {CREDIT_PACKS.map((p) => (
                  <li key={p.credits} className="flex items-baseline justify-between">
                    <span>{p.label}</span>
                    <span className="tabular-nums text-[#17181C]">{won(p.priceKrw)}원</span>
                  </li>
                ))}
              </ul>
              <p className="mkt-type-support mt-4 text-[#696E76]">
                구매 크레딧은 {CREDIT_EXPIRY_DAYS.purchase}일,
                구독 크레딧은 {CREDIT_EXPIRY_DAYS.subscription_grant}일간 유효합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 마케팅 대행 비용 앵커 */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading title="광고비와 함께, 발견되고 전환되는 상태를 관리합니다" />
        <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#5C6068]">마케팅 대행 관리</p>
            <p className="mt-3 text-2xl font-semibold text-[#5C6068]">월 수십만 원에서 수백만 원까지</p>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              검색·광고 운영을 외부에 맡길 때는 관리 범위에 따라 매달 비용이 달라집니다. 광고 집행비와 홈페이지 운영비가 따로 붙기도 합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#174DDA]">{PUBLIC_BRAND_NAMES.brand}</p>
            <p className="mt-3 text-2xl font-semibold text-[#17181C]">
              광고비 옆의 {PUBLISH_PAYMENT_COPY.monthlyRetainer} 성과 관리비
            </p>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              홈페이지 발행부터 검색·AI 노출 최적화, 전환 리포팅, 호스팅까지 한 구독으로 이어집니다.
            </p>
          </div>
        </div>
        <p className="mkt-type-support mx-auto mt-4 max-w-3xl text-[#696E76]">
          마케팅 관리 비용과 범위는 업체마다 다릅니다. 다보임의 월 이용료에는 광고 매체 집행비가 포함되지 않습니다.
        </p>
        <div className="mkt-type-support mx-auto mt-3 max-w-3xl space-y-1 text-[#696E76]">
          <p>{RETAINER_SCOPE_COPY}</p>
          <p>{RETAINER_COMPLEMENT_COPY}</p>
        </div>
      </section>

      {/* 해지·소유권·환불 */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="mkt-type-section-title text-center font-semibold tracking-tight text-[#17181C]">
            해지·소유권·환불
          </h2>
          <div className="mkt-type-body mt-8 space-y-4 text-[#5C6068]">
            <p>{OWNERSHIP_SUMMARY}</p>
            <p>{REFUND_NOTICE}</p>
            <p>자동 갱신 해지·환불 조건은 결제 기능 오픈 전 법률 검토 후 결제 화면과 약관에 동일하게 고지합니다.</p>
            <p className="mkt-type-support text-[#696E76]">{HOSTING_ONLY_FOOTNOTE}</p>
          </div>
        </div>
      </section>

      {/* 가격 FAQ */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading title="가격 관련 자주 묻는 질문" />
        <div className="mt-10">
          <FaqList items={PRICING_FAQ} />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 pb-24 text-center">
        <p className="mkt-type-body text-[#5C6068]">먼저 내 가게가 지금 어떤 상태인지 무료로 확인해 보세요.</p>
        <div className="mt-6 flex justify-center">
          <ScannerCta href="/#hero-scanner">무료 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}
