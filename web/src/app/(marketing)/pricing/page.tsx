import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import {
  CREDIT_COSTS,
  CREDIT_EXPIRY_DAYS,
  CREDIT_PACKS,
  FREE_REGEN_LIMIT,
  INITIAL_GRANT,
  PRICE_RANGES,
} from '@/lib/credits/constants';
import { VIDEO_ADDON_PRICE_KRW } from '@/lib/services/entitlements';
import {
  HOSTING_ONLY_FOOTNOTE,
  OWNERSHIP_SUMMARY,
  REFUND_NOTICE,
} from '@/lib/legal/notices';
import { FaqList, faqJsonLd, type FaqItem } from '@/components/marketing/Faq';
import { ScannerCta, SectionHeading } from '@/components/marketing/ui';
import { PreviewVideo } from '@/components/marketing/PreviewVideo';

export const metadata: Metadata = {
  title: '홈페이지 제작 비용 — 제작비와 월 구독, 숨은 비용 없이',
  description:
    '소상공인 홈페이지 제작 비용을 투명하게: 1회 제작비 + 월 유지보수 + 편집 크레딧. 단일 제품에 AI 영상 히어로는 유료 애드온, 크레딧 단가·팩 가격, 환불 규정까지.',
  alternates: { canonical: '/pricing' },
};

function man(krw: number): string {
  return `${Math.round(krw / 10_000)}만원`;
}
const won = (n: number) => n.toLocaleString('ko-KR');

/** 기본 포함 기능 — 단일 제품이라 전부 ✓ (영상은 별도 애드온 그룹으로 분리) */
const INCLUDED_FEATURES: string[] = [
  '서브도메인 + SSL (xxx.anakslabs.com)',
  'AI 디자인 3안 + 캔버스 에디터',
  '다중 페이지(홈·소개·문의) + 자동 헤더 내비',
  'SEO·AEO·GEO 기본 세팅(JSON-LD·시맨틱·사업자정보)',
  `초기 편집 크레딧 ${INITIAL_GRANT.basic}개`,
  '등장 애니메이션(스크롤 모션)',
  '폼·예약 등 동적 기능(당사 호스팅에서 작동)',
  '커스텀 도메인 연결',
];

const PRICING_FAQ: FaqItem[] = [
  {
    q: '왜 제작비와 월 구독으로 나뉘나요?',
    a: '제작비는 사이트를 처음 설계·생성하는 1회 비용이고, 월 유지보수는 호스팅·SSL·백업·소소한 운영을 이어가는 구독입니다. 큰 수정은 편집 크레딧으로 별도 처리해, 안 쓰는 기능에 매달 돈이 나가지 않게 했습니다.',
    plain:
      '제작비는 사이트를 처음 설계·생성하는 1회 비용, 월 유지보수는 호스팅·SSL·백업 등 운영 구독입니다. 큰 수정은 편집 크레딧으로 별도 처리합니다.',
  },
  {
    q: '편집 크레딧은 어떻게 쓰이나요?',
    a: `수정 유형별로 크레딧을 소모합니다 — 텍스트 ${CREDIT_COSTS.text}개, 이미지 ${CREDIT_COSTS.image}개, 구조 변경 ${CREDIT_COSTS.structure}개, 영상 ${CREDIT_COSTS.video}개(영상 애드온). 최초 발행 후 첫 편집 1건과 온보딩 재생성 ${FREE_REGEN_LIMIT}회는 무료입니다.`,
    plain: `수정 유형별로 크레딧을 소모합니다: 텍스트 ${CREDIT_COSTS.text}, 이미지 ${CREDIT_COSTS.image}, 구조 변경 ${CREDIT_COSTS.structure}, 영상 ${CREDIT_COSTS.video}(영상 애드온). 최초 편집 1건과 재생성 ${FREE_REGEN_LIMIT}회 무료.`,
  },
  {
    q: '영상 애드온은 무엇인가요?',
    a: `기본 제품에 AI 디자인 3안, 캔버스 에디터, 다중 페이지, SEO·AEO·GEO 세팅이 전부 포함됩니다. AI가 만드는 영상 히어로·시네마틱 영상만 원하는 분에 한해 +${man(VIDEO_ADDON_PRICE_KRW)} 애드온으로 추가합니다. 편집 시 영상 수정은 크레딧 ${CREDIT_COSTS.video}개를 소모합니다.`,
    plain: `기본 제품에 디자인·에디터·다중 페이지·SEO 세팅이 전부 포함됩니다. AI 영상 히어로·시네마틱 영상만 +${man(VIDEO_ADDON_PRICE_KRW)} 애드온입니다.`,
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
    a: `초기 지급 크레딧은 ${CREDIT_EXPIRY_DAYS.initial_grant}일, 구매한 크레딧은 ${CREDIT_EXPIRY_DAYS.purchase}일간 유효합니다. 소진은 만료가 임박한 것부터 자동 차감됩니다.`,
    plain: `초기 지급 크레딧 ${CREDIT_EXPIRY_DAYS.initial_grant}일, 구매 크레딧 ${CREDIT_EXPIRY_DAYS.purchase}일 유효. 만료 임박분부터 소진됩니다.`,
  },
];

export default function PricingPage() {
  const { buildFee, maintenanceMonthly } = PRICE_RANGES;
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
          1회 제작비 + 월 유지보수 + 필요할 때만 쓰는 편집 크레딧. 어떤 돈이 언제 왜 나가는지 전부 공개합니다.
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
            <h3 className="mt-2 text-base font-semibold text-[#17181C]">유지보수 구독</h3>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">
              호스팅·SSL·백업·운영을 이어가는 구독. 사이트가 살아있는 동안 매달 나갑니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
            <p className="text-xs font-semibold tracking-widest text-[#856A26]">필요할 때만</p>
            <h3 className="mt-2 text-base font-semibold text-[#17181C]">편집 크레딧</h3>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">
              수정이 필요할 때만 크레딧을 소모합니다. 안 쓰면 나가지 않습니다.
            </p>
          </div>
        </div>
      </section>

      {/* 단일 제품 카드 + 영상 애드온 */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className="mx-auto max-w-xl">
          <div className="relative flex flex-col rounded-2xl border border-[#E4D9BF] bg-[#FBF8F1] p-7">
            <h2 className="text-sm font-semibold tracking-widest text-[#856A26] uppercase">
              홈페이지 제작 + 호스팅
            </h2>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-normal text-[#696E76] line-through">{man(buildFee.basic[1])}</span>
              <span className="text-3xl font-semibold text-[#17181C]">{man(buildFee.basic[0])}</span>
              <span className="rounded-full bg-[#F3ECD8] px-2 py-0.5 text-[11px] font-semibold text-[#7A5E1E]">
                런칭 특가
              </span>
            </p>
            <p className="mt-1 text-xs text-[#5C6068]">
              + 월 {man(maintenanceMonthly.basic[1])} 관리 · VAT 별도
            </p>
            <p className="mt-4 text-sm leading-6 text-[#5C6068]">
              이미지 중심의 정적 사이트, AI 디자인 3안 + 캔버스 에디터, 다중 페이지 + 자동 헤더 내비,
              SEO·AEO·GEO 기본 세팅, 초기 편집 크레딧 {INITIAL_GRANT.basic}개까지 전부 포함됩니다.
            </p>

            <div className="mt-6 rounded-xl border border-[#E4D9BF] bg-white p-5">
              {/* [video] 영상 애드온 티저 — 데스크톱 hover 시 영상 재생, 아웃 시 첫 프레임 복귀 (모바일=poster) */}
              <PreviewVideo mode="hover" className="mb-4 rounded-lg border border-[#E4D9BF]" />
              <p className="text-sm font-semibold text-[#17181C]">
                영상 추가 +{man(VIDEO_ADDON_PRICE_KRW)}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#5C6068]">
                AI 영상 히어로·시네마틱 영상을 원하면 애드온으로 추가합니다. 원할 때만 더하면 됩니다.
              </p>
            </div>

            <p className="mt-4 text-center text-[11px] text-[#696E76]">
              영상까지 포함한 프리미엄 제작 {man(PRICE_RANGES.buildFee.premium[0])}부터
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-[#696E76]">
          제작비·구독료는 업종·규모에 따라 위 범위 내에서 책정됩니다.
        </p>
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
              영상 애드온 · +{man(VIDEO_ADDON_PRICE_KRW)}
            </span>
            <p className="mt-3 text-sm leading-6 text-[#5C6068]">
              AI 영상 히어로·시네마틱 영상 편집은 기본 제품에 포함되지 않는 별도 애드온입니다. 편집 시
              크레딧 {CREDIT_COSTS.video}개를 소모합니다.
            </p>
          </div>
        </div>
      </section>

      {/* 편집 크레딧 정책 (상수 렌더) */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <SectionHeading
            title="편집 크레딧"
            subtitle="사이트를 고칠 때만 쓰는 이용권입니다. 수정 유형별 소모량이 정해져 있습니다."
          />
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[#E8E6E0] bg-white p-6">
              <h3 className="text-sm font-semibold text-[#17181C]">유형별 소모</h3>
              <ul className="mt-4 space-y-2 text-sm text-[#5C6068]">
                <li>텍스트 수정 — {CREDIT_COSTS.text}개</li>
                <li>이미지 교체·생성 — {CREDIT_COSTS.image}개</li>
                <li>구조 변경 — {CREDIT_COSTS.structure}개</li>
                <li>영상(Veo) 편집 — {CREDIT_COSTS.video}개 <span className="text-[#696E76]">(영상 애드온)</span></li>
              </ul>
              <p className="mt-4 text-xs leading-5 text-[#696E76]">
                최초 발행 후 첫 편집 1건과 온보딩 무료 재생성 {FREE_REGEN_LIMIT}회는 크레딧이 소모되지 않습니다.
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
                초기 지급 크레딧은 {CREDIT_EXPIRY_DAYS.initial_grant}일, 구매 크레딧은 {CREDIT_EXPIRY_DAYS.purchase}일간
                유효합니다.
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
            <p className="text-xs font-semibold tracking-widest text-[#856A26]">아낙스랩스</p>
            <p className="mt-3 text-2xl font-semibold text-[#17181C]">
              {man(PRICE_RANGES.buildFee.basic[0])}부터
            </p>
            <p className="mt-2 text-sm leading-6 text-[#5C6068]">
              제작비 + 월 구독. SEO·AEO·GEO 기본 세팅 포함, 수정은 크레딧으로 필요한 만큼만.
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
