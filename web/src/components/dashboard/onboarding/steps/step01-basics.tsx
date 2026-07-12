'use client';

/**
 * S1 무엇을 하는 곳인가요 — 목적(4묶음+특수) → 업종(칩/자유입력) → 상호명 → 지역(선택) → 한 줄 소개(선택).
 */
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { PURPOSES, findPurpose, type PurposeGroup } from '@/lib/data/purpose-taxonomy';
import type { SitePurposeId } from '@/lib/types/domain';
import { cn } from '../../ui';
import { Chip, Field, SelectCard, StepIntro, obInput, type SurveyForm } from './shared';

const GROUP_ORDER: { group: PurposeGroup; label: string; hint: string }[] = [
  { group: 'sell', label: '팔기', hint: '상품·서비스를 판매' },
  { group: 'serve', label: '손님 받기', hint: '예약·방문·문의를 받기' },
  { group: 'promote', label: '알리기', hint: '회사·작업·행사를 소개' },
  { group: 'content', label: '콘텐츠·멤버십', hint: '콘텐츠 발행·회원 운영' },
];

const SPECIAL_PURPOSE_IDS: SitePurposeId[] = ['event', 'one_page'];

export function Step01Basics() {
  const { watch, setValue, register, formState } = useFormContext<SurveyForm>();
  const errors = formState.errors;
  const purposeId = watch('purposeId') as SitePurposeId | '';
  const industry = watch('industry');

  const selectedPurpose = purposeId ? findPurpose(purposeId) : undefined;
  const industryChips = useMemo(() => selectedPurpose?.industries ?? [], [selectedPurpose]);

  const grouped = GROUP_ORDER.map((g) => ({
    ...g,
    items: PURPOSES.filter((p) => p.group === g.group && !SPECIAL_PURPOSE_IDS.includes(p.id)),
  }));
  const special = PURPOSES.filter((p) => SPECIAL_PURPOSE_IDS.includes(p.id));

  const pickPurpose = (id: SitePurposeId) => setValue('purposeId', id, { shouldValidate: true });

  return (
    <div className="space-y-7">
      <StepIntro>
        여기서 고른 목적과 업종으로 사이트의 큰 구성과 첫 화면을 정해요.
      </StepIntro>

      <Field label="어떤 사이트인가요?" error={errors.purposeId?.message as string | undefined}>
        <div className="space-y-5">
          {grouped.map((g) =>
            g.items.length === 0 ? null : (
              <div key={g.group}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-ob-ink">{g.label}</span>
                  <span className="text-xs text-ob-muted">{g.hint}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {g.items.map((def) => (
                    <SelectCard
                      key={def.id}
                      selected={purposeId === def.id}
                      onClick={() => pickPurpose(def.id)}
                      ariaLabel={def.label}
                    >
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          purposeId === def.id ? 'text-ob-accent-strong' : 'text-ob-ink',
                        )}
                      >
                        {def.label}
                      </span>
                      <span className="mt-1.5 text-xs leading-relaxed text-ob-muted">
                        {def.features.slice(0, 3).join(' · ')}
                      </span>
                    </SelectCard>
                  ))}
                </div>
              </div>
            ),
          )}

          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-xs font-medium text-ob-muted">특수 목적</span>
              <span className="h-px flex-1 bg-ob-border" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {special.map((def) => (
                <SelectCard
                  key={def.id}
                  selected={purposeId === def.id}
                  onClick={() => pickPurpose(def.id)}
                  ariaLabel={def.label}
                >
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      purposeId === def.id ? 'text-ob-accent-strong' : 'text-ob-ink',
                    )}
                  >
                    {def.label}
                  </span>
                  <span className="mt-1.5 text-xs leading-relaxed text-ob-muted">
                    {def.features.slice(0, 3).join(' · ')}
                  </span>
                </SelectCard>
              ))}
            </div>
          </div>
        </div>
      </Field>

      <Field label="업종" error={errors.industry?.message}>
        {selectedPurpose ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {industryChips.map((chip) => (
              <Chip
                key={chip}
                selected={industry === chip}
                onClick={() => setValue('industry', chip, { shouldValidate: true })}
              >
                {chip}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="mb-2 text-[13px] text-ob-muted">먼저 목적을 고르면 업종 예시가 나타나요.</p>
        )}
        <input {...register('industry')} placeholder="직접 입력해도 돼요" className={obInput} />
      </Field>

      <Field label="상호명" error={errors.businessName?.message}>
        <input
          {...register('businessName')}
          placeholder="예: 하루필라테스, 리버사이드 스튜디오"
          className={obInput}
        />
      </Field>

      <Field
        label={
          <>
            지역 <span className="font-normal text-ob-muted">(선택)</span>
          </>
        }
        hint="동네·도시를 적어주시면 지역 손님을 겨냥한 문구에 반영돼요."
      >
        <input {...register('region')} placeholder="예: 서울 성수동, 부산 해운대" className={obInput} />
      </Field>

      <Field
        label={
          <>
            한 줄 소개 <span className="font-normal text-ob-muted">(선택)</span>
          </>
        }
        error={errors.tagline?.message}
        hint="비워두시면 AI가 지어드려요."
      >
        <input {...register('tagline')} placeholder="예: 매일의 균형을 만드는 시간" className={obInput} />
      </Field>
    </div>
  );
}
