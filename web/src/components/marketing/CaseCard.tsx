/**
 * [마케팅] 고객사례 카드. §7: isDemo면 "데모 사례" 배지, 성과 숫자는 metrics가 있을 때만.
 */
import { ArrowUpRight } from 'lucide-react';
import type { Case } from '@/lib/marketing/cases';

export function CaseCard({ item }: { item: Case }) {
  return (
    <article className="flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-[#2a2117] px-2 py-0.5 text-[11px] font-medium text-[#d9b878]">
          {item.industryLabel}
        </span>
        {item.isDemo ? (
          <span className="rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] font-medium text-neutral-400">
            데모 사례
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 text-base font-semibold text-neutral-100">{item.businessName}</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-400">{item.summary}</p>

      {item.before || item.after ? (
        <dl className="mt-4 space-y-2 text-xs leading-5">
          {item.before ? (
            <div>
              <dt className="inline font-semibold text-neutral-500">전 · </dt>
              <dd className="inline text-neutral-500">{item.before}</dd>
            </div>
          ) : null}
          {item.after ? (
            <div>
              <dt className="inline font-semibold text-[#c8a96a]">후 · </dt>
              <dd className="inline text-neutral-300">{item.after}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {/* 성과 지표 — 실측(metrics)이 있을 때만. 데모엔 없음(§7) */}
      {item.metrics && item.metrics.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {item.metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <p className="text-lg font-semibold text-[#c8a96a] tabular-nums">{m.value}</p>
              <p className="text-[11px] text-neutral-500">{m.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {item.ownerQuote ? (
        <p className="mt-4 border-l-2 border-neutral-800 pl-3 text-xs leading-5 text-neutral-500 italic">
          “{item.ownerQuote}”
        </p>
      ) : null}

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-[#c8a96a] transition-colors hover:text-[#d9bc82]"
        >
          사이트 보기
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </article>
  );
}
