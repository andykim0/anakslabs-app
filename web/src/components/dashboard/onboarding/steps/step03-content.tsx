'use client';

/**
 * S3 콘텐츠 입력 — 구조화 항목(메뉴·시술·수업·서비스·작업·링크) 행 입력 + 사진 OCR 자동 채우기 +
 * 자유 원문(providedContent). 목적별 필수 게이트(content-requirements)를 안내한다.
 * 실제 진행 차단은 survey-step goNext(step 3)에서 수행.
 */
import { useRef, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { CheckCircle2, ImagePlus, Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import type { LivePurposeId } from '@/lib/types/domain';
import { factQuestionsForIndustry, faqQuestionsForIndustry } from '@/lib/content/content-depth';
import { contentGateStatus, requirementOf } from '@/lib/onboarding/content-requirements';
import { cn } from '../../ui';
import { extractMenuFromImage, uploadImage, uploadImageWithAssetRef } from '../../api';
import { useToast } from '../../toast';
import { Chip, Field, StepIntro, obInput, useSurveyUx, type SurveyForm } from './shared';

const TEMPLATES: { label: string; heading: string }[] = [
  { label: '소개', heading: '[소개]\n' },
  { label: '메뉴·가격', heading: '[메뉴·가격]\n' },
  { label: '영업 정보', heading: '[영업 정보]\n영업시간: \n휴무: \n주차: \n' },
  { label: '하고 싶은 말', heading: '[하고 싶은 말]\n' },
];

/** 받침 유무로 조사(이/가·을/를)를 골라 자연스러운 한국어를 만든다. */
function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code = word.charCodeAt(word.length - 1);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${word}${hasBatchim ? withBatchim : withoutBatchim}`;
}

/** 항목 한 줄의 사진 슬롯 (행별 업로드 상태 격리). */
function ContentRowPhoto({ index }: { index: number }) {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const { siteId, assetPolicyV2Ready } = useSurveyUx();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = watch(`contentItems.${index}.photoUrl`) ?? '';
  const assetRef = watch(`contentItems.${index}.photoAssetRef`);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadImageWithAssetRef(file, siteId);
      if (assetRef) {
        const personIds = watch('personPhotoAssetIds') ?? [];
        const nonPersonIds = watch('nonPersonPhotoAssetIds') ?? [];
        setValue(
          'personPhotoAssetIds',
          personIds.filter((assetId) => assetId !== assetRef.assetId),
          { shouldValidate: false },
        );
        setValue(
          'nonPersonPhotoAssetIds',
          nonPersonIds.filter((assetId) => assetId !== assetRef.assetId),
          { shouldValidate: false },
        );
      }
      setValue(`contentItems.${index}.photoUrl`, uploaded.url, { shouldValidate: false });
      setValue(`contentItems.${index}.photoAssetRef`, uploaded.assetRef, { shouldValidate: false });
      if (assetRef || uploaded.assetRef) {
        // The recorded attestation covers an exact asset set; replacing a member invalidates it.
        setValue('generalAssetAttestationId', undefined, { shouldValidate: false });
      }
      if (assetPolicyV2Ready && !uploaded.assetRef) {
        toast('info', '사진은 올렸지만 직접 업로드 자산 참조가 없어 실사 사진 방향에는 사용할 수 없어요.');
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '사진 업로드에 실패했어요.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      {url ? (
        <span className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="항목 사진" className="h-14 w-14 rounded-ob border border-ob-border object-cover" />
          <button
            type="button"
            onClick={() => {
              setValue(`contentItems.${index}.photoUrl`, '', { shouldValidate: false });
              setValue(`contentItems.${index}.photoAssetRef`, undefined, { shouldValidate: false });
              if (assetRef) {
                setValue('generalAssetAttestationId', undefined, { shouldValidate: false });
                const personIds = watch('personPhotoAssetIds') ?? [];
                const nonPersonIds = watch('nonPersonPhotoAssetIds') ?? [];
                setValue(
                  'personPhotoAssetIds',
                  personIds.filter((assetId) => assetId !== assetRef.assetId),
                  { shouldValidate: false },
                );
                setValue(
                  'nonPersonPhotoAssetIds',
                  nonPersonIds.filter((assetId) => assetId !== assetRef.assetId),
                  { shouldValidate: false },
                );
              }
            }}
            aria-label="사진 제거"
            className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ob-ink text-white transition-colors hover:bg-ob-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="항목 사진 올리기"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-ob border border-dashed border-ob-border text-ob-muted transition-colors hover:border-ob-muted hover:text-ob-ink disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files)}
      />
    </>
  );
}

export function Step03Content() {
  const { control, register, watch, setValue, getValues, formState } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const { importedBadge } = useSurveyUx();

  const purposeId = ((watch('purposeId') as LivePurposeId) || 'local_store') as LivePurposeId;
  const industry = watch('industry') ?? '';
  const req = requirementOf(purposeId);
  const itemLabel = req.itemLabel;
  const showPrice = req.fields.price !== 'hidden';

  const { fields, append, remove } = useFieldArray({ control, name: 'contentItems' });

  const watchedItems = watch('contentItems') ?? [];
  const filledCount = watchedItems.filter((it) => (it?.name ?? '').trim().length > 0).length;
  const gate = contentGateStatus(purposeId, filledCount);
  const factualAnswers = watch('factualAnswers') ?? [];
  const factQuestions = factQuestionsForIndustry(industry);
  const factsByKey = new Map(factualAnswers.map((answer) => [answer.key, answer]));
  const answeredFactCount = factQuestions.filter((question) => factsByKey.get(question.key)?.value.trim()).length;
  const factProgress = Math.round((answeredFactCount / factQuestions.length) * 100);
  const faqAnswers = watch('faqAnswers') ?? [];
  const faqQuestions = faqQuestionsForIndustry(industry);
  const faqAnswersById = new Map(faqAnswers.map((answer) => [answer.questionId, answer.answer]));
  const answeredFaqCount = faqQuestions.filter((question) => faqAnswersById.get(question.id)?.trim()).length;

  const setFactAnswer = (key: (typeof factQuestions)[number]['key'], value: string) => {
    const next = [...(getValues('factualAnswers') ?? [])];
    const index = next.findIndex((answer) => answer.key === key);
    if (index >= 0) {
      next[index] = { key, value, source: 'customer' };
    } else {
      next.push({ key, value, source: 'customer' });
    }
    setValue('factualAnswers', next, { shouldValidate: false });
  };

  const setFaqAnswer = (questionId: string, answer: string) => {
    const next = [...(getValues('faqAnswers') ?? [])];
    const index = next.findIndex((item) => item.questionId === questionId);
    if (index >= 0) next[index] = { questionId, answer };
    else next.push({ questionId, answer });
    setValue('faqAnswers', next, { shouldValidate: false });
  };

  const removeItem = (index: number) => {
    const removedRef = watchedItems[index]?.photoAssetRef;
    if (removedRef) {
      setValue('generalAssetAttestationId', undefined, { shouldValidate: false });
      const personIds = watch('personPhotoAssetIds') ?? [];
      const nonPersonIds = watch('nonPersonPhotoAssetIds') ?? [];
      setValue(
        'personPhotoAssetIds',
        personIds.filter((assetId) => assetId !== removedRef.assetId),
        { shouldValidate: false },
      );
      setValue(
        'nonPersonPhotoAssetIds',
        nonPersonIds.filter((assetId) => assetId !== removedRef.assetId),
        { shouldValidate: false },
      );
    }
    remove(index);
  };

  const content = watch('providedContent') ?? '';
  const insert = (heading: string) => {
    const base = content.trim();
    const next = (base ? `${base}\n\n${heading}` : heading).slice(0, 5000);
    setValue('providedContent', next, { shouldValidate: true });
  };

  // ── 사진 OCR로 한 번에 채우기 ──────────────────────────────
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const ocrButtonLabel = itemLabel === '메뉴' ? '메뉴판 사진으로 한 번에 채우기' : '사진으로 한 번에 채우기';

  const runOcr = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || ocrLoading) return;
    setOcrLoading(true);
    try {
      const uploadedUrl = await uploadImage(file);
      const extracted = await extractMenuFromImage(uploadedUrl);
      if (extracted.length === 0) {
        toast('info', '사진에서 항목을 못 읽었어요. 직접 입력해 주세요.');
        return;
      }
      const seen = new Set(
        (getValues('contentItems') ?? []).map((it) => (it.name ?? '').trim()).filter(Boolean),
      );
      const toAdd: SurveyForm['contentItems'] = [];
      for (const raw of extracted) {
        const name = (raw.name ?? '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        toAdd.push({
          name,
          price: raw.price?.trim() ?? '',
          description: raw.description?.trim() ?? '',
          photoUrl: raw.photoUrl?.trim() ?? '',
          // OCR output may contain a URL but never inherits direct-upload provenance.
          photoAssetRef: undefined,
        });
      }
      if (toAdd.length === 0) {
        toast('info', '사진 속 항목이 이미 다 들어가 있어요.');
        return;
      }
      append(toAdd);
      toast('success', `${toAdd.length}개 항목을 추가했어요. 확인하고 수정해 주세요.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '사진에서 항목을 읽지 못했어요.');
    } finally {
      setOcrLoading(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-7">
      <StepIntro>
        실제 정보를 많이 알려주실수록 손님과 검색이 읽을 내용이 풍부해져요. 답하지 않은 내용은 지어내지 않습니다.
      </StepIntro>

      <section className="rounded-ob border border-ob-border bg-ob-surface p-4 sm:p-5" aria-labelledby="factual-interview-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="factual-interview-title" className="text-[17px] font-semibold text-ob-ink">
              가게 사실을 알려주세요
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">
              연락처와 영업시간만 필수예요. 나머지는 있으면 답하고, 없으면 건너뛰세요.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-ob-accent-soft px-3 py-1.5 text-[12px] font-medium text-ob-accent-strong">
            {answeredFactCount}/{factQuestions.length}개 답변
          </span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ob-bg" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-ob-accent-strong transition-[width] duration-300"
            style={{ width: `${factProgress}%` }}
          />
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] leading-relaxed text-ob-muted">
          <CheckCircle2 className="h-3.5 w-3.5 text-ob-accent-strong" aria-hidden="true" />
          답할수록 내 홈페이지에 사실 기반 안내와 섹션이 더해져요.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {factQuestions.map((question) => {
            const answer = factsByKey.get(question.key);
            return (
              <Field
                key={question.key}
                label={
                  <>
                    {question.label}{' '}
                    {question.required ? (
                      <span className="text-ob-danger">*</span>
                    ) : (
                      <span className="font-normal text-ob-muted">(선택)</span>
                    )}
                  </>
                }
                hint={question.hint}
              >
                <input
                  value={answer?.value ?? ''}
                  onChange={(event) => setFactAnswer(question.key, event.target.value)}
                  placeholder={question.placeholder}
                  className={obInput}
                />
                {answer?.source === 'customer_import' ? (
                  <span className="mt-1.5 block text-[11px] font-medium text-ob-accent-strong">
                    기존 채널에서 가져온 내용 · 확인하고 고쳐주세요
                  </span>
                ) : null}
              </Field>
            );
          })}
        </div>
      </section>

      <section className="rounded-ob border border-ob-border bg-ob-bg p-4 sm:p-5" aria-labelledby="guided-faq-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="guided-faq-title" className="text-[17px] font-semibold text-ob-ink">
              손님이 자주 묻는 질문
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">
              질문은 준비해 두었어요. 사장님이 답한 질문만 홈페이지와 검색용 질문·답에 들어갑니다.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-ob-surface px-3 py-1.5 text-[12px] font-medium text-ob-muted">
            {answeredFaqCount}/{faqQuestions.length}개 답변 · 모두 선택
          </span>
        </div>
        <div className="mt-5 space-y-4">
          {faqQuestions.map((question) => (
            <Field key={question.id} label={question.question} hint={question.hint}>
              <textarea
                value={faqAnswersById.get(question.id) ?? ''}
                onChange={(event) => setFaqAnswer(question.id, event.target.value)}
                rows={2}
                placeholder="실제 운영 기준에 맞는 답을 적어주세요. 답하지 않으면 홈페이지에 나오지 않아요."
                className={cn(obInput, 'resize-y leading-relaxed')}
              />
            </Field>
          ))}
        </div>
      </section>

      {/* ── 구조화 항목 입력 ── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-[15px] font-medium text-ob-ink">
            {itemLabel} 목록 <span className="text-ob-danger">*</span>
          </label>
          <span className="shrink-0 text-[13px] text-ob-muted">{filledCount}개 입력됨</span>
        </div>

        {/* 사진으로 한 번에 채우기 */}
        <div>
          <button
            type="button"
            onClick={() => ocrInputRef.current?.click()}
            disabled={ocrLoading}
            className="inline-flex h-11 items-center gap-2 rounded-ob border border-ob-accent-strong bg-ob-accent-soft px-4 text-[14px] font-medium text-ob-accent-strong transition-colors hover:bg-ob-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {ocrButtonLabel}
          </button>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ob-muted">
            사진 속 항목을 자동으로 읽어와 채워드려요. 자동 확정이 아니니 읽어온 내용을 확인하고 수정해 주세요.
          </p>
          <input
            ref={ocrInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void runOcr(e.target.files)}
          />
        </div>

        {/* 항목 행 */}
        <div className="space-y-2.5">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-3 rounded-ob border border-ob-border bg-ob-surface p-3">
              <ContentRowPhoto index={index} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    {...register(`contentItems.${index}.name`)}
                    placeholder={`${itemLabel} 이름`}
                    className={cn(obInput, 'min-w-0 flex-1')}
                  />
                  {showPrice ? (
                    <input
                      {...register(`contentItems.${index}.price`)}
                      placeholder="가격 (선택)"
                      inputMode="numeric"
                      className={cn(obInput, 'w-24 shrink-0 sm:w-28')}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    aria-label="항목 삭제"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ob border border-ob-border text-ob-muted transition-colors hover:border-ob-danger hover:text-ob-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  {...register(`contentItems.${index}.description`)}
                  placeholder="한 줄 설명 (선택)"
                  className={obInput}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => append({ name: '', price: '', description: '', photoUrl: '', photoAssetRef: undefined })}
          className="inline-flex h-11 items-center gap-1.5 rounded-ob border border-dashed border-ob-border px-4 text-[14px] text-ob-muted transition-colors hover:border-ob-muted hover:text-ob-ink"
        >
          <Plus className="h-4 w-4" />
          {itemLabel} 추가
        </button>

        {/* 게이트 안내 */}
        {gate.needMore > 0 ? (
          <p className="rounded-ob border border-ob-border bg-ob-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-ob-danger">
            {josa(itemLabel, '을', '를')} 1개 이상 입력해야 다음으로 넘어갈 수 있어요.
          </p>
        ) : gate.recommendedShort > 0 ? (
          <p className="text-[13px] leading-relaxed text-ob-muted">
            {josa(itemLabel, '이', '가')} {gate.recommendedItems}개 이상이면 검색 노출에 훨씬 유리해요.
          </p>
        ) : null}
      </div>

      {/* ── 자유 원문 ── */}
      <div className="border-t border-ob-border pt-6">
        {importedBadge ? (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-ob-border bg-ob-accent-soft px-3 py-1.5 text-[13px] text-ob-accent-strong">
            <Sparkles className="h-3.5 w-3.5" />
            가져온 내용이에요, 자유롭게 고쳐주세요
          </div>
        ) : null}

        <Field
          label="소개·영업정보·하고 싶은 말 (선택)"
          hint={`가게 소개, 영업시간·위치, ${itemLabel} 외에 더 알리고 싶은 이야기를 자유롭게 적어주세요. 아래 버튼을 누르면 머리말이 들어가요.`}
          error={formState.errors.providedContent?.message}
        >
          <div className="mb-2 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <Chip key={t.label} selected={false} onClick={() => insert(t.heading)}>
                + {t.label}
              </Chip>
            ))}
          </div>
          <textarea
            {...register('providedContent')}
            rows={7}
            placeholder="실제 소개 문구, 영업 정보, 하고 싶은 말 등을 자유롭게 적어주세요."
            className={cn(obInput, 'resize-y leading-relaxed')}
          />
        </Field>
      </div>
    </div>
  );
}
