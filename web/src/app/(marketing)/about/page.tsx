import type { Metadata } from 'next';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';
import { ScannerCta } from '@/components/marketing/ui';

export const metadata: Metadata = {
  title: '회사소개 — 왜 아낙스랩스를 만들었나',
  description:
    '검색과 AI가 읽을 수 있는 사이트를 소상공인도 가질 수 있어야 한다는 생각에서 시작한 1인 개발 프로젝트, 아낙스랩스.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-12">
        <h1 className="text-3xl font-semibold tracking-tight text-[#17181C] sm:text-4xl">
          왜 아낙스랩스를 만들었나
        </h1>
        <div className="mt-8 space-y-5 text-sm leading-7 text-[#5C6068]">
          <p>
            좋은 가게가 검색에서 사라지는 걸 자주 봤습니다. 음식도 실력도 훌륭한데, 사이트가 없거나 있어도
            검색엔진이 읽을 수 없는 구조라 &ldquo;근처 맛집&rdquo;에 끼지 못했습니다. 이제는 사람들이 AI에게까지
            추천을 묻는데, 거기서도 마찬가지였습니다.
          </p>
          <p>
            문제는 대부분 예산과 정보였습니다. 검색·AI 최적화까지 챙긴 사이트를 제대로 만들려면 비용이 크고,
            무엇을 갖춰야 하는지 알기도 어렵습니다. 그래서 그 일을 AI가 처음부터 대신 해주면 어떨까 생각했습니다.
          </p>
          <p>
            아낙스랩스는 그 생각에서 시작한 1인 개발 프로젝트입니다. AI가 사이트를 설계하고, 캔버스에서 손쉽게
            다듬고, 검색·AI가 읽을 수 있는 구조를 기본값으로 깔아 즉시 호스팅합니다.
          </p>
        </div>
      </section>

      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-lg font-semibold text-[#17181C]">우리가 지키려는 것</h2>
          <ul className="mt-6 space-y-3 text-sm leading-6 text-[#5C6068]">
            <li>· 예쁜 사이트가 아니라, 검색·AI가 읽을 수 있게 태어난 사이트.</li>
            <li>· 숨은 비용 없는 투명한 가격 — 안 쓰는 기능에 매달 돈이 나가지 않게.</li>
            <li>· 과장하지 않기 — 보장할 수 없는 순위·성과를 약속하지 않습니다.</li>
          </ul>
          <p className="mt-8 text-xs text-[#696E76]">
            문의: <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#5C6068] hover:text-[#17181C]">{COMPANY_EMAIL}</a>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-[#17181C]">함께 시작해볼까요?</h2>
        <div className="mt-8 flex justify-center">
          <ScannerCta href="/#hero-scanner">내 가게 무료 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}
