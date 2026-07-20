/**
 * [마케팅] FAQ 리스트 + 화면 내용과 일치하는 FAQPage JSON-LD 헬퍼.
 * 답변에 JSX(링크 등)가 필요할 수 있어 렌더용 `a`(node)와 JSON-LD용 `plain`(string)을 분리.
 */

import { FaqHashOpener } from './FaqHashOpener';

export interface FaqItem {
  /** 질문형 딥링크용 안정적인 HTML anchor */
  id?: string;
  q: string;
  /** 화면 렌더용 답변 (JSX 허용) */
  a: React.ReactNode;
  /** JSON-LD용 순수 텍스트 답변 (a가 문자열이면 생략 가능) */
  plain?: string;
}

/** FAQPage JSON-LD 객체 — 페이지가 <script type="application/ld+json">로 직렬화 */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: it.plain ?? (typeof it.a === 'string' ? it.a : ''),
      },
    })),
  };
}

export function FaqList({
  items,
  openHashTarget = false,
}: {
  items: FaqItem[];
  openHashTarget?: boolean;
}) {
  return (
    <>
      {openHashTarget ? <FaqHashOpener /> : null}
      <div className="mx-auto max-w-3xl divide-y divide-[#E8E6E0] border-y border-[#E8E6E0]">
        {items.map((it, i) => (
          <details key={it.id ?? i} id={it.id} className="group scroll-mt-28 px-1 py-5">
            <summary className="mkt-type-card-title flex cursor-pointer list-none items-start justify-between gap-4 font-medium text-[#17181C] marker:content-['']">
              <span>{it.q}</span>
              <span className="mt-0.5 shrink-0 text-[#696E76] transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="mkt-type-body mt-3 text-[#5C6068]">{it.a}</div>
          </details>
        ))}
      </div>
    </>
  );
}
