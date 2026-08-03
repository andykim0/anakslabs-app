'use client';

/**
 * [A3] 풀 생성(이미지·최종 카피 = 원가 발생) 전에 보여주는 저비용 '구성 미리보기'(와이어프레임).
 * survey의 pagePlan/sectionPlan(결정적, AI 미호출·이미지 0)만 읽어 페이지 목록 + 섹션 순서 +
 * 각 섹션이 담을 내용 요약(brief)을 뼈대로 렌더한다. 방향 드리프트를 가장 싼 지점에서 차단.
 *
 * 필수(must)·해제불가(required) 섹션은 잠금, 있으면-좋음(nice) 섹션만 빼기(toggle) 가능 —
 * 컴맹 배려: 목적별 기본 구성이 이미 합리적, 고객은 '빼기'만.
 */
import { ArrowRight, Check, GripVertical, Lock } from 'lucide-react';
import type { SurveyInput } from '@/lib/types/domain';
import {
  buildSitePlan,
  sitePlanV2Enabled,
  type AbsentSitePlanSection,
} from '@/lib/content/site-plan';
import { cn } from '../ui';

/** 섹션 식별 키 — 페이지+타입+이름 */
export function sectionKey(s: { pageSlug?: string; type: string; name: string }): string {
  return `${s.pageSlug ?? ''}:${s.type}:${s.name}`;
}

/** [A3] 제외한 nice 섹션을 sectionPlan에서 필터 — 승인 시 생성에 넘길 survey 산출(순수). */
export function pruneSections(survey: SurveyInput, removed: Set<string>): SurveyInput {
  if (removed.size === 0) return survey;
  return { ...survey, sectionPlan: survey.sectionPlan.filter((s) => !removed.has(sectionKey(s))) };
}

const SECTION_LABEL: Record<string, string> = {
  hero: "home screen", about: "introduction", features: "strength", menu: "Menu/Product", gallery: "gallery",
  testimonials: "Reviews", pricing: "price", contact: "Contact/Inquiry", cta: "call to action", team: "team",
  cases: "Case studies/performance", faq: "Frequently Asked Questions", custom: "section",
};

export function WireframePreview({
  survey,
  removed,
  onToggle,
  onMissingSection,
}: {
  survey: SurveyInput;
  /** 제외된 nice 섹션 키 집합 */
  removed: Set<string>;
  onToggle: (key: string) => void;
  /** 조기 와이어프레임에서 부재 구성을 해당 입력으로 연결한다. 기존 승인 화면은 생략 가능. */
  onMissingSection?: (section: AbsentSitePlanSection) => void;
}) {
  const sitePlan = sitePlanV2Enabled(survey) ? buildSitePlan(survey) : null;
  // 페이지 순서(pagePlan) → 그 안의 섹션(sectionPlan, pageSlug로 그룹)
  const pages = sitePlan?.pages ?? (survey.pagePlan?.length
    ? survey.pagePlan
    : [{ slug: '', title: "home", priority: 'must' as const }]);
  const byPage = (slug: string) => sitePlan
    ? sitePlan.sections.filter((section) => section.pageSlug === slug)
    : survey.sectionPlan.filter((section) => (section.pageSlug ?? '') === slug);

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {pages.map((page) => {
          const sections = byPage(page.slug);
          if (sections.length === 0) return null;
          const pageMust = page.priority !== 'nice';
          return (
            <div key={page.slug || 'home'} className="overflow-hidden rounded-ob border border-ob-border bg-ob-surface">
              <div className="flex items-center justify-between border-b border-ob-border bg-ob-bg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ob-ink">{page.title}</span>
                  {pageMust ? (
                    <span className="rounded-full bg-ob-accent-soft px-2 py-0.5 text-[10px] font-semibold text-ob-accent-strong">essential</span>
                  ) : (
                    <span className="rounded-full border border-ob-border px-2 py-0.5 text-[10px] text-ob-muted">Select</span>
                  )}
                </div>
                <span className="text-[11px] text-ob-muted">section {sections.length}</span>
              </div>
              <ul className="divide-y divide-ob-border">
                {sections.map((s) => {
                  const isPlanned = 'id' in s;
                  const approvalKey = isPlanned ? s.approvalKey : sectionKey(s);
                  const renderKey = isPlanned ? s.id : sectionKey(s);
                  const isRemoved = approvalKey ? removed.has(approvalKey) : false;
                  const must = isPlanned
                    ? s.required || !approvalKey
                    : s.priority !== 'nice' || s.required;
                  const canRemove = !must && Boolean(approvalKey);
                  return (
                    <li
                      key={renderKey}
                      className={cn('flex items-start gap-3 px-4 py-2.5', isRemoved && 'opacity-40')}
                    >
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-ob-border" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-medium', isRemoved ? 'text-ob-muted line-through' : 'text-ob-ink')}>
                            {s.name || SECTION_LABEL[s.type] || s.type}
                          </span>
                          <span className="rounded bg-ob-bg px-1.5 py-0.5 text-[10px] text-ob-muted">
                            {SECTION_LABEL[s.type] ?? s.type}
                          </span>
                          {must ? <span className="text-[10px] font-semibold text-ob-accent-strong">essential</span> : null}
                        </div>
                        {s.brief ? <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-ob-muted">{s.brief}</p> : null}
                      </div>
                      {canRemove ? (
                        <button
                          type="button"
                          onClick={() => approvalKey && onToggle(approvalKey)}
                          aria-pressed={!isRemoved}
                          aria-label={isRemoved ? "Put this section" : "Minus this section"}
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                            isRemoved ? 'border-ob-border text-transparent hover:border-ob-muted' : 'border-ob-accent-strong bg-ob-accent-strong/15 text-ob-accent-strong',
                          )}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-ob-border" aria-label="Required sections (fixed)" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {sitePlan?.absentSections.length ? (
        <div className="rounded-ob border border-dashed border-ob-border bg-ob-bg px-4 py-3">
          <p className="text-xs font-semibold text-ob-ink">Configuration not yet included</p>
          <ul className="mt-2 space-y-1.5">
            {sitePlan.absentSections.map((section) => (
              <li key={`${section.type}:${section.name}`} className="text-[11px] leading-4 text-ob-muted">
                {onMissingSection ? (
                  <button
                    type="button"
                    onClick={() => onMissingSection(section)}
                    className="group flex w-full items-start justify-between gap-3 rounded-ob px-2 py-1.5 text-left hover:bg-ob-surface"
                  >
                    <span>
                      <span className="font-medium text-ob-ink">{section.name}</span> — {section.inputHint}
                    </span>
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ob-accent-strong transition-transform group-hover:translate-x-0.5" />
                  </button>
                ) : (
                  <><span className="font-medium text-ob-ink">{section.name}</span> — {section.inputHint}</>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[11px] leading-4 text-ob-muted">
        {sitePlan
          ? "The configuration you just checked and the configuration actually created are the same. I don’t make up things that aren’t answered."
          : "You can leave the required sections as is and uncheck only the optional sections. Images and text are filled in in the next step."}
      </p>
    </div>
  );
}
