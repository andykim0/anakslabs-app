/**
 * [마케팅] 고객사례 카드 (라이트). §7: isDemo면 "데모 사례" 배지, 성과 숫자는 metrics 있을 때만.
 */
import { ArrowUpRight } from 'lucide-react';
import type { Case } from '@/lib/marketing/cases';

export function CaseCard({ item }: { item: Case }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-[#E8E6E0] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2">
        <span className="mkt-type-support rounded-md bg-[#F3ECD8] px-2 py-0.5 font-medium text-[#7A5E1E]">
          {item.industryLabel}
        </span>
        {item.isDemo ? (
          <span className="mkt-type-support rounded-md border border-[#E8E6E0] px-2 py-0.5 font-medium text-[#5C6068]">
            데모 사례
          </span>
        ) : null}
      </div>

      <h3 className="mkt-type-card-title mt-4 font-semibold text-[#17181C]">{item.businessName}</h3>
      <p className="mkt-type-body mt-2 text-[#5C6068]">{item.summary}</p>

      {item.before || item.after ? (
        <dl className="mkt-type-support mt-4 space-y-2">
          {item.before ? (
            <div>
              <dt className="inline font-semibold text-[#696E76]">전 · </dt>
              <dd className="inline text-[#5C6068]">{item.before}</dd>
            </div>
          ) : null}
          {item.after ? (
            <div>
              <dt className="inline font-semibold text-[#856A26]">후 · </dt>
              <dd className="inline text-[#17181C]">{item.after}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {/* 성과 지표 — 실측(metrics)이 있을 때만. 데모엔 없음(§7) */}
      {item.metrics && item.metrics.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {item.metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-[#E8E6E0] bg-[#F6F5F1] p-3">
              <p className="text-lg font-semibold text-[#856A26] tabular-nums">{m.value}</p>
              <p className="mkt-type-support text-[#5C6068]">{m.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {item.ownerQuote ? (
        <p className="mkt-type-support mt-4 border-l-2 border-[#E8E6E0] pl-3 text-[#5C6068] italic">
          “{item.ownerQuote}”
        </p>
      ) : null}

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mkt-type-control group mt-5 inline-flex items-center gap-1 font-medium text-[#856A26] transition-colors hover:text-[#17181C]"
        >
          사이트 보기
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </a>
      ) : null}
    </article>
  );
}
