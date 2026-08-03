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
import type { SectionType } from '@/lib/types/site';
import { factQuestionsForIndustry, faqQuestionsForIndustry } from '@/lib/content/content-depth';
import { contentGateStatus, requirementOf } from '@/lib/onboarding/content-requirements';
import { cn } from '../../ui';
import { extractMenuFromImage, uploadImage, uploadImageWithAssetRef } from '../../api';
import { useToast } from '../../toast';
import { NudgeBadge } from '../onboarding-nudge';
import { Chip, Field, StepIntro, obInput, useSurveyUx, type SurveyForm } from './shared';

const TEMPLATES: { label: string; heading: string }[] = [
  { label: "introduction", heading: "[introduction]" },
  { label: "Menu/price", heading: "[Menu/Price]" },
  { label: "Sales information", heading: "[Sales Information]\nBusiness hours: \nClosed: \nParking:" },
  { label: "What I want to say", heading: "[What I want to say]" },
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
        toast('info', "I uploaded a photo, but there is no direct upload asset reference, so I can't use it for photo orientation.");
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : "Photo upload failed.");
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
          <img src={url} alt="item photo" className="h-14 w-14 rounded-ob border border-ob-border object-cover" />
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
            aria-label="remove photos"
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
          aria-label="Upload a photo of your item"
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

type ContentStepMode = 'all' | 'core' | 'deepening';

const FACT_KEYS_BY_SECTION: Readonly<Partial<Record<SectionType, readonly string[]>>> = {
  about: ['credentials', 'specialties'],
  features: ['services', 'specialties', 'signature'],
  menu: ['services', 'classes', 'signature', 'duration', 'materials', 'specialties'],
  pricing: ['services', 'classes', 'duration'],
  team: ['credentials', 'specialties'],
  cases: ['caseStudies'],
  faq: ['parking', 'reservation', 'paymentMethods', 'accessibility', 'pets', 'wifi'],
  contact: ['phone', 'openingHours', 'address', 'parking', 'reservation', 'directions'],
};

export function Step03Content({
  mode = 'all',
  focusType,
}: {
  mode?: ContentStepMode;
  focusType?: SectionType;
}) {
  const { control, register, watch, setValue, getValues, formState } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const { importedBadge, nudgeResult } = useSurveyUx();

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
  const allFactQuestions = factQuestionsForIndustry(industry, purposeId);
  const focusFactKeys = focusType ? FACT_KEYS_BY_SECTION[focusType] ?? [] : [];
  const factQuestions = mode === 'core'
    ? allFactQuestions.filter((question) => question.required)
    : mode === 'deepening'
      ? allFactQuestions.filter((question) => focusFactKeys.includes(question.key))
      : allFactQuestions;
  const factsByKey = new Map(factualAnswers.map((answer) => [answer.key, answer]));
  const answeredFactCount = factQuestions.filter((question) => factsByKey.get(question.key)?.value.trim()).length;
  const factProgress = factQuestions.length
    ? Math.round((answeredFactCount / factQuestions.length) * 100)
    : 0;
  const faqAnswers = watch('faqAnswers') ?? [];
  const faqQuestions = faqQuestionsForIndustry(industry);
  const faqAnswersById = new Map(faqAnswers.map((answer) => [answer.questionId, answer.answer]));
  const answeredFaqCount = faqQuestions.filter((question) => faqAnswersById.get(question.id)?.trim()).length;
  const showStory = mode === 'all' || (mode === 'deepening' && focusType === 'about');
  const showFacts = factQuestions.length > 0;
  const showFaq = mode === 'all' || (mode === 'deepening' && focusType === 'faq');
  const showItems = mode === 'all' || (mode === 'deepening' && ['menu', 'pricing', 'cases'].includes(focusType ?? ''));
  const showProvidedContent = mode === 'all' || (mode === 'deepening' && ['about', 'features'].includes(focusType ?? ''));

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
  const ocrButtonLabel = itemLabel === "menu" ? "Fill the menu with photos at once" : "Fill with photos at once";

  const runOcr = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || ocrLoading) return;
    setOcrLoading(true);
    try {
      const uploadedUrl = await uploadImage(file);
      const extracted = await extractMenuFromImage(uploadedUrl);
      if (extracted.length === 0) {
        toast('info', "I couldn't read the item in the photo. Please enter it directly.");
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
        toast('info', "All the items in the picture are already included.");
        return;
      }
      append(toAdd);
      toast('success', `${toAdd.length}Added 1 item. Please check and correct.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : "I couldn't read the item in the photo.");
    } finally {
      setOcrLoading(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-7">
      <StepIntro>
        {mode === 'core'
          ? "First, only receive key information necessary for the purpose. You can add the rest as you wish after looking at the homepage configuration."
          : "We only ask for actual information that will enable us to create the configuration you have chosen. Do not make up information that is not answered."}
      </StepIntro>

      {showStory ? <section className="rounded-ob border border-ob-border bg-ob-surface p-4 sm:p-5" aria-labelledby="brand-story-title">
        <div>
          <h3 id="brand-story-title" className="text-[17px] font-semibold text-ob-ink">
            Tell us your clinic’s story
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">
            Your own words become the center of the clinic introduction. If you leave this blank, we will not invent a story.
          </p>
        </div>
        <div className="mt-5 grid gap-4">
          <Field label={<>Clinic story <span className="font-normal text-ob-muted">(optional)</span></>} hint="The story you want patients to know">
              <textarea
                {...register('brandStory')}
                rows={3}
              placeholder="Example: Describe the experience you want patients to have at your clinic."
              className={cn(obInput, 'resize-y leading-relaxed')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={<>How it started <span className="font-normal text-ob-muted">(optional)</span></>} hint="The factual reason or event that led you to open the clinic">
              <textarea
                {...register('brandOrigin')}
                rows={3}
                placeholder="Please write down only the events that actually occurred."
                className={cn(obInput, 'resize-y leading-relaxed')}
              />
            </Field>
            <Field label={<>Care philosophy <span className="font-normal text-ob-muted">(optional)</span></>} hint="The principles that guide how your clinic operates">
              <textarea
                {...register('brandPhilosophy')}
                rows={3}
                placeholder="Describe the principles your clinic actually follows."
                className={cn(obInput, 'resize-y leading-relaxed')}
              />
            </Field>
          </div>
        </div>
      </section> : null}

      {showFacts ? <section className="rounded-ob border border-ob-border bg-ob-surface p-4 sm:p-5" aria-labelledby="factual-interview-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="factual-interview-title" className="text-[17px] font-semibold text-ob-ink">
              Tell us about the clinic
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">
              {mode === 'core'
                ? "This is the information needed for the purpose of the homepage you have chosen. The same information will not be asked again later."
                : "Answer if you have it, skip it if not. Only configurations containing the information you answered will be created."}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-ob-accent-soft px-3 py-1.5 text-[12px] font-medium text-ob-accent-strong">
            {answeredFactCount}/{factQuestions.length} answered
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
          The more you answer, the more fact-based guidance and sections we can include.
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
                      <span className="font-normal text-ob-muted">(select)</span>
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
                    Content taken from existing channel · Please check and correct
                  </span>
                ) : null}
                {question.key === 'phone' || question.key === 'address' ? (
                  <NudgeBadge id="public-contact" result={nudgeResult} />
                ) : null}
              </Field>
            );
          })}
        </div>
      </section> : null}

      {showFaq ? <section className="rounded-ob border border-ob-border bg-ob-bg p-4 sm:p-5" aria-labelledby="guided-faq-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="guided-faq-title" className="text-[17px] font-semibold text-ob-ink">
              Frequently asked questions from patients
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">
              Only questions you answer will be included on the website and in its structured FAQ.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-ob-surface px-3 py-1.5 text-[12px] font-medium text-ob-muted">
            {answeredFaqCount}/{faqQuestions.length} answered · all optional
          </span>
        </div>
        <div className="mt-5 space-y-4">
          {faqQuestions.map((question) => (
            <Field key={question.id} label={question.question} hint={question.hint}>
              <textarea
                value={faqAnswersById.get(question.id) ?? ''}
                onChange={(event) => setFaqAnswer(question.id, event.target.value)}
                rows={2}
                placeholder="Please write an answer that meets actual operational standards. If you don't answer, it won't appear on the website."
                className={cn(obInput, 'resize-y leading-relaxed')}
              />
            </Field>
          ))}
        </div>
      </section> : null}

      {/* ── 구조화 항목 입력 ── */}
      {showItems ? <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-[15px] font-medium text-ob-ink">
            {itemLabel} inventory <span className="font-normal text-ob-muted">(select)</span>
          </label>
          <span className="shrink-0 text-[13px] text-ob-muted">{filledCount}entered</span>
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
            The items in the photo are automatically read and filled in. It is not automatically confirmed, so please check and correct what you have read.
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
                    placeholder={`${itemLabel}name`}
                    className={cn(obInput, 'min-w-0 flex-1')}
                  />
                  {showPrice ? (
                    <input
                      {...register(`contentItems.${index}.price`)}
                      placeholder="Price (optional)"
                      inputMode="numeric"
                      className={cn(obInput, 'w-24 shrink-0 sm:w-28')}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    aria-label="Delete item"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ob border border-ob-border text-ob-muted transition-colors hover:border-ob-danger hover:text-ob-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  {...register(`contentItems.${index}.description`)}
                  placeholder="One-line description (optional)"
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
          {itemLabel} Add
        </button>

        {/* 입력하면 계획에 반영된다는 안내 — 심화 단계는 진행을 막지 않는다. */}
        {gate.needMore > 0 ? (
          <p className="rounded-ob border border-ob-border bg-ob-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-ob-muted">
            {josa(itemLabel, "second", "cast")} If you enter more than one, this configuration will be added to the homepage.
          </p>
        ) : gate.recommendedShort > 0 ? (
          <p className="text-[13px] leading-relaxed text-ob-muted">
            {josa(itemLabel, "this", "go")} {gate.recommendedItems}If there are more than one, it is much more advantageous for search exposure.
          </p>
        ) : null}
      </div> : null}

      {/* ── 자유 원문 ── */}
      {showProvidedContent ? <div className="border-t border-ob-border pt-6">
        {importedBadge ? (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-ob-border bg-ob-accent-soft px-3 py-1.5 text-[13px] text-ob-accent-strong">
            <Sparkles className="h-3.5 w-3.5" />
            This is what I imported, please feel free to edit it.
          </div>
        ) : null}

        <Field
          label="Introduction/Sales Information/What You Want to Say (Optional)"
          hint={`Store introduction, business hours and location,${itemLabel}Please feel free to write any other stories you would like to know. If you click the button below, the header will appear.`}
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
            placeholder="Please feel free to write down the actual introduction, sales information, anything you want to say, etc."
            className={cn(obInput, 'resize-y leading-relaxed')}
          />
        </Field>
      </div> : null}
    </div>
  );
}
