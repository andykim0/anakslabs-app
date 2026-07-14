'use client';

/**
 * S3 콘텐츠 입력 — 구조화 항목(메뉴·시술·수업·서비스·작업·링크) 행 입력 + 사진 OCR 자동 채우기 +
 * 자유 원문(providedContent). 목적별 필수 게이트(content-requirements)를 안내한다.
 * 실제 진행 차단은 survey-step goNext(step 3)에서 수행.
 */
import { useRef, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { ImagePlus, Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import type { LivePurposeId } from '@/lib/types/domain';
import { contentGateStatus, requirementOf } from '@/lib/onboarding/content-requirements';
import { cn } from '../../ui';
import { extractMenuFromImage, uploadImage } from '../../api';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = watch(`contentItems.${index}.photoUrl`) ?? '';

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadImage(file);
      setValue(`contentItems.${index}.photoUrl`, uploaded, { shouldValidate: false });
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
            onClick={() => setValue(`contentItems.${index}.photoUrl`, '', { shouldValidate: false })}
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
  const req = requirementOf(purposeId);
  const itemLabel = req.itemLabel;
  const showPrice = req.fields.price !== 'hidden';

  const { fields, append, remove } = useFieldArray({ control, name: 'contentItems' });

  const watchedItems = watch('contentItems') ?? [];
  const filledCount = watchedItems.filter((it) => (it?.name ?? '').trim().length > 0).length;
  const gate = contentGateStatus(purposeId, filledCount);

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
        실제 {josa(itemLabel, '이', '가')} 있어야 네이버·AI 검색에 나옵니다. 없는 정보는 지어내지 않아요.
      </StepIntro>

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
                    onClick={() => remove(index)}
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
          onClick={() => append({ name: '', price: '', description: '', photoUrl: '' })}
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
