'use client';

/**
 * S2 무엇을 하는 곳인가요 — 목적 → 업종 → 상호명 → 지역 → 한 줄 소개.
 */
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import { capabilityOf } from '@/lib/onboarding/purpose-capabilities';
import type { LivePurposeId, SitePurposeId } from '@/lib/types/domain';
import { cn } from '../../ui';
import { Chip, Field, SelectCard, StepIntro, obInput, type SurveyForm } from './shared';

// [제품 확정] 소개형 6종만 노출 — 3그룹(손님 받기 / 알리기 / 초간단)으로 단순화.
// taxonomy.group에 의존하지 않고 명시 목록으로 구성(제거 4종은 애초에 목록에 없음).
const DISPLAY_GROUPS: { label: string; hint: string; ids: LivePurposeId[] }[] = [
  { label: "receiving guests", hint: "Place for visits, inquiries, and consultations", ids: ['local_store', 'booking_service', 'edu_membership'] },
  { label: "inform", hint: "A place to introduce the company and work", ids: ['company_brand', 'portfolio'] },
];
const SPECIAL_GROUP: { label: string; hint: string; ids: LivePurposeId[] } = {
  label: "Super simple",
  hint: "Profile and link on one page",
  ids: ['one_page'],
};

export function Step01Basics() {
  const { watch, setValue, register, formState } = useFormContext<SurveyForm>();
  const errors = formState.errors;
  const purposeId = watch('purposeId') as SitePurposeId | '';
  const industry = watch('industry');

  const selectedPurpose = purposeId ? findPurpose(purposeId) : undefined;
  const industryChips = useMemo(() => selectedPurpose?.industries ?? [], [selectedPurpose]);

  const pickPurpose = (id: SitePurposeId) => setValue('purposeId', id, { shouldValidate: true });

  return (
    <div className="space-y-7">
      <StepIntro>
        Here, you decide on the overall structure and first screen of the site based on the purpose and industry you choose.
      </StepIntro>

      <Field label="What site is it?" error={errors.purposeId?.message as string | undefined}>
        <div className="space-y-5">
          {DISPLAY_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-ob-ink">{g.label}</span>
                <span className="text-xs text-ob-muted">{g.hint}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {g.ids.map((id) => {
                  const def = findPurpose(id);
                  if (!def) return null;
                  return (
                    <SelectCard key={id} selected={purposeId === id} onClick={() => pickPurpose(id)} ariaLabel={def.label}>
                      <span className={cn('text-sm font-semibold', purposeId === id ? 'text-ob-accent-strong' : 'text-ob-ink')}>
                        {def.label}
                      </span>
                      <span className="mt-1.5 text-xs leading-relaxed text-ob-muted">
                        {capabilityOf(id).features.slice(0, 3).join(' · ')}
                      </span>
                    </SelectCard>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-xs font-medium text-ob-muted">{SPECIAL_GROUP.label}</span>
              <span className="text-xs text-ob-muted">{SPECIAL_GROUP.hint}</span>
              <span className="h-px flex-1 bg-ob-border" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SPECIAL_GROUP.ids.map((id) => {
                const def = findPurpose(id);
                if (!def) return null;
                return (
                  <SelectCard key={id} selected={purposeId === id} onClick={() => pickPurpose(id)} ariaLabel={def.label}>
                    <span className={cn('text-sm font-semibold', purposeId === id ? 'text-ob-accent-strong' : 'text-ob-ink')}>
                      {def.label}
                    </span>
                    <span className="mt-1.5 text-xs leading-relaxed text-ob-muted">
                      {capabilityOf(id).features.slice(0, 3).join(' · ')}
                    </span>
                  </SelectCard>
                );
              })}
            </div>
          </div>
        </div>
      </Field>

      <Field label="Industry" error={errors.industry?.message}>
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
          <p className="mb-2 text-[13px] text-ob-muted">When you first select a purpose, industry examples will appear.</p>
        )}
        <input {...register('industry')} placeholder="You can enter it directly" className={obInput} />
      </Field>

      <Field label="business name" error={errors.businessName?.message}>
        <input
          {...register('businessName')}
          placeholder="Example: Haru Pilates, Riverside Studio"
          className={obInput}
        />
      </Field>

      <Field
        label={<>region <span className="text-ob-danger">*</span></>}
        error={errors.region?.message}
        hint="If you write down your neighborhood or city, it will be reflected in phrases aimed at local customers."
      >
        <input {...register('region')} placeholder="Example: Seongsu-dong, Seoul, Haeundae, Busan" className={obInput} />
      </Field>

      <Field
        label={
          <>
            one line introduction <span className="font-normal text-ob-muted">(select)</span>
          </>
        }
        error={errors.tagline?.message}
        hint="If you leave it blank, we will use an honest introductory sentence that fits your target/value proposition and industry."
      >
        <input {...register('tagline')} placeholder="Example: Time to create daily balance." className={obInput} />
      </Field>
    </div>
  );
}
