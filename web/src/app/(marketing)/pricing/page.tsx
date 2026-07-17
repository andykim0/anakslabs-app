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
import { PreviewVideo } from '@/components/marketing/PreviewVideo';
import { LaunchPrice } from '@/components/marketing/LaunchPrice';
import {
  CREDIT_CONSUMING_ACTION_LABELS,
  CREDIT_CONSUMING_ACTIONS,
  CREDIT_CONTRACT_COPY,
  formatKrw,
  getBasePricePresentation,
  PRICING,
  SUBSCRIPTION_BENEFIT_COPY,
  SUBSCRIPTION_VALUE_COPY,
} from '@/lib/pricing';

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
  'SEO·AEO·GEO 기본 세팅(JSON-LD·시맨틱·사업자정보)',
  `초기 편집 크레딧 ${INITIAL_GRANT.basic}개`,
  '기본 모션(포함·무료) — 스크롤 등장 효과',
  '폼·예약 등 동적 기능(당사 호스팅에서 작동)',
  '커스텀 도메인 연결',
];

const PRICING_FAQ: FaqItem[] = [
  {
    q: '왜 제작비와 월 구독으로 나뉘나요?',
    a: `제작비는 사이트를 처음 설계·생성하는 1회 비용이고, 사이트 운영 구독에는 ${SUBSCRIPTION_BENEFIT_COPY.operations}, ${SUBSCRIPTION_BENEFIT_COPY.report}, ${SUBSCRIPTION_BENEFIT_COPY.credits}이 포함됩니다. ${SUBSCRIPTION_VALUE_COPY} ${CREDIT_CONTRACT_COPY}`,
    plain: `제작비는 1회 비용이고 사이트 운영 구독에는 ${SUBSCRIPTION_BENEFIT_COPY.operations}, ${SUBSCRIPTION_BENEFIT_COPY.report}, ${SUBSCRIPTION_BENEFIT_COPY.credits}이 포함됩니다. ${SUBSCRIPTION_VALUE_COPY} ${CREDIT_CONTRACT_COPY}`,
  },
  {
    q: '편집 크레딧은 어떻게 쓰이나요?',
    a: CREDIT_CONTRACT_COPY,
    plain: CREDIT_CONTRACT_COPY,
  },
  {
    q: 'AI 영상 홈페이지는 무엇인가요?',
    a: `기본 모션은 모든 홈페이지에 포함되어 무료입니다. Daboim AI가 만드는 시네마틱 영상 히어로는 원하는 분만 +${formatKrw(PRICING.videoHeroAddon)}에 추가합니다. 완성 후 AI 영상 재생성에는 크레딧을 사용합니다.`,
    plain: `기본 모션은 포함·무료입니다. Daboim AI 시네마틱 영상 히어로는 +${formatKrw(PRICING.videoHeroAddon)} 선택 옵션입니다.`,
  },
  {
    q: '연간 결제 할인이 있나요?',
    a: '연간 결제는 준비 중입니다. 현재는 월 구독만 제공하며, 도입되면 이 페이지에 정확한 할인율과 함께 안내합니다.',
    plain: '연간 결제는 준비 중입니다. 현재는 월 구독만 제공합니다.',
  },
  {
    q: '해지하면 사이트는 어떻게 되나요?',
    a: OWNERSHIP_SUMMARY + ' 해지 시에는 정적 HTML 백업을 제공합니다.',
    plain: OWNERSHIP_SUMMARY + ' 해지 시에는 정적 HTML 백업을 제공합니다.',
  },
  {
    q: '환불 규정은 어떻게 되나요?',
    a: REFUND_NOTICE,
    plain: REFUND_NOTICE,
  },
  {
    q: '크레딧에 유효기간이 있나요?',
    a: `초기 지급 크레딧은 ${CREDIT_EXPIRY_DAYS.initial_grant}일, 구매한 크레딧은 ${CREDIT_EXPIRY_DAYS.purchase}일, 구독으로 매월 지급되는 크레딧은 ${CREDIT_EXPIRY_DAYS.subscription_grant}일간 유효합니다. 소진은 만료가 임박한 것부터 자동 차감됩니다.`,
    plain: `초기 지급 크레딧 ${CREDIT_EXPIRY_DAYS.initial_grant}일, 구매 크레딧 ${CREDIT_EXPIRY_DAYS.purchase}일, 월 구독 크레딧 ${CREDIT_EXPIRY_DAYS.subscription_grant}일 유효. 만료 임박분부터 소진됩니다.`,
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
        <h1 className="text-3xl font-semibold tracking-tight text-[#17181C] sm:text-4xl">
          홈페이지 제작 비용
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#5C6068]">
          1회 제작비 + 사이트 운영 구독 + 필요할 때만 쓰는 편집 크레딧. 어떤 돈이 언제 왜 나가는지 전부 공개합니다.
        </p>
      </section>

      {/* 비용 구조 다이어그램 */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="text-xs font-semibold tracking-widest text-[#856A26]">1회</p>
            <h3 className="mt-2 text-base font-semibold text-[#17181C]">제작비</h3>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">
              사이트를 처음 설계·생성하고 발행하는 비용. 결제 시 초기 편집 크레딧이 자동 지급됩니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="text-xs font-semibold tracking-widest text-[#856A26]">매월</p>
            <h3 className="mt-2 text-base font-semibold text-[#17181C]">사이트 운영 구독</h3>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">
              {SUBSCRIPTION_BENEFIT_COPY.report}와 {SUBSCRIPTION_BENEFIT_COPY.credits}, {SUBSCRIPTION_BENEFIT_COPY.operations}을
              한 번에 제공합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="text-xs font-semibold tracking-widest text-[#856A26]">필요할 때만</p>
            <h3 className="mt-2 text-base font-semibold text-[#17181C]">AI·대행 크레딧</h3>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">
              AI로 다시 만들거나 다보임에 수정을 맡길 때만 사용합니다. 직접 수정은 무료입니다.
            </p>
          </div>
        </div>
      </section>

      {/* 단일 제품 카드 + AI 영상 홈페이지 */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className="mx-auto max-w-xl">
          <div className="relative flex flex-col rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-7">
            <h2 className="text-sm font-semibold tracking-widest text-[#856A26] uppercase">
              홈페이지 제작 + 호스팅
            </h2>
            <div className="mt-4">
              <LaunchPrice />
            </div>
            <p className="mt-1 text-xs text-[#5C6068]">
              + 사이트 운영 구독 월 {formatKrw(PRICING.subscription.monthly)} · VAT 별도
            </p>
            <p className="mt-2 text-xs font-medium leading-5 text-[#174DDA]">
              {SUBSCRIPTION_VALUE_COPY}
            </p>
            <p className="mt-4 text-sm leading-6 text-[#5C6068]">
              이미지 중심의 정적 사이트, AI 디자인 3안 + 캔버스 에디터, 다중 페이지 + 자동 헤더 내비,
              SEO·AEO·GEO 기본 세팅, 초기 편집 크레딧 {INITIAL_GRANT.basic}개까지 전부 포함됩니다.
            </p>

            <div className="mt-6 rounded-xl border border-[#E4D9BF] bg-white p-5">
              {/* [video] AI 영상 홈페이지 티저 — 데스크톱 hover 시 영상 재생, 아웃 시 첫 프레임 복귀 */}
              <PreviewVideo mode="hover" className="mb-4 rounded-lg border border-[#E4D9BF]" />
              <p className="text-sm font-semibold text-[#17181C]">
                AI 영상 홈페이지 +{formatKrw(PRICING.videoHeroAddon)}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#5C6068]">
                기본 모션은 포함·무료입니다. Daboim AI 시네마틱 영상 히어로가 필요할 때만 추가합니다.
              </p>
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
              <li key={f} className="flex items-start gap-2 text-sm text-[#5C6068]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#856A26]" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-6">
            <span className="rounded-full bg-[#F3ECD8] px-3 py-1 text-[11px] font-semibold text-[#7A5E1E]">
              AI 영상 홈페이지 · +{formatKrw(PRICING.videoHeroAddon)}
            </span>
            <p className="mt-3 text-sm leading-6 text-[#5C6068]">
              기본 모션은 포함·무료입니다. Daboim AI 시네마틱 영상 히어로는 선택 옵션이며, 완성 후 AI 영상
              재생성에만 크레딧을 사용합니다.
            </p>
          </div>
        </div>
      </section>

      {/* 편집 크레딧 정책 (상수 렌더) */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <SectionHeading
            title="AI·대행 크레딧"
            subtitle={CREDIT_CONTRACT_COPY}
          />
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
              <h3 className="text-sm font-semibold text-[#17181C]">크레딧 사용처</h3>
              <ul className="mt-4 space-y-2 text-sm text-[#5C6068]">
                {CREDIT_CONSUMING_ACTIONS.map((action) => (
                  <li key={action}>{CREDIT_CONSUMING_ACTION_LABELS[action]}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-[#696E76]">
                텍스트를 직접 고치거나 이미지를 직접 교체하는 편집은 횟수 제한 없이 무료입니다.
              </p>
            </div>
            <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
              <h3 className="text-sm font-semibold text-[#17181C]">크레딧 팩</h3>
              <ul className="mt-4 space-y-2 text-sm text-[#5C6068]">
                {CREDIT_PACKS.map((p) => (
                  <li key={p.credits} className="flex items-baseline justify-between">
                    <span>{p.label}</span>
                    <span className="tabular-nums text-[#17181C]">{won(p.priceKrw)}원</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-[#696E76]">
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
            <p className="text-xs font-semibold tracking-widest text-[#5C6068]">일반 제작 에이전시</p>
            <p className="mt-3 text-2xl font-semibold text-[#5C6068]">평균 430만원<sup className="ml-1 text-xs text-[#696E76]">1</sup></p>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">
              외주 디자인·개발 1회 비용. 수정마다 추가 견적, 검색·AI 최적화는 별도인 경우가 많습니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-6">
            <p className="text-xs font-semibold tracking-widest text-[#174DDA]">Daboim · 다보임</p>
            <p className="mt-3 text-2xl font-semibold text-[#17181C]">
              {formatKrw(basePrice.currentPriceKrw)}부터
            </p>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">
              제작비 + 사이트 운영 구독. SEO·AEO·GEO 기본 세팅과 직접 수정 무제한 무료.
            </p>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-3xl text-[11px] leading-5 text-[#696E76]">
          1) 자체 조사 기준의 참고 수치입니다. 실제 견적은 업체·범위에 따라 달라집니다.
        </p>
      </section>

      {/* 해지·소유권·환불 */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center text-xl font-semibold tracking-tight text-[#17181C]">
            해지·소유권·환불
          </h2>
          <div className="mt-8 space-y-4 text-sm leading-6 text-[#5C6068]">
            <p>{OWNERSHIP_SUMMARY}</p>
            <p>{REFUND_NOTICE}</p>
            <p className="text-[12px] leading-5 text-[#696E76]">{HOSTING_ONLY_FOOTNOTE}</p>
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
        <p className="text-sm text-[#5C6068]">먼저 내 가게가 지금 어떤 상태인지 무료로 확인해 보세요.</p>
        <div className="mt-6 flex justify-center">
          <ScannerCta href="/#hero-scanner">무료 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}
