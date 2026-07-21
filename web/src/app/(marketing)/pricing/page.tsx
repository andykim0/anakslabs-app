import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import {
  CREDIT_EXPIRY_DAYS,
  CREDIT_PACKS,
  INITIAL_GRANT,
} from '@/lib/credits/constants';
import {
  HOSTING_ONLY_FOOTNOTE,
  OWNERSHIP_SUMMARY,
  REFUND_NOTICE,
} from '@/lib/legal/notices';
import { FaqList, faqJsonLd, type FaqItem } from '@/components/marketing/Faq';
import { ScannerCta, SectionHeading } from '@/components/marketing/ui';
import { PricingMotionComparison } from '@/components/marketing/PricingMotionComparison';
import { LaunchPrice } from '@/components/marketing/LaunchPrice';
import { GuaranteeBadge } from '@/components/marketing/GuaranteeBadge';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import {
  CREDIT_CONSUMING_ACTION_LABELS,
  CREDIT_CONSUMING_ACTIONS,
  formatKrw,
  getBasePricePresentation,
  PRICING,
  SITE_PRICE_UNIT_COPY,
  SUBSCRIPTION_BENEFIT_COPY,
  SUBSCRIPTION_VALUE_COPY,
} from '@/lib/pricing';
import { CREDIT_CONTRACT_COPY } from '@/lib/credits/contract-copy';

export const metadata: Metadata = {
  title: '홈페이지 제작 비용 — 제작비와 월 구독, 숨은 비용 없이',
  description:
    '소상공인 홈페이지 제작 비용을 투명하게: 1회 제작비 + 월간 성과 리포트와 크레딧이 포함된 사이트 운영 구독. 기본 모션과 AI 영상 홈페이지의 차이, 크레딧 팩·환불 규정까지.',
  alternates: { canonical: '/pricing' },
};

const won = (n: number) => n.toLocaleString('ko-KR');

/** 기본 포함 기능 — 단일 제품이라 전부 ✓ (실제 AI 영상은 선택 옵션으로 분리) */
const INCLUDED_FEATURES: string[] = [
  '서브도메인 + SSL (xxx.anakslabs.com)',
  'AI 디자인 3안 + 캔버스 에디터',
  '다중 페이지(홈·소개·문의) + 자동 헤더 내비',
  '네이버·구글·AI가 읽기 쉬운 기본 구성',
  '네이버·구글 검색 등록까지 다보임이 대신합니다 — 사장님은 아무것도 안 하셔도 됩니다.',
  `초기 편집 크레딧 ${INITIAL_GRANT.basic}개`,
  '기본 모션(포함·무료) — 스크롤 등장 효과',
  '폼·예약 등 동적 기능(당사 호스팅에서 작동)',
  '커스텀 도메인 연결',
];

const PRICING_FAQ: FaqItem[] = [
  {
    q: '왜 제작비와 월 구독으로 나뉘나요?',
    a: `제작비는 사이트를 처음 설계·생성하는 1회 비용이고, 사이트 운영 구독에는 ${SUBSCRIPTION_BENEFIT_COPY.operations}, ${SUBSCRIPTION_BENEFIT_COPY.report}, ${SUBSCRIPTION_BENEFIT_COPY.credits}이 포함됩니다. ${SUBSCRIPTION_VALUE_COPY} ${CREDIT_CONTRACT_COPY}`,
  },
  {
    q: '무제한 수정과 크레딧은 뭐가 다른가요?',
    a: CREDIT_CONTRACT_COPY,
  },
  {
    q: 'AI 영상 홈페이지는 무엇인가요?',
    a: `기본 모션은 모든 홈페이지에 포함되어 무료입니다. ${PUBLIC_BRAND_NAMES.ai}가 만드는 시네마틱 영상 히어로는 원하는 분만 +${formatKrw(PRICING.videoHeroAddon)}에 추가합니다. 완성 후 AI 영상 재생성에는 크레딧을 사용합니다.`,
  },
  {
    q: '연간 결제 할인이 있나요?',
    a: '연간 결제는 준비 중입니다. 현재는 월 구독만 제공하며, 도입되면 이 페이지에 정확한 할인율과 함께 안내합니다.',
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
    a: `초기 지급 크레딧은 ${CREDIT_EXPIRY_DAYS.initial_grant}일, 구매한 크레딧은 ${CREDIT_EXPIRY_DAYS.purchase}일, 구독으로 매월 지급되는 크레딧은 ${CREDIT_EXPIRY_DAYS.subscription_grant}일간 유효합니다. 소진은 만료가 임박한 것부터 자동 차감됩니다.`,
  },
];

export default function PricingPage() {
  const basePrice = getBasePricePresentation();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(PRICING_FAQ)) }}
      />

      {/* 헤더 */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
        <h1 className="mkt-type-page-title font-semibold tracking-tight text-[#17181C]">
          홈페이지 제작 비용
        </h1>
        <p className="mkt-type-body mx-auto mt-4 max-w-xl text-[#5C6068]">
          처음 만들 때 한 번, 운영은 매달 냅니다. AI에게 다시 만들라고 하거나 다보임에 맡길 때만 크레딧을 쓰고, 직접 수정은 무료입니다.
        </p>
      </section>

      {/* 비용 구조 다이어그램 */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26]">1회</p>
            <h3 className="mkt-type-card-title mt-2 font-semibold text-[#17181C]">제작비</h3>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              사이트를 처음 설계·생성하고 발행하는 비용. 결제 시 초기 편집 크레딧이 자동 지급됩니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26]">매월</p>
            <h3 className="mkt-type-card-title mt-2 font-semibold text-[#17181C]">사이트 운영 구독</h3>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              {SUBSCRIPTION_BENEFIT_COPY.report}와 {SUBSCRIPTION_BENEFIT_COPY.credits}, {SUBSCRIPTION_BENEFIT_COPY.operations}을
              한 번에 제공합니다.
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

      {/* 단일 제품 카드 + AI 영상 홈페이지 */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className="mx-auto max-w-4xl">
          <div className="relative flex flex-col rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-7">
            <h2 className="mkt-type-eyebrow font-semibold tracking-widest text-[#856A26] uppercase">
              홈페이지 제작 + 호스팅
            </h2>
            <div className="mt-4">
              <LaunchPrice />
            </div>
            <p className="mkt-type-support mt-1 text-[#5C6068]">
              + 사이트 운영 구독 월 {formatKrw(PRICING.subscription.monthly)} · VAT 별도
            </p>
            <p data-site-price-unit className="mkt-type-support mt-1 text-[#696E76]">
              {SITE_PRICE_UNIT_COPY}
            </p>
            <p className="mkt-type-support mt-2 font-medium text-[#174DDA]">
              {SUBSCRIPTION_VALUE_COPY}
            </p>
            <p className="mkt-type-body mt-4 text-[#5C6068]">
              서로 다른 디자인 3안, 직접 고치는 편집 화면, 여러 페이지, 손님이 검색하거나 AI에 물을 때
              읽기 쉬운 기본 구성, 초기 편집 크레딧 {INITIAL_GRANT.basic}개가 모두 포함됩니다.
            </p>
            <GuaranteeBadge />

            <div className="mt-6 rounded-xl border border-[#D9E3F5] bg-white p-5">
              <PricingMotionComparison />
            </div>

          </div>
        </div>
      </section>

      {/* 기본 포함 기능 체크리스트 */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading title="기본 포함 기능" subtitle="요금제 구분 없이 모든 사이트에 기본으로 들어갑니다." />
        <div className="mx-auto mt-10 max-w-3xl">
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {INCLUDED_FEATURES.map((f) => (
              <li key={f} className="mkt-type-body flex items-start gap-2 text-[#5C6068]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#856A26]" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-6">
            <span className="mkt-type-support rounded-full bg-[#F3ECD8] px-3 py-1 font-semibold text-[#7A5E1E]">
              AI 영상 홈페이지 · +{formatKrw(PRICING.videoHeroAddon)}
            </span>
            <p className="mkt-type-body mt-3 text-[#5C6068]">
              기본 모션은 포함·무료입니다. {PUBLIC_BRAND_NAMES.ai} 시네마틱 영상 히어로는 선택 옵션이며, 완성 후 AI 영상
              재생성에만 크레딧을 사용합니다.
            </p>
            <p data-site-price-unit className="mkt-type-support mt-2 text-[#696E76]">
              {SITE_PRICE_UNIT_COPY}
            </p>
          </div>
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
                초기 지급 크레딧은 {CREDIT_EXPIRY_DAYS.initial_grant}일, 구매 크레딧은 {CREDIT_EXPIRY_DAYS.purchase}일,
                월 구독 크레딧은 {CREDIT_EXPIRY_DAYS.subscription_grant}일간 유효합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 에이전시 비교 */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading title="왜 이 방식이 더 합리적일까요" />
        <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#5C6068]">일반 제작 에이전시</p>
            <p className="mt-3 text-2xl font-semibold text-[#5C6068]">평균 430만원<sup className="mkt-type-support ml-1 text-[#696E76]">1</sup></p>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              외주 디자인·개발 1회 비용입니다. 수정할 때마다 추가 견적이 생기거나, 손님이 찾는 정보 정리가 별도일 수 있습니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-6">
            <p className="mkt-type-eyebrow font-semibold tracking-widest text-[#174DDA]">{PUBLIC_BRAND_NAMES.brand}</p>
            <p className="mt-3 text-2xl font-semibold text-[#17181C]">
              {formatKrw(basePrice.currentPriceKrw)}부터
            </p>
            <p className="mkt-type-body mt-2 text-[#5C6068]">
              제작비 + 사이트 운영 구독. 손님이 찾는 정보까지 기본으로 정리하고, 직접 수정은 횟수 제한 없이 무료입니다.
            </p>
          </div>
        </div>
        <p className="mkt-type-support mx-auto mt-4 max-w-3xl text-[#696E76]">
          1) 자체 조사 기준의 참고 수치입니다. 실제 견적은 업체·범위에 따라 달라집니다.
        </p>
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
