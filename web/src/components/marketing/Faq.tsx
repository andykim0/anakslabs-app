/**
 * [마케팅] FAQ 리스트 + FAQPage JSON-LD 헬퍼 (AEO — 답변 상자·AI 발췌 대비).
 * 답변에 JSX(링크 등)가 필요할 수 있어 렌더용 `a`(node)와 JSON-LD용 `plain`(string)을 분리.
 */

export interface FaqItem {
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

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-neutral-900 border-y border-neutral-900">
      {items.map((it, i) => (
        <details key={i} className="group px-1 py-5">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-medium text-neutral-100 marker:content-['']">
            <span>{it.q}</span>
            <span className="mt-0.5 shrink-0 text-neutral-600 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="mt-3 text-sm leading-6 text-neutral-400">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
