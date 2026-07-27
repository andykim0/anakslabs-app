import type { Metadata } from 'next';
import {
  ANONYMOUS_SITE_EVENT_DISCLOSURE,
  DESIGNATED_CRAWL_DISCLOSURE,
  EXTERNAL_AI_PROCESSING_DISCLOSURE,
  US_DEMO_VIEW_DISCLOSURE,
} from '@/lib/legal/templates';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: `${PUBLIC_BRAND_NAMES.brandBilingual} 개인정보처리방침 요약(운영사 Anaks Labs, 인터림).`,
  alternates: { canonical: '/privacy' },
  robots: { index: false },
};

/**
 * [마케팅] 개인정보처리방침 — 요약(인터림). 정식 방침 전문은 법률 검토 후 게시.
 * 실제 수집 항목·보관 기간은 서비스 구현과 정합되게 확정 필요(보고에 명시).
 */
export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mkt-type-page-title font-semibold tracking-tight text-[#17181C]">개인정보처리방침</h1>
      <p className="mkt-type-support mt-3 text-[#5C6068]">
        아래는 요약이며, 정식 방침 전문은 법률 검토 후 게시됩니다. 관련 문의는{' '}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#5C6068] hover:text-[#17181C]">{COMPANY_EMAIL}</a>{' '}
        로 받습니다.
      </p>

      <div className="mkt-type-body mt-10 space-y-8 text-[#5C6068]">
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">수집 항목</h2>
          <p className="mt-2">
            서비스 제공에 필요한 최소한의 정보(로그인 계정 식별자, 사업자 정보, 사이트 제작을 위해 고객이 입력·업로드한 콘텐츠)를 처리합니다.
          </p>
        </div>
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">이용 목적</h2>
          <p className="mt-2">계정 인증, 사이트 생성·호스팅·사이트 운영 구독 제공, 결제 및 고객 문의 응대에 사용합니다.</p>
        </div>
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">
            {EXTERNAL_AI_PROCESSING_DISCLOSURE.heading}
          </h2>
          <div className="mt-2 space-y-2">
            <p>{EXTERNAL_AI_PROCESSING_DISCLOSURE.processors}</p>
            <p>{EXTERNAL_AI_PROCESSING_DISCLOSURE.data}</p>
            <p>{EXTERNAL_AI_PROCESSING_DISCLOSURE.purpose}</p>
            <p data-brand-bilingual="legal">{EXTERNAL_AI_PROCESSING_DISCLOSURE.terms}</p>
            <p className="font-medium text-[#3F4651]">
              {EXTERNAL_AI_PROCESSING_DISCLOSURE.legalReview}
            </p>
          </div>
        </div>
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">
            {ANONYMOUS_SITE_EVENT_DISCLOSURE.heading}
          </h2>
          <div className="mt-2 space-y-2">
            <p>{ANONYMOUS_SITE_EVENT_DISCLOSURE.collected}</p>
            <p>{ANONYMOUS_SITE_EVENT_DISCLOSURE.purpose}</p>
            <p>{ANONYMOUS_SITE_EVENT_DISCLOSURE.excluded}</p>
            <p>{ANONYMOUS_SITE_EVENT_DISCLOSURE.retention}</p>
            <p className="font-medium text-[#3F4651]">
              {ANONYMOUS_SITE_EVENT_DISCLOSURE.legalReview}
            </p>
          </div>
        </div>
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">
            {DESIGNATED_CRAWL_DISCLOSURE.heading}
          </h2>
          <div className="mt-2 space-y-2">
            <p>{DESIGNATED_CRAWL_DISCLOSURE.collected}</p>
            <p>{DESIGNATED_CRAWL_DISCLOSURE.purpose}</p>
            <p>{DESIGNATED_CRAWL_DISCLOSURE.retention}</p>
            <p>{DESIGNATED_CRAWL_DISCLOSURE.imageRights}</p>
            <p className="font-medium text-[#3F4651]">
              {DESIGNATED_CRAWL_DISCLOSURE.legalReview}
            </p>
          </div>
        </div>
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">
            {US_DEMO_VIEW_DISCLOSURE.heading}
          </h2>
          <div className="mt-2 space-y-2">
            <p>{US_DEMO_VIEW_DISCLOSURE.collected}</p>
            <p>{US_DEMO_VIEW_DISCLOSURE.purpose}</p>
            <p>{US_DEMO_VIEW_DISCLOSURE.excluded}</p>
            <p>{US_DEMO_VIEW_DISCLOSURE.retention}</p>
            <p className="font-medium text-[#3F4651]">
              {US_DEMO_VIEW_DISCLOSURE.legalReview}
            </p>
          </div>
        </div>
        <div>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">문의</h2>
          <p className="mt-2">개인정보 열람·정정·삭제 요청은 위 이메일로 접수합니다.</p>
        </div>
      </div>
    </section>
  );
}
