import type { Metadata } from 'next';
import {
  DYNAMIC_FEATURE_NOTICE,
  OWNERSHIP_SUMMARY,
  REFUND_NOTICE,
} from '@/lib/legal/notices';
import { COMPANY_EMAIL, KAKAO_CHANNEL_URL } from '@/lib/marketing/contact';
import { CREDIT_CONTRACT_COPY } from '@/lib/pricing';
import { FaqList, faqJsonLd, type FaqItem } from '@/components/marketing/Faq';

export const metadata: Metadata = {
  title: '자주 묻는 질문 · 고객센터',
  description:
    'Daboim 홈페이지 제작·수정·해지·환불·도메인·검색 노출에 대한 자주 묻는 질문. 카카오톡 채널로 문의하세요.',
  alternates: { canonical: '/faq' },
};

const FAQ: FaqItem[] = [
  {
    q: '홈페이지가 완성되기까지 얼마나 걸리나요?',
    a: '설문(약 5분) 후 AI가 디자인 3안을 생성하고, 캔버스에서 다듬어 바로 발행할 수 있습니다. 대부분 당일에서 수일 내에 라이브가 가능합니다.',
    plain: '설문 후 디자인 3안 생성 → 캔버스 편집 → 발행. 대부분 당일~수일 내 라이브.',
  },
  {
    q: '코딩이나 디자인을 몰라도 되나요?',
    a: '네. PPT처럼 요소를 끌어서 이동·리사이즈하며 편집합니다. 카피·이미지는 AI가 채워 두고, 마음에 드는 부분만 손대면 됩니다.',
    plain: '네. PPT처럼 끌어서 편집하고, 카피·이미지는 AI가 채워 둡니다.',
  },
  {
    q: '발행 후 수정은 어떻게 하나요?',
    a: CREDIT_CONTRACT_COPY,
    plain: CREDIT_CONTRACT_COPY,
  },
  {
    q: '구독을 해지하면 사이트는 어떻게 되나요?',
    a: `${OWNERSHIP_SUMMARY} 해지 시에는 정적 HTML 백업을 제공해, 콘텐츠·이미지 자산을 가져갈 수 있습니다.`,
    plain: `${OWNERSHIP_SUMMARY} 해지 시 정적 HTML 백업을 제공합니다.`,
  },
  {
    q: '스크롤 모션은 실제 영상인가요?',
    a: `기본 모션은 포함·무료이며 CSS 기반 등장 효과라 실제 영상이 아닙니다. AI 영상 홈페이지는 실제 Veo AI 영상 히어로를 추가하는 유료 옵션입니다. 참고로 ${DYNAMIC_FEATURE_NOTICE}`,
    plain: `기본 모션은 포함·무료인 CSS 효과입니다. AI 영상 홈페이지는 실제 Veo 영상 히어로 유료 옵션입니다. ${DYNAMIC_FEATURE_NOTICE}`,
  },
  {
    q: '환불이 되나요?',
    a: REFUND_NOTICE,
    plain: REFUND_NOTICE,
  },
  {
    q: '제 도메인을 연결할 수 있나요?',
    a: '기본으로 xxx.anakslabs.com 서브도메인과 SSL이 제공됩니다. 보유하신 커스텀 도메인 연결도 지원합니다.',
    plain: '기본 서브도메인+SSL 제공, 커스텀 도메인 연결도 지원합니다.',
  },
  {
    q: '검색·AI 노출을 보장하나요?',
    a: '순위나 노출을 보장하지는 않습니다. 다만 검색엔진과 생성형 AI가 “읽을 수 있는” 구조(제목·구조화 데이터·시맨틱 마크업·사업자 정보)를 처음부터 갖춘 상태로 발행해, 발견될 가능성을 최대한 높입니다.',
    plain: '순위·노출을 보장하지는 않지만, 검색·AI가 읽을 수 있는 구조를 처음부터 갖춰 발행합니다.',
  },
];

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }}
      />

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#17181C] sm:text-4xl">
          자주 묻는 질문
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#5C6068]">
          찾는 답이 없으면 편하게 문의하세요. 빠르게 도와드리겠습니다.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <FaqList items={FAQ} />
      </section>

      {/* 고객센터 — 카카오 채널 */}
      <section className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-[#17181C]">문의하기</h2>
          <p className="mt-3 text-sm text-[#5C6068]">카카오톡 채널로 문의하시면 가장 빠릅니다.</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {KAKAO_CHANNEL_URL ? (
              <a
                href={KAKAO_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#FEE500] px-8 text-sm font-semibold text-[#191600] transition-opacity hover:opacity-90"
              >
                카카오톡 채널로 문의
              </a>
            ) : (
              <span
                className="inline-flex h-12 cursor-not-allowed items-center gap-2 rounded-xl border border-[#E8E6E0] px-8 text-sm font-medium text-[#696E76]"
                title="채널 오픈 준비 중"
              >
                카카오톡 채널 준비 중
              </span>
            )}
            <a
              href={`mailto:${COMPANY_EMAIL}`}
              className="text-xs text-[#5C6068] transition-colors hover:text-[#17181C]"
            >
              또는 이메일: {COMPANY_EMAIL}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
