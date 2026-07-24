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

const TONE_CHIPS = ['고급스러운', '미니멀', '친근한', '대담한', '차분한', '러스틱', '모던'];

const PROOF_KINDS: readonly { value: SurveyForm['proofItems'][number]['kind']; label: string }[] = [
  { value: 'qualification', label: '자격' },
  { value: 'experience', label: '경력' },
  { value: 'award', label: '수상' },
  { value: 'testimonial', label: '후기' },
  { value: 'metric', label: '수치' },
  { value: 'case', label: '사례' },
];

const PROOF_SOURCE_STATUSES: readonly {
  value: SurveyForm['proofItems'][number]['sourceStatus'];
  label: string;
}[] = [
  { value: 'customer_confirmed', label: '직접 입력 확인' },
  { value: 'evidence_available', label: '보유 자료 있음' },
  { value: 'publication_permission', label: '게시 허락받음' },
];

export function ProofFields() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { nudgeResult } = useSurveyUx();
  const proofItems = watch('proofItems') ?? [];

  return (
    <Field
      label={<>출처 있는 신뢰 요소 <span className="font-normal text-ob-muted">(선택)</span></>}
      hint="고객님이 확인한 내용만 넣습니다. 출처 상태는 내부 확인용이고, 원문·발행 주체·기준일은 입력하면 홈페이지에 함께 표시돼요."
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
                aria-label={`신뢰 요소 ${index + 1} 종류`}
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
                placeholder="고객님이 확인한 실제 내용"
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
                aria-label={`신뢰 요소 ${index + 1} 출처 상태`}
                className={obInput}
              >
                {PROOF_SOURCE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setValue('proofItems', proofItems.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={`신뢰 요소 ${index + 1} 삭제`}
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
                    placeholder="원문 https 주소"
                    aria-label={`수치 ${index + 1} 원문 주소`}
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
                    placeholder="발행 주체"
                    aria-label={`수치 ${index + 1} 발행 주체`}
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
                    aria-label={`수치 ${index + 1} 기준일`}
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
          신뢰 요소 추가
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
      toast('info', '분위기는 최대 2개까지 고를 수 있어요.');
    } else {
      setValue('tone', [...tone, chip], { shouldValidate: true });
    }
  };

  return (
    <div className="space-y-8">
      {showCore ? (
        <StepIntro>
          누구를 설득하고 어떤 행동으로 이어갈지 정해요. 핵심 답만으로 먼저 홈페이지 구성을 보여드릴게요.
        </StepIntro>
      ) : null}

      {showCore ? <><div className="grid gap-4 rounded-ob border border-ob-border bg-ob-bg p-4 sm:p-5">
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
      </Field></> : null}

      {showProof ? <ProofFields /> : null}
    </div>
  );
}
