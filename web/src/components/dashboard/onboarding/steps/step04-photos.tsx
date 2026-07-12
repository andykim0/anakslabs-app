'use client';

/**
 * S4 사진 — storePhotoUrls 단일 슬롯(최대 12, uploadImage). S2에서 고른 가져온 이미지가 미리 담김.
 * 레퍼런스 업로드 UI는 완전히 제거(referenceImageUrls 미수집).
 */
import { useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { uploadImage } from '../../api';
import { useToast } from '../../toast';
import { Field, StepIntro, type SurveyForm } from './shared';

const MAX = 12;

export function Step04Photos() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photos = watch('storePhotoUrls') ?? [];

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const current = watch('storePhotoUrls') ?? [];
    const remaining = MAX - current.length;
    if (remaining <= 0) {
      toast('info', `사진은 최대 ${MAX}장까지 올릴 수 있어요.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of picked) uploaded.push(await uploadImage(f));
      setValue('storePhotoUrls', [...current, ...uploaded].slice(0, MAX), { shouldValidate: true });
      if (uploaded.length) toast('success', `사진 ${uploaded.length}장을 올렸어요.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '사진 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (url: string) => {
    const current = watch('storePhotoUrls') ?? [];
    setValue('storePhotoUrls', current.filter((u) => u !== url), { shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      <StepIntro>
        실제 사진이 있으면 첫 화면·갤러리에 먼저 써서 신뢰도가 올라가요. 부족한 사진은 AI가 채워드려요.
      </StepIntro>

      <Field
        label={
          <>
            가게·메뉴 사진 <span className="font-normal text-ob-muted">(선택 · 최대 {MAX}장)</span>
          </>
        }
        hint="직접 촬영했거나 사용 권한이 있는 사진만 올려주세요."
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {photos.map((url) => (
            <span key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="가게 사진"
                className="h-20 w-24 rounded-ob border border-ob-border object-cover"
              />
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label="사진 제거"
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ob-ink text-white transition-colors hover:bg-ob-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || photos.length >= MAX}
            className="inline-flex h-20 w-24 flex-col items-center justify-center gap-1 rounded-ob border border-dashed border-ob-border text-[13px] text-ob-muted transition-colors hover:border-ob-muted hover:text-ob-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            사진 올리기
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
        <p className="mt-2 text-[13px] text-ob-muted">
          {photos.length}/{MAX}장 · 5MB 이하 · PNG·JPG·WEBP
        </p>
      </Field>
    </div>
  );
}
