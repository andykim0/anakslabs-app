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
  description: '아낙스랩스 서비스 이용약관 요약. 소유권·환불·정적 산출물 고지.',
  alternates: { canonical: '/terms' },
  robots: { index: false },
};

/**
 * [마케팅] 이용약관 — 핵심 고지 요약(인터림). 정식 약관 전문은 법률 검토 후 게시.
 * 문구는 lib/legal/notices.ts 상수 재사용(재작성 금지).
 */
export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">이용약관</h1>
      <p className="mt-3 text-xs text-neutral-500">
        아래는 핵심 고지 요약입니다. 정식 약관 전문은 법률 검토 후 게시되며, 그 전까지의 문의는{' '}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-neutral-300 hover:text-white">{COMPANY_EMAIL}</a>{' '}
        로 받습니다.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-7 text-neutral-400">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">소유권</h2>
          <p className="mt-2">{OWNERSHIP_SUMMARY}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">환불</h2>
          <p className="mt-2">{REFUND_NOTICE}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">정적 산출물(HTML 백업) 고지</h2>
          <p className="mt-2">{DYNAMIC_FEATURE_NOTICE}</p>
          <p className="mt-2 text-xs text-neutral-600">{HOSTING_ONLY_FOOTNOTE}</p>
        </div>
      </div>
    </section>
  );
}
