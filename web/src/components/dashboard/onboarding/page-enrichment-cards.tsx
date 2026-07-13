'use client';

/**
 * [D3] 생성 후 페이지별 보강 카드 — 각 페이지의 '비어 보이는' 신호를 코칭으로 안내하고 에디터의 해당
 * 페이지/영역으로 딥링크한다. 신규 백엔드 없음: config는 기존 getSite로 읽고, 보강은 기존 에디터로.
 * 강제 아님 — 카드는 dismiss 가능(localStorage). ob-* 라이트 토큰(G-batch) 사용.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { detectPageEnrichments, pageEnrichmentStorageKey } from '@/lib/onboarding/page-enrichment';
import { getSite } from '../api';
import { cn } from '../ui';

export function PageEnrichmentCards({ siteId }: { siteId: string }) {
  const { data: site } = useQuery({ queryKey: ['site', siteId], queryFn: () => getSite(siteId) });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(pageEnrichmentStorageKey(siteId));
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* localStorage 접근 불가 — 무시 */
    }
  }, [siteId]);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(pageEnrichmentStorageKey(siteId), JSON.stringify([...next]));
      } catch {
        /* 저장 실패 무시 */
      }
      return next;
    });
  };

  const config = site?.draftConfig ?? site?.siteConfig;
  if (!config) return null;
  const pages = detectPageEnrichments(config).filter((p) => p.signals.some((s) => !dismissed.has(s.id)));
  if (pages.length === 0) return null;

  return (
    <div className="mt-3 w-full max-w-md text-left">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-ob-accent-strong" />
        <h3 className="text-sm font-semibold text-ob-ink">페이지를 더 채워볼까요?</h3>
      </div>
      <p className="mb-2 text-[11px] leading-4 text-ob-muted">
        아래는 채우면 좋은 곳이에요. 알려주신 사실만 반영해요 — 넘어가도 발행에는 문제없어요.
      </p>
      <ul className="space-y-2">
        {pages.map((page) =>
          page.signals
            .filter((s) => !dismissed.has(s.id))
            .map((signal) => (
              <li
                key={signal.id}
                className="flex items-start gap-3 rounded-xl border border-ob-border bg-ob-bg p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-ob-surface px-1.5 py-0.5 text-[10px] font-medium text-ob-muted">
                      {page.pageTitle}
                    </span>
                    <p className="truncate text-xs font-medium text-ob-ink">{signal.title}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4 text-ob-muted">{signal.description}</p>
                </div>
                <Link
                  href={`/dashboard/sites/${siteId}/editor?focus=${signal.focus}&page=${encodeURIComponent(page.pageSlug)}`}
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border border-ob-border px-2.5 py-1 text-[11px] text-ob-ink transition-colors hover:border-ob-accent-strong hover:text-ob-accent-strong"
                >
                  채우기 <ArrowRight className="h-3 w-3" />
                </Link>
                <button
                  type="button"
                  aria-label="이 제안 넘기기"
                  onClick={() => dismiss(signal.id)}
                  className="mt-0.5 shrink-0 rounded-md p-1 text-ob-muted transition-colors hover:text-ob-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            )),
        )}
      </ul>
    </div>
  );
}
