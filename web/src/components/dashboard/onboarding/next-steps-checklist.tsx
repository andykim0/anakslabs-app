'use client';

/**
 * [F4] 생성 완료 화면의 가이드 체크리스트 — 설문 맥락 기반 액션 카드(3~5).
 * 각 카드는 에디터의 해당 위치로 딥링크(?focus=). 완료 체크는 localStorage(siteId별)에 저장.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { SurveyInput } from '@/lib/types/domain';
import { buildNextSteps, checklistStorageKey } from '@/lib/onboarding/next-steps';
import { cn } from '../ui';

export function NextStepsChecklist({ siteId, survey }: { siteId: string; survey: SurveyInput }) {
  const steps = buildNextSteps(survey);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(checklistStorageKey(siteId));
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* localStorage 접근 불가 — 무시 */
    }
  }, [siteId]);

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(checklistStorageKey(siteId), JSON.stringify([...next]));
      } catch {
        /* 저장 실패 무시 */
      }
      return next;
    });
  };

  if (steps.length === 0) return null;
  const completed = steps.filter((s) => done.has(s.id)).length;

  return (
    <div className="w-full max-w-md text-left">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">이제 이런 걸 다듬어보세요</h3>
        <span className="text-xs text-neutral-500">
          {completed}/{steps.length} 완료
        </span>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => {
          const isDone = done.has(step.id);
          return (
            <li
              key={step.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3',
                isDone ? 'border-[#3a4a3a] bg-[#16201a]' : 'border-neutral-800 bg-neutral-900/40',
              )}
            >
              <button
                type="button"
                aria-label={isDone ? '완료 취소' : '완료 표시'}
                onClick={() => toggle(step.id)}
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                  isDone
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                    : 'border-neutral-600 text-transparent hover:border-neutral-400',
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-medium', isDone ? 'text-neutral-500 line-through' : 'text-neutral-100')}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-neutral-500">{step.description}</p>
              </div>
              <Link
                href={`/dashboard/sites/${siteId}/editor?focus=${step.focus}`}
                className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-200 transition-colors hover:border-[#c8a96a] hover:text-[#d9b878]"
              >
                열기 <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
