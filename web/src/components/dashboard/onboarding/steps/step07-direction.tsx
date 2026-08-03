'use client';

/**
 * S7 방향 잡기 — 전략 브리프 + 실제 전환 목적지 + 출처 있는 증거 + tone(최대 2).
 */
import { useFormContext } from 'react-hook-form';
import { ArrowRight, Plus, X } from 'lucide-react';
import type { SiteGoalId, SitePurposeId } from '@/lib/types/domain';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import { goalsForGroup } from '@/lib/onboarding/site-goal';
import { cn } from '../../ui';
import { useToast } from '../../toast';
import { NudgeBadge } from '../onboarding-nudge';
import { Chip, Field, StepIntro, obInput, useSurveyUx, type SurveyForm } from './shared';

const TONE_CHIPS = ["luxurious", "minimalist", "friendly", "bold", "tranquil", "rustic", "modern"];

const PROOF_KINDS: readonly { value: SurveyForm['proofItems'][number]['kind']; label: string }[] = [
  { value: 'qualification', label: "qualifications" },
  { value: 'experience', label: "personal history" },
  { value: 'award', label: "premier" },
  { value: 'testimonial', label: "Reviews" },
  { value: 'metric', label: "black eye" },
  { value: 'case', label: "example" },
];

const PROOF_SOURCE_STATUSES: readonly {
  value: SurveyForm['proofItems'][number]['sourceStatus'];
  label: string;
}[] = [
  { value: 'customer_confirmed', label: "Check direct input" },
  { value: 'evidence_available', label: "Data available" },
  { value: 'publication_permission', label: "Permission to post" },
];

export function ProofFields() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { nudgeResult } = useSurveyUx();
  const proofItems = watch('proofItems') ?? [];

  return (
    <Field
      label={<>Sourced Trust Factor <span className="font-normal text-ob-muted">(select)</span></>}
      hint="We only include information that you have confirmed. The source status is for internal verification purposes, and the original text, publisher, and base date are displayed on the homepage when you enter them."
    >
      <div className="space-y-3">
        {proofItems.map((proof, index) => (
          <div key={`${index}-${proof.kind}`} className="rounded-ob border border-ob-border bg-ob-bg p-3">
            <div className="grid gap-2 sm:grid-cols-[140px_1fr_160px_44px]">
              <select
                value={proof.kind}
                onChange={(event) => setValue(
                  'proofItems',
                  proofItems.map((item, itemIndex) => itemIndex === index
                    ? { ...item, kind: event.target.value as SurveyForm['proofItems'][number]['kind'] }
                    : item),
                )}
                aria-label={`trust factor${index + 1}type`}
                className={obInput}
              >
                {PROOF_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
              <input
                value={proof.content}
                onChange={(event) => setValue(
                  'proofItems',
                  proofItems.map((item, itemIndex) => itemIndex === index
                    ? { ...item, content: event.target.value }
                    : item),
                )}
                maxLength={500}
                placeholder="Actual information confirmed by the customer"
                className={obInput}
              />
              <select
                value={proof.sourceStatus}
                onChange={(event) => setValue(
                  'proofItems',
                  proofItems.map((item, itemIndex) => itemIndex === index
                    ? { ...item, sourceStatus: event.target.value as SurveyForm['proofItems'][number]['sourceStatus'] }
                    : item),
                )}
                aria-label={`trust factor${index + 1}source states`}
                className={obInput}
              >
                {PROOF_SOURCE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setValue('proofItems', proofItems.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={`trust factor${index + 1}Delete`}
                className="flex h-11 w-11 items-center justify-center rounded-ob border border-ob-border text-ob-muted hover:border-ob-danger hover:text-ob-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {proof.kind === 'metric' ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input
                    type="url"
                    value={proof.sourceUrl ?? ''}
                    onChange={(event) => setValue(
                      'proofItems',
                      proofItems.map((item, itemIndex) => itemIndex === index
                        ? { ...item, sourceUrl: event.target.value }
                        : item),
                    )}
                    maxLength={1000}
                    placeholder="Original https address"
                    aria-label={`black eye${index + 1}Original address`}
                    className={obInput}
                  />
                  <input
                    value={proof.publisher ?? ''}
                    onChange={(event) => setValue(
                      'proofItems',
                      proofItems.map((item, itemIndex) => itemIndex === index
                        ? { ...item, publisher: event.target.value }
                        : item),
                    )}
                    maxLength={120}
                    placeholder="Issued by"
                    aria-label={`black eye${index + 1}Issued by`}
                    className={obInput}
                  />
                  <input
                    type="date"
                    value={proof.asOfDate ?? ''}
                    onChange={(event) => setValue(
                      'proofItems',
                      proofItems.map((item, itemIndex) => itemIndex === index
                        ? { ...item, asOfDate: event.target.value }
                        : item),
                    )}
                    aria-label={`black eye${index + 1}base date`}
                    className={obInput}
                  />
                </div>
                <NudgeBadge id="metric-source" result={nudgeResult} />
              </>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setValue('proofItems', [
            ...proofItems,
            { kind: 'qualification', content: '', sourceStatus: 'customer_confirmed' },
          ])}
          disabled={proofItems.length >= 20}
          className="inline-flex h-11 items-center gap-1.5 rounded-ob border border-dashed border-ob-border px-4 text-[14px] text-ob-muted hover:border-ob-muted hover:text-ob-ink disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add trust element
        </button>
      </div>
    </Field>
  );
}

export function Step07Direction({ mode = 'all' }: { mode?: 'all' | 'core' | 'proof' }) {
  const { watch, setValue, register, formState } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const { goTo } = useSurveyUx();
  const purposeId = watch('purposeId') as SitePurposeId | '';
  const siteGoal = watch('siteGoal');
  const tone = watch('tone') ?? [];
  const facts = watch('factualAnswers') ?? [];
  const conversionKind = watch('conversionKind');
  const conversionUrl = watch('conversionUrl') ?? '';
  const showCore = mode !== 'proof';
  const showProof = mode !== 'core';

  const group = purposeId ? findPurpose(purposeId)?.group : undefined;
  const goals = group ? goalsForGroup(group) : [];
  const phone = facts.find((fact) => fact.key === 'phone' && fact.value.trim())?.value.trim();

  const chooseGoal = (goal: SiteGoalId) => {
    setValue('siteGoal', goal, { shouldValidate: true });
    if (goal === 'call') setValue('conversionKind', 'phone_fact');
    else if (goal === 'reserve') setValue('conversionKind', 'reservation_url');
    else if (goal === 'kakao_inquiry') setValue('conversionKind', 'contact_form');
    else setValue('conversionKind', undefined);
    if (goal !== 'reserve' && goal !== 'kakao_inquiry') setValue('conversionUrl', '');
  };

  const toggleTone = (chip: string) => {
    if (tone.includes(chip)) {
      setValue('tone', tone.filter((t) => t !== chip), { shouldValidate: true });
    } else if (tone.length >= 2) {
      toast('info', "You can choose up to two atmospheres.");
    } else {
      setValue('tone', [...tone, chip], { shouldValidate: true });
    }
  };

  return (
    <div className="space-y-8">
      {showCore ? (
        <StepIntro>
          Decide who to persuade and what actions to follow. I will first show you the homepage structure with only the key answers.
        </StepIntro>
      ) : null}

      {showCore ? <><div className="grid gap-4 rounded-ob border border-ob-border bg-ob-bg p-4 sm:p-5">
        <Field label={<>Who is this website persuading? <span className="font-normal text-ob-muted">(select)</span></>}>
          <textarea
            {...register('targetCustomer')}
            rows={2}
            placeholder="Example: Provide information to small business owners who want to discuss complex issues for the first time."
            className={cn(obInput, 'resize-y leading-relaxed')}
          />
        </Field>
        <Field label={<>What do visitors most want to know? <span className="font-normal text-ob-muted">(select)</span></>}>
          <textarea
            {...register('visitorNeed')}
            rows={2}
            placeholder="Example: I would like to know first what tasks can be consulted and what materials to prepare."
            className={cn(obInput, 'resize-y leading-relaxed')}
          />
        </Field>
        <Field
          label={<>Why should it be here? <span className="font-normal text-ob-muted">(select)</span></>}
          hint="Instead of provable facts like awards and figures, please write down the attitude and values ​​you want to uphold."
        >
          <textarea
            {...register('valueProposition')}
            rows={2}
            placeholder="Example: Calmly explaining difficult topics in easy-to-understand language."
            className={cn(obInput, 'resize-y leading-relaxed')}
          />
        </Field>
      </div>

      <Field label="What does a visitor do to make it successful?">
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
            <>Contact information entered earlier on the main button <strong className="text-ob-ink">{phone}</strong>Connect to . No need to re-enter it.</>
          ) : (
            <button type="button" onClick={() => goTo(3)} className="inline-flex items-center gap-1 font-medium text-ob-accent-strong">
              The phone button does not work until you enter your contact information. Go to enter <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : null}

      {siteGoal === 'reserve' ? (
        <Field label="Verified booking page" hint="Enter the clinic's verified HTTPS booking destination.">
          <input
            value={conversionUrl}
            onChange={(event) => setValue('conversionUrl', event.target.value, { shouldValidate: false })}
            placeholder="https://booking.example.com/..."
            inputMode="url"
            autoComplete="url"
            className={obInput}
          />
        </Field>
      ) : null}

      {siteGoal === 'kakao_inquiry' ? (
        <Field label="Inquiry destination" hint="Website inquiries are delivered to the dashboard inbox.">
          <button
            type="button"
            onClick={() => {
              setValue('conversionKind', 'contact_form');
              setValue('conversionUrl', '');
            }}
            aria-pressed={conversionKind === 'contact_form'}
            className="w-full rounded-ob border border-ob-accent-strong bg-ob-accent-soft px-4 py-3 text-left text-[14px] text-ob-accent-strong"
          >
            Website inquiry form
          </button>
        </Field>
      ) : null}

      <Field
        label={
          <>
            Mood (tone) <span className="font-normal text-ob-muted">(maximum 2)</span>
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
      </Field></> : null}

      {showProof ? <ProofFields /> : null}
    </div>
  );
}
