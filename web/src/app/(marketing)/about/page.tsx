import type { Metadata } from 'next';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';
import { ScannerCta } from '@/components/marketing/ui';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

export const metadata: Metadata = {
  title: `회사소개 — 왜 ${PUBLIC_BRAND_NAMES.brand}을 만들었나`,
  description:
    `좋은 가게가 손님에게 더 잘 발견되도록, 업종별 설계부터 직접 편집·호스팅·성과 리포트까지 한 번에 제공하는 ${PUBLIC_BRAND_NAMES.brand}을 만들었습니다.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-12">
        <h1 className="mkt-type-page-title font-semibold tracking-tight text-[#17181C]">
          왜 {PUBLIC_BRAND_NAMES.brand}을 만들었나
        </h1>
        <div className="mkt-type-body mt-8 space-y-5 text-[#5C6068]">
          <p>
            좋은 가게가 손님 눈에 보이지 않는 걸 자주 봤습니다. 음식도 실력도 훌륭한데, 홈페이지가 없거나
            가게 이름·지역·메뉴가 제대로 정리되지 않아 &ldquo;근처 맛집&rdquo;을 찾는 손님이 발견하기 어려웠습니다.
            이제는 사람들이 AI에게도 추천을 묻지만, 공식 정보를 확인할 곳이 없는 가게는 거기서도 빠지기 쉽습니다.
          </p>
          <p>
            문제는 대부분 예산과 시간이었습니다. 손님이 찾는 정보까지 갖춘 홈페이지를 맡기려면 비용이 크고,
            직접 만들려면 무엇부터 넣어야 하는지 알기 어렵습니다. 그래서 AI가 초안을 만들고 사장님이 방향을 고르는 방식을 생각했습니다.
          </p>
          <p>
            {PUBLIC_BRAND_NAMES.brand}은 그 생각에서 시작한 Anaks Labs의 홈페이지 제품입니다. AI가 업종에 맞게 사이트를 설계하고,
            사장님이 직접 다듬은 뒤 바로 공개합니다. 손님이 검색하거나 AI에 물을 때 필요한 정보도 처음부터 함께 정리합니다.
          </p>
        </div>
      </section>

      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="mkt-type-section-title font-semibold text-[#17181C]">우리가 지키려는 것</h2>
          <ul className="mkt-type-body mt-6 space-y-3 text-[#5C6068]">
            <li>· 예쁘게만 보이는 사이트가 아니라, 손님이 필요한 정보를 찾을 수 있는 사이트.</li>
            <li>· 숨은 비용 없는 투명한 가격 — 안 쓰는 기능에 매달 돈이 나가지 않게.</li>
            <li>· 과장하지 않기 — 보장할 수 없는 순위·성과를 약속하지 않습니다.</li>
          </ul>
          <p className="mkt-type-support mt-8 text-[#696E76]">
            문의: <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#5C6068] hover:text-[#17181C]">{COMPANY_EMAIL}</a>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="mkt-type-section-title font-semibold tracking-tight text-[#17181C]">함께 시작해볼까요?</h2>
        <div className="mt-8 flex justify-center">
          <ScannerCta href="/#hero-scanner">내 가게 무료 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}
