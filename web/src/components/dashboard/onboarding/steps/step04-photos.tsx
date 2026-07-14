'use client';

/**
 * S4 사진 — 대표 히어로 실사 1장(heroPhotoUrl) + 본문·갤러리 사진(storePhotoUrls, 최대 12).
 * 두 소스는 역할이 다르므로 별도 슬롯으로 유지한다. S2에서 고른 가져온 이미지는 일반 사진에 담긴다.
 */
import { useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { uploadImage } from '../../api';
import { useToast } from '../../toast';
import { Field, StepIntro, detectWhiteBg, type SurveyForm } from './shared';

const MAX = 12;

export function Step04Photos() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const heroInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [heroUploading, setHeroUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoWhiteBg, setLogoWhiteBg] = useState(false);
  const heroPhotoUrl = watch('heroPhotoUrl') ?? '';
  const photos = watch('storePhotoUrls') ?? [];
  const logoUrl = watch('logoUrl') ?? '';

  const handleHeroPhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setHeroUploading(true);
    try {
      const url = await uploadImage(file);
      setValue('heroPhotoUrl', url, { shouldValidate: true });
      toast('success', heroPhotoUrl ? '대표 사진을 교체했어요.' : '대표 사진을 올렸어요.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '대표 사진 업로드에 실패했습니다.');
    } finally {
      setHeroUploading(false);
      if (heroInputRef.current) heroInputRef.current.value = '';
    }
  };

  const handleLogo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoWhiteBg(false);
    try {
      const url = await uploadImage(file);
      setValue('logoUrl', url, { shouldValidate: true });
      void detectWhiteBg(file).then(setLogoWhiteBg).catch(() => {});
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '로고 업로드에 실패했습니다.');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

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
        대표 사진은 첫 화면에 크게, 가게·메뉴 사진은 본문과 갤러리에 사용해요.
      </StepIntro>

      <div className="rounded-ob border border-ob-accent/50 bg-ob-accent-soft/30 p-4">
        <Field
          label={
            <>
              대표 사진 <span className="font-normal text-ob-muted">(히어로에 크게 쓰여요 · 선택)</span>
            </>
          }
          hint="가장 보여주고 싶은 사진 한 장을 올리면, 그 사진으로 시네마틱하게 만들어드려요. 없으면 분위기에 맞춰 AI가 연출해요."
        >
          <div className="flex flex-wrap items-center gap-3">
            {heroPhotoUrl ? (
              <span className="relative block h-28 w-44 overflow-hidden rounded-ob border border-ob-border bg-ob-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={heroPhotoUrl} alt="대표 사진" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setValue('heroPhotoUrl', '', { shouldValidate: true })}
                  aria-label="대표 사진 제거"
                  className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ob-ink/85 text-white transition-colors hover:bg-ob-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => heroInputRef.current?.click()}
                disabled={heroUploading}
                className="inline-flex h-28 w-44 flex-col items-center justify-center gap-1.5 rounded-ob border border-dashed border-ob-accent-strong/50 bg-ob-surface text-[13px] text-ob-muted transition-colors hover:border-ob-accent-strong hover:text-ob-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {heroUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                대표 사진 올리기
              </button>
            )}
            {heroPhotoUrl ? (
              <button
                type="button"
                onClick={() => heroInputRef.current?.click()}
                disabled={heroUploading}
                className="inline-flex h-10 items-center gap-1.5 rounded-ob border border-ob-border bg-ob-surface px-3.5 text-[13px] text-ob-ink transition-colors hover:border-ob-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {heroUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                사진 교체
              </button>
            ) : null}
            <input
              ref={heroInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void handleHeroPhoto(e.target.files)}
            />
          </div>
          <p className="mt-2 text-[13px] text-ob-muted">직접 촬영했거나 사용 권한이 있는 사진 · 5MB 이하 · PNG·JPG·WEBP</p>
        </Field>
      </div>

      <Field
        label={
          <>
            가게·메뉴 사진 <span className="font-normal text-ob-muted">(본문·갤러리용 · 선택 · 최대 {MAX}장)</span>
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

      {/* [v4.5] 로고 서브 슬롯 */}
      <Field
        label={<>로고 <span className="font-normal text-ob-muted">(선택)</span></>}
        hint="로고가 있다면 올려주세요 — 없으면 상호명으로 글자 로고를 만들어드려요. 배경이 투명한 PNG를 권장합니다."
      >
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <span className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="로고" className="h-16 w-28 rounded-ob border border-ob-border bg-ob-bg object-contain p-1.5" />
              <button
                type="button"
                onClick={() => {
                  setValue('logoUrl', '', { shouldValidate: true });
                  setLogoWhiteBg(false);
                }}
                aria-label="로고 제거"
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ob-ink text-white transition-colors hover:bg-ob-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoUploading}
              className="inline-flex h-16 w-28 flex-col items-center justify-center gap-1 rounded-ob border border-dashed border-ob-border text-[13px] text-ob-muted transition-colors hover:border-ob-muted hover:text-ob-ink disabled:opacity-50"
            >
              {logoUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              로고 올리기
            </button>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => void handleLogo(e.target.files)}
          />
        </div>
        {logoWhiteBg ? (
          <p className="mt-2 text-[13px] text-ob-accent-strong">
            흰 배경이 감지됐어요 — 투명 PNG로 올리면 더 깔끔해요.
          </p>
        ) : null}
      </Field>
    </div>
  );
}
