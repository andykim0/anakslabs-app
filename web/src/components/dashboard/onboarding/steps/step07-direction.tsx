'use client';

/**
 * S7 방향 잡기 — siteGoal(goalsForGroup 카드 택1) + highlights(1~3, 예시 칩+자유입력) + tone(최대 2).
 */
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ArrowRight, X } from 'lucide-react';
import type { SiteGoalId, SitePurposeId } from '@/lib/types/domain';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import { goalsForGroup } from '@/lib/onboarding/site-goal';
import { cn } from '../../ui';
import { useToast } from '../../toast';
import { Chip, Field, StepIntro, obInput, useSurveyUx, type SurveyForm } from './shared';

const TONE_CHIPS = ['고급스러운', '미니멀', '친근한', '대담한', '차분한', '러스틱', '모던'];

/** 자랑거리 예시 칩 — 목적 그룹별 살짝 다른 예시(레지스트리 없음 → 로컬 큐레이션) */
const HIGHLIGHT_EXAMPLES: Record<string, string[]> = {
  sell: ['전 제품 국내산', '당일 발송', '100% 수제', '리뷰 4.9점'],
  serve: ['20년 경력', '예약 필수 맛집', '주차 가능', '반려동물 동반 가능'],
  promote: ['업력 15년', '누적 500건 시공', '대기업 납품 이력', '특허 보유'],
  content: ['수강생 만족도 98%', '누적 1만 명 수강', '평생 소장', '1:1 피드백'],
};

export function Step07Direction() {
  const { watch, setValue, register, formState } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const { goTo } = useSurveyUx();
  const purposeId = watch('purposeId') as SitePurposeId | '';
  const siteGoal = watch('siteGoal');
  const highlights = watch('highlights') ?? [];
  const tone = watch('tone') ?? [];
  const facts = watch('factualAnswers') ?? [];
  const conversionKind = watch('conversionKind');
  const conversionUrl = watch('conversionUrl') ?? '';
  const [draft, setDraft] = useState('');

  const group = purposeId ? findPurpose(purposeId)?.group : undefined;
  const goals = group ? goalsForGroup(group) : [];
  const examples = group ? HIGHLIGHT_EXAMPLES[group] ?? [] : [];
  const phone = facts.find((fact) => fact.key === 'phone' && fact.value.trim())?.value.trim();

  const chooseGoal = (goal: SiteGoalId) => {
    setValue('siteGoal', goal, { shouldValidate: true });
    if (goal === 'call') setValue('conversionKind', 'phone_fact');
    else if (goal === 'reserve') setValue('conversionKind', 'reservation_url');
    else if (goal === 'kakao_inquiry') setValue('conversionKind', 'contact_form');
    else setValue('conversionKind', undefined);
    if (goal !== 'reserve' && goal !== 'kakao_inquiry') setValue('conversionUrl', '');
  };

  const addHighlight = (value: string) => {
    const v = value.trim().slice(0, 40);
    if (!v) return;
    if (highlights.includes(v)) return;
    if (highlights.length >= 3) {
      toast('info', '자랑거리는 최대 3개까지 넣을 수 있어요.');
      return;
    }
    setValue('highlights', [...highlights, v], { shouldValidate: true });
  };

  const removeHighlight = (value: string) =>
    setValue('highlights', highlights.filter((h) => h !== value), { shouldValidate: true });

  const toggleTone = (chip: string) => {
    if (tone.includes(chip)) {
      setValue('tone', tone.filter((t) => t !== chip), { shouldValidate: true });
    } else if (tone.length >= 2) {
      toast('info', '분위기는 최대 2개까지 고를 수 있어요.');
    } else {
      setValue('tone', [...tone, chip], { shouldValidate: true });
    }
  };

  return (
    <div className="space-y-8">
      <StepIntro>
        방문자가 할 행동과 강조할 장점, 분위기를 정해요. 이걸로 주 버튼 문구와 강조 섹션이 정해져요.
      </StepIntro>

      <div className="grid gap-4 rounded-ob border border-ob-border bg-ob-bg p-4 sm:p-5">
        <Field label={<>누구를 설득하는 홈페이지인가요? <span className="font-normal text-ob-muted">(선택)</span></>}>
          <textarea
            {...register('targetCustomer')}
            rows={2}
            placeholder="예: 복잡한 문제를 처음 상담하려는 소상공인에게 필요한 내용을 전합니다."
            className={cn(obInput, 'resize-y leading-relaxed')}
          />
        </Field>
        <Field label={<>방문자는 무엇을 가장 알고 싶어 하나요? <span className="font-normal text-ob-muted">(선택)</span></>}>
          <textarea
            {...register('visitorNeed')}
            rows={2}
            placeholder="예: 상담 가능한 업무와 준비할 자료를 먼저 알고 싶어 합니다."
            className={cn(obInput, 'resize-y leading-relaxed')}
          />
        </Field>
        <Field
          label={<>왜 이곳이어야 하나요? <span className="font-normal text-ob-muted">(선택)</span></>}
          hint="수상·수치 같은 증명 가능한 사실 대신, 지키고 싶은 태도와 가치를 적어주세요."
        >
          <textarea
            {...register('valueProposition')}
            rows={2}
            placeholder="예: 어려운 내용을 이해하기 쉬운 말로 차분히 안내합니다."
            className={cn(obInput, 'resize-y leading-relaxed')}
          />
        </Field>
      </div>

      <Field label="방문자가 뭘 해주면 성공인가요?">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {goals.map(({ id, def }) => {
            const selected = siteGoal === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => chooseGoal(id as SiteGoalId)}
                aria-pressed={selected}
                className={cn(
                  'flex flex-col rounded-ob border p-3.5 text-left transition-colors',
                  selected
                    ? 'border-ob-accent-strong bg-ob-accent-soft ring-1 ring-ob-accent'
                    : 'border-ob-border bg-ob-surface hover:border-ob-muted',
                )}
              >
                <span
                  className={cn(
                    'text-[15px] font-semibold',
                    selected ? 'text-ob-accent-strong' : 'text-ob-ink',
                  )}
                >
                  {def.label}
                </span>
                <span className="mt-1 text-[13px] leading-relaxed text-ob-muted">{def.description}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {siteGoal === 'call' ? (
        <div className="rounded-ob border border-ob-border bg-ob-bg p-4 text-[13px] leading-relaxed text-ob-muted">
          {phone ? (
            <>주 버튼을 앞에서 입력한 연락처 <strong className="text-ob-ink">{phone}</strong>에 연결합니다. 다시 입력할 필요가 없어요.</>
          ) : (
            <button type="button" onClick={() => goTo(3)} className="inline-flex items-center gap-1 font-medium text-ob-accent-strong">
              연락처를 입력해야 전화 버튼이 작동해요 · 입력하러 가기 <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : null}

      {siteGoal === 'reserve' ? (
        <Field label="실제 예약 페이지 주소" hint="네이버 예약·카카오 채널·캐치테이블·테이블링 등의 https 주소를 연결합니다.">
          <input
            value={conversionUrl}
            onChange={(event) => setValue('conversionUrl', event.target.value, { shouldValidate: false })}
            placeholder="https://booking.naver.com/..."
            inputMode="url"
            autoComplete="url"
            className={obInput}
          />
        </Field>
      ) : null}

      {siteGoal === 'kakao_inquiry' ? (
        <Field label="문의받을 곳">
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['contact_form', '홈페이지 문의 폼'],
              ['messenger_url', '메신저 링크'],
            ] as const).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setValue('conversionKind', kind);
                  if (kind === 'contact_form') setValue('conversionUrl', '');
                }}
                aria-pressed={conversionKind === kind}
                className={cn(
                  'rounded-ob border px-4 py-3 text-left text-[14px]',
                  conversionKind === kind ? 'border-ob-accent-strong bg-ob-accent-soft text-ob-accent-strong' : 'border-ob-border bg-ob-surface text-ob-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {conversionKind === 'messenger_url' ? (
            <input
              value={conversionUrl}
              onChange={(event) => setValue('conversionUrl', event.target.value, { shouldValidate: false })}
              placeholder="https://pf.kakao.com/..."
              inputMode="url"
              autoComplete="url"
              className={cn(obInput, 'mt-3')}
            />
          ) : null}
        </Field>
      ) : null}

      <Field
        label={
          <>
            우리 가게 자랑거리 <span className="font-normal text-ob-muted">(1~3개)</span>
          </>
        }
        hint="사실만 적어주세요. AI가 지어내지 않고 이 표현을 살려서 써요."
      >
        {examples.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {examples.map((ex) => (
              <Chip key={ex} selected={highlights.includes(ex)} onClick={() => addHighlight(ex)}>
                + {ex}
              </Chip>
            ))}
          </div>
        ) : null}

        {highlights.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {highlights.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1.5 rounded-full border border-ob-accent-strong bg-ob-accent-soft px-3 py-1.5 text-[13px] text-ob-accent-strong"
              >
                {h}
                <button type="button" onClick={() => removeHighlight(h)} aria-label={`${h} 제거`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addHighlight(draft);
                setDraft('');
              }
            }}
            maxLength={40}
            placeholder="예: 3대째 이어온 손맛"
            className={obInput}
            disabled={highlights.length >= 3}
          />
          <button
            type="button"
            onClick={() => {
              addHighlight(draft);
              setDraft('');
            }}
            disabled={!draft.trim() || highlights.length >= 3}
            className="shrink-0 rounded-ob border border-ob-border bg-ob-surface px-4 text-[15px] text-ob-ink transition-colors hover:border-ob-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </Field>

      <Field
        label={
          <>
            분위기(톤) <span className="font-normal text-ob-muted">(최대 2개)</span>
          </>
        }
        error={formState.errors.tone?.message as string | undefined}
      >
        <div className="flex flex-wrap gap-2">
          {TONE_CHIPS.map((chip) => (
            <Chip key={chip} selected={tone.includes(chip)} onClick={() => toggleTone(chip)}>
              {chip}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  );
}
