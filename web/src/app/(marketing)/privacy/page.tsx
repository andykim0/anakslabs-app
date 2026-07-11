import type { Metadata } from 'next';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: '아낙스랩스 개인정보처리방침 요약(인터림).',
  alternates: { canonical: '/privacy' },
  robots: { index: false },
};

/**
 * [마케팅] 개인정보처리방침 — 요약(인터림). 정식 방침 전문은 법률 검토 후 게시.
 * 실제 수집 항목·보관 기간은 서비스 구현과 정합되게 확정 필요(보고에 명시).
 */
export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">개인정보처리방침</h1>
      <p className="mt-3 text-xs text-neutral-500">
        아래는 요약이며, 정식 방침 전문은 법률 검토 후 게시됩니다. 관련 문의는{' '}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-neutral-300 hover:text-white">{COMPANY_EMAIL}</a>{' '}
        로 받습니다.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-7 text-neutral-400">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">수집 항목</h2>
          <p className="mt-2">
            서비스 제공에 필요한 최소한의 정보(로그인 계정 식별자, 사업자 정보, 사이트 제작을 위해 고객이 입력·업로드한 콘텐츠)를 처리합니다.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">이용 목적</h2>
          <p className="mt-2">계정 인증, 사이트 생성·호스팅·유지보수, 결제 및 고객 문의 응대에 사용합니다.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">문의</h2>
          <p className="mt-2">개인정보 열람·정정·삭제 요청은 위 이메일로 접수합니다.</p>
        </div>
      </div>
    </section>
  );
}
