import type { Metadata } from 'next';
import {
  DYNAMIC_FEATURE_NOTICE,
  HOSTING_ONLY_FOOTNOTE,
  OWNERSHIP_SUMMARY,
  REFUND_NOTICE,
} from '@/lib/legal/notices';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';

export const metadata: Metadata = {
  title: '이용약관',
  description: 'Daboim 서비스 이용약관 요약. 운영사 Anaks Labs, 소유권·환불·정적 산출물 고지.',
  alternates: { canonical: '/terms' },
  robots: { index: false },
};

/**
 * [마케팅] 이용약관 — 핵심 고지 요약(인터림). 정식 약관 전문은 법률 검토 후 게시.
 * 문구는 lib/legal/notices.ts 상수 재사용(재작성 금지).
 */
export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mkt-type-page-title font-semibold tracking-tight text-[#17181C]">이용약관</h1>
      <p className="mkt-type-support mt-3 text-[#5C6068]">
        아래는 핵심 고지 요약입니다. 정식 약관 전문은 법률 검토 후 게시되며, 그 전까지의 문의는{' '}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#5C6068] hover:text-[#17181C]">{COMPANY_EMAIL}</a>{' '}
        로 받습니다.
      </p>

      <div className="mkt-type-body mt-10 space-y-8 text-[#5C6068]">
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">소유권</h2>
          <p className="mt-2">{OWNERSHIP_SUMMARY}</p>
        </div>
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">환불</h2>
          <p className="mt-2">{REFUND_NOTICE}</p>
        </div>
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">정적 산출물(HTML 백업) 고지</h2>
          <p className="mt-2">{DYNAMIC_FEATURE_NOTICE}</p>
          <p className="mkt-type-support mt-2 text-[#696E76]">{HOSTING_ONLY_FOOTNOTE}</p>
        </div>
      </div>
    </section>
  );
}
