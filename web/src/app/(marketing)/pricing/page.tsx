import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';
import {
  CREDIT_COSTS,
  CREDIT_EXPIRY_DAYS,
  CREDIT_PACKS,
  FREE_REGEN_LIMIT,
  INITIAL_GRANT,
  PRICE_RANGES,
} from '@/lib/credits/constants';
import {
  HOSTING_ONLY_FOOTNOTE,
  OWNERSHIP_SUMMARY,
  REFUND_NOTICE,
} from '@/lib/legal/notices';
import { FaqList, faqJsonLd, type FaqItem } from '@/components/marketing/Faq';
import { ScannerCta, SectionHeading } from '@/components/marketing/ui';

export const metadata: Metadata = {
  title: '홈페이지 제작 비용 — 제작비와 월 구독, 숨은 비용 없이',
  description:
    '소상공인 홈페이지 제작 비용을 투명하게: 1회 제작비 + 월 유지보수 + 편집 크레딧. Basic·Premium 요금제 비교, 크레딧 단가·팩 가격, 환불 규정까지.',
  alternates: { canonical: '/pricing' },
};

function man(krw: number): string {
  return `${Math.round(krw / 10_000)}만원`;
}
const won = (n: number) => n.toLocaleString('ko-KR');

/** 티어 비교 행 — Basic/Premium 값 (true=✓, false=✗, string=텍스트) */
const COMPARE: { label: string; basic: boolean | string; premium: boolean | string; note?: string }[] = [
  { label: '서브도메인 + SSL (xxx.anakslabs.com)', basic: true, premium: true },
  { label: 'AI 디자인 3안 + 캔버스 에디터', basic: true, premium: true },
  { label: '다중 페이지(홈·소개·문의) + 자동 헤더 내비', basic: true, premium: true },
  { label: 'SEO·AEO·GEO 기본 세팅(JSON-LD·시맨틱·사업자정보)', basic: true, premium: true },
  { label: '초기 편집 크레딧', basic: `${INITIAL_GRANT.basic}개`, premium: `${INITIAL_GRANT.premium}개` },
  { label: '등장 애니메이션(스크롤 모션)', basic: false, premium: true, note: 'Premium 전용' },
  { label: '영상(Veo) 편집', basic: false, premium: true, note: `크레딧 ${CREDIT_COSTS.video}개 소모` },
  { label: '폼·예약 등 동적 기능', basic: false, premium: true, note: '당사 호스팅에서 작동' },
  { label: '커스텀 도메인 연결', basic: '서브도메인만', premium: true },
  { label: '우선 지원', basic: false, premium: true },
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
    a: `수정 유형별로 크레딧을 소모합니다 — 텍스트 ${CREDIT_COSTS.text}개, 이미지 ${CREDIT_COSTS.image}개, 구조 변경 ${CREDIT_COSTS.structure}개, 영상 ${CREDIT_COSTS.video}개(Premium). 최초 발행 후 첫 편집 1건과 온보딩 재생성 ${FREE_REGEN_LIMIT}회는 무료입니다.`,
    plain: `수정 유형별로 크레딧을 소모합니다: 텍스트 ${CREDIT_COSTS.text}, 이미지 ${CREDIT_COSTS.image}, 구조 변경 ${CREDIT_COSTS.structure}, 영상 ${CREDIT_COSTS.video}(Premium). 최초 편집 1건과 재생성 ${FREE_REGEN_LIMIT}회 무료.`,
  },
  {
    q: 'Basic과 Premium의 가장 큰 차이는요?',
    a: 'Premium은 영상·스크롤 등장 애니메이션·폼/예약 같은 동적 기능이 열리고 초기 크레딧이 더 많습니다. Basic은 이미지 중심의 정적 사이트로, 검색·AI 최적화 기본 세팅은 두 요금제 모두 동일하게 들어갑니다.',
    plain:
      'Premium은 영상·스크롤 애니메이션·폼/예약 등 동적 기능과 더 많은 초기 크레딧을 제공합니다. SEO·AEO·GEO 기본 세팅은 두 요금제 동일합니다.',
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
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">
          홈페이지 제작 비용
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-neutral-400">
          1회 제작비 + 월 유지보수 + 필요할 때만 쓰는 편집 크레딧. 어떤 돈이 언제 왜 나가는지 전부 공개합니다.
        </p>
      </section>

      {/* 비용 구조 다이어그램 */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <p className="text-xs font-semibold tracking-widest text-[#c8a96a]">1회</p>
            <h3 className="mt-2 text-base font-semibold text-neutral-100">제작비</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              사이트를 처음 설계·생성하고 발행하는 비용. 결제 시 초기 편집 크레딧이 자동 지급됩니다.
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <p className="text-xs font-semibold tracking-widest text-[#c8a96a]">매월</p>
            <h3 className="mt-2 text-base font-semibold text-neutral-100">유지보수 구독</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              호스팅·SSL·백업·운영을 이어가는 구독. 사이트가 살아있는 동안 매달 나갑니다.
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <p className="text-xs font-semibold tracking-widest text-[#c8a96a]">필요할 때만</p>
            <h3 className="mt-2 text-base font-semibold text-neutral-100">편집 크레딧</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              수정이 필요할 때만 크레딧을 소모합니다. 안 쓰면 나가지 않습니다.
            </p>
          </div>
        </div>
      </section>

      {/* 요금제 2종 */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900/40 p-7">
            <h2 className="text-sm font-semibold tracking-widest text-neutral-400 uppercase">Basic</h2>
            <p className="mt-4 text-3xl font-semibold text-neutral-50">
              {man(buildFee.basic[0])}
              <span className="text-base font-normal text-neutral-500"> ~ {man(buildFee.basic[1])}</span>
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              + 월 {won(maintenanceMonthly.basic[0])}~{won(maintenanceMonthly.basic[1])}원 유지보수
            </p>
            <p className="mt-4 text-sm leading-6 text-neutral-400">
              이미지 중심의 정적 사이트. 검색·AI 기본 세팅 포함, 초기 크레딧 {INITIAL_GRANT.basic}개.
            </p>
          </div>
          <div className="relative flex flex-col rounded-2xl border border-[#4a3a22] bg-[#151310] p-7">
            <span className="absolute -top-3 right-6 rounded-full bg-[#c8a96a] px-3 py-1 text-[11px] font-semibold text-neutral-950">
              추천
            </span>
            <h2 className="text-sm font-semibold tracking-widest text-[#c8a96a] uppercase">Premium</h2>
            <p className="mt-4 text-3xl font-semibold text-neutral-50">
              {man(buildFee.premium[0])}
              <span className="text-base font-normal text-neutral-500"> ~ {man(buildFee.premium[1])}</span>
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              + 월 {won(maintenanceMonthly.premium[0])}~{won(maintenanceMonthly.premium[1])}원 유지보수
            </p>
            <p className="mt-4 text-sm leading-6 text-neutral-400">
              영상·스크롤 모션·폼 등 동적 기능. 초기 크레딧 {INITIAL_GRANT.premium}개, 커스텀 도메인·우선 지원.
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-neutral-600">
          제작비·구독료는 업종·규모에 따라 위 범위 내에서 책정됩니다.
        </p>
      </section>

      {/* 티어 비교표 */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading title="Basic · Premium 기능 비교" />
        <div className="mx-auto mt-10 max-w-3xl overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left">
                <th className="py-3 pr-4 font-medium text-neutral-400">기능</th>
                <th className="w-24 py-3 text-center font-semibold text-neutral-300">Basic</th>
                <th className="w-24 py-3 text-center font-semibold text-[#c8a96a]">Premium</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.label} className="border-b border-neutral-900">
                  <td className="py-3 pr-4 text-neutral-300">
                    {row.label}
                    {row.note ? <span className="ml-2 text-[11px] text-neutral-600">· {row.note}</span> : null}
                  </td>
                  <td className="py-3 text-center">{cell(row.basic)}</td>
                  <td className="py-3 text-center">{cell(row.premium, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 편집 크레딧 정책 (상수 렌더) */}
      <section className="border-t border-neutral-900 bg-[#0d0d0e]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <SectionHeading
            title="편집 크레딧"
            subtitle="사이트를 고칠 때만 쓰는 이용권입니다. 수정 유형별 소모량이 정해져 있습니다."
          />
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
              <h3 className="text-sm font-semibold text-neutral-100">유형별 소모</h3>
              <ul className="mt-4 space-y-2 text-sm text-neutral-400">
                <li>텍스트 수정 — {CREDIT_COSTS.text}개</li>
                <li>이미지 교체·생성 — {CREDIT_COSTS.image}개</li>
                <li>구조 변경 — {CREDIT_COSTS.structure}개</li>
                <li>영상(Veo) 편집 — {CREDIT_COSTS.video}개 <span className="text-neutral-600">(Premium)</span></li>
              </ul>
              <p className="mt-4 text-xs leading-5 text-neutral-600">
                최초 발행 후 첫 편집 1건과 온보딩 무료 재생성 {FREE_REGEN_LIMIT}회는 크레딧이 소모되지 않습니다.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
              <h3 className="text-sm font-semibold text-neutral-100">크레딧 팩</h3>
              <ul className="mt-4 space-y-2 text-sm text-neutral-400">
                {CREDIT_PACKS.map((p) => (
                  <li key={p.credits} className="flex items-baseline justify-between">
                    <span>{p.label}</span>
                    <span className="tabular-nums text-neutral-200">{won(p.priceKrw)}원</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-neutral-600">
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
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <p className="text-xs font-semibold tracking-widest text-neutral-500">일반 제작 에이전시</p>
            <p className="mt-3 text-2xl font-semibold text-neutral-300">평균 430만원<sup className="ml-1 text-xs text-neutral-600">1</sup></p>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              외주 디자인·개발 1회 비용. 수정마다 추가 견적, 검색·AI 최적화는 별도인 경우가 많습니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#4a3a22] bg-[#151310] p-6">
            <p className="text-xs font-semibold tracking-widest text-[#c8a96a]">아낙스랩스</p>
            <p className="mt-3 text-2xl font-semibold text-neutral-50">
              {man(PRICE_RANGES.buildFee.basic[0])}부터
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              제작비 + 월 구독. SEO·AEO·GEO 기본 세팅 포함, 수정은 크레딧으로 필요한 만큼만.
            </p>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-3xl text-[11px] leading-5 text-neutral-700">
          1) 자체 조사 기준의 참고 수치입니다. 실제 견적은 업체·범위에 따라 달라집니다.
        </p>
      </section>

      {/* 해지·소유권·환불 */}
      <section className="border-t border-neutral-900 bg-[#0d0d0e]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center text-xl font-semibold tracking-tight text-neutral-100">
            해지·소유권·환불
          </h2>
          <div className="mt-8 space-y-4 text-sm leading-6 text-neutral-400">
            <p>{OWNERSHIP_SUMMARY}</p>
            <p>{REFUND_NOTICE}</p>
            <p className="text-[12px] leading-5 text-neutral-600">{HOSTING_ONLY_FOOTNOTE}</p>
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
        <p className="text-sm text-neutral-400">먼저 내 가게가 지금 어떤 상태인지 무료로 확인해 보세요.</p>
        <div className="mt-6 flex justify-center">
          <ScannerCta href="/#scanner">무료 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}

function cell(value: boolean | string, gold = false) {
  if (value === true)
    return <Check className={`mx-auto h-4 w-4 ${gold ? 'text-[#c8a96a]' : 'text-neutral-400'}`} />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-neutral-700" />;
  return <span className="text-xs text-neutral-400">{value}</span>;
}
