'use client';

/**
 * S4 사진 — 대표 히어로 실사 1장(heroPhotoUrl) + 본문·갤러리 사진(storePhotoUrls, 최대 12).
 * 두 소스는 역할이 다르므로 별도 슬롯으로 유지한다. S2에서 고른 가져온 이미지는 일반 사진에 담긴다.
 */
import { useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ImagePlus, Loader2, ShieldCheck, X } from 'lucide-react';
import type { AssetRef } from '@/lib/assets/provenance';
import {
  GENERAL_ASSET_ATTESTATION_TEXT,
  PERSON_ASSET_CONSENT_TEXT,
} from '@/lib/assets/attestation-contract';
import {
  createGeneralAssetAttestation,
  createPersonAssetConsent,
  uploadImage,
  uploadImageWithAssetRef,
} from '../../api';
import { useToast } from '../../toast';
import { Field, StepIntro, detectWhiteBg, useSurveyUx, type SurveyForm } from './shared';

const MAX = 12;

export function Step04Photos() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const { siteId, assetPolicyV2Ready } = useSurveyUx();
  const heroInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const attestationKeyRef = useRef<string | null>(null);
  const [heroUploading, setHeroUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [personAttestingAssetId, setPersonAttestingAssetId] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [logoWhiteBg, setLogoWhiteBg] = useState(false);
  const heroPhotoUrl = watch('heroPhotoUrl') ?? '';
  const heroPhotoAssetRef = watch('heroPhotoAssetRef');
  const photos = watch('storePhotoUrls') ?? [];
  const storePhotoAssetRefs = watch('storePhotoAssetRefs') ?? [];
  const contentItems = watch('contentItems') ?? [];
  const generalAssetAttestationId = watch('generalAssetAttestationId');
  const personPhotoAssetIds = watch('personPhotoAssetIds') ?? [];
  const nonPersonPhotoAssetIds = watch('nonPersonPhotoAssetIds') ?? [];
  const logoUrl = watch('logoUrl') ?? '';

  const registeredAssetRefs: AssetRef[] = [...new Map([
    ...(heroPhotoAssetRef ? [heroPhotoAssetRef] : []),
    ...storePhotoAssetRefs,
    ...contentItems.flatMap((item) => item.photoAssetRef ? [item.photoAssetRef] : []),
  ].map((ref) => [ref.assetId, ref] as const)).values()];
  const contentPhotoCount = contentItems.filter((item) => Boolean(item.photoUrl)).length;
  const unregisteredPhotoCount = Math.max(
    0,
    (heroPhotoUrl ? 1 : 0) + photos.length + contentPhotoCount - registeredAssetRefs.length,
  );
  const personAssetIdSet = new Set(personPhotoAssetIds);
  const nonPersonAssetIdSet = new Set(nonPersonPhotoAssetIds);
  const classificationComplete = registeredAssetRefs.length > 0
    && registeredAssetRefs.every((ref) =>
      personAssetIdSet.has(ref.assetId) !== nonPersonAssetIdSet.has(ref.assetId))
    && personAssetIdSet.size + nonPersonAssetIdSet.size === registeredAssetRefs.length;

  const invalidateGeneralAttestation = () => {
    setValue('generalAssetAttestationId', undefined, { shouldValidate: false });
    attestationKeyRef.current = null;
  };

  const resetPhotoMessages = () => {
    setPhotoStatus('');
    setPhotoError('');
  };

  const removeHeroPhoto = () => {
    const changedRegisteredSet = Boolean(heroPhotoAssetRef);
    setValue('heroPhotoUrl', '', { shouldValidate: true });
    setValue('heroPhotoAssetRef', undefined, { shouldValidate: false });
    if (heroPhotoAssetRef) {
      setValue(
        'personPhotoAssetIds',
        personPhotoAssetIds.filter((assetId) => assetId !== heroPhotoAssetRef.assetId),
        { shouldValidate: false },
      );
      setValue(
        'nonPersonPhotoAssetIds',
        nonPersonPhotoAssetIds.filter((assetId) => assetId !== heroPhotoAssetRef.assetId),
        { shouldValidate: false },
      );
    }
    if (changedRegisteredSet) invalidateGeneralAttestation();
  };

  const handleHeroPhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setHeroUploading(true);
    resetPhotoMessages();
    try {
      const result = await uploadImageWithAssetRef(file, siteId);
      const changedRegisteredSet = Boolean(heroPhotoAssetRef) || Boolean(result.assetRef);
      if (heroPhotoAssetRef) {
        setValue(
          'personPhotoAssetIds',
          personPhotoAssetIds.filter((assetId) => assetId !== heroPhotoAssetRef.assetId),
          { shouldValidate: false },
        );
        setValue(
          'nonPersonPhotoAssetIds',
          nonPersonPhotoAssetIds.filter((assetId) => assetId !== heroPhotoAssetRef.assetId),
          { shouldValidate: false },
        );
      }
      setValue('heroPhotoUrl', result.url, { shouldValidate: true });
      setValue('heroPhotoAssetRef', result.assetRef, { shouldValidate: false });
      if (changedRegisteredSet) invalidateGeneralAttestation();
      setPhotoStatus(
        result.assetRef
          ? '대표 사진이 직접 업로드 자산으로 등록됐어요. 아래에서 사진 사용을 확인해 주세요.'
          : '사진은 올렸지만 직접 업로드 자산 참조가 없어 실사 사진 방향의 근거로는 사용할 수 없어요.',
      );
      toast('success', heroPhotoUrl ? '대표 사진을 교체했어요.' : '대표 사진을 올렸어요.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '대표 사진 업로드에 실패했습니다.';
      setPhotoError(message);
      toast('error', message);
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
    resetPhotoMessages();
    try {
      const settled = await Promise.allSettled(
        picked.map((file) => uploadImageWithAssetRef(file, siteId)),
      );
      const uploaded = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const failed = settled.length - uploaded.length;
      const newRefs = uploaded.flatMap((result) => result.assetRef ? [result.assetRef] : []);
      setValue('storePhotoUrls', [...current, ...uploaded.map((result) => result.url)].slice(0, MAX), {
        shouldValidate: true,
      });
      setValue('storePhotoAssetRefs', [...storePhotoAssetRefs, ...newRefs].slice(0, MAX), {
        shouldValidate: false,
      });
      if (newRefs.length) invalidateGeneralAttestation();
      if (uploaded.length) {
        toast('success', `사진 ${uploaded.length}장을 올렸어요.`);
        setPhotoStatus(
          newRefs.length === uploaded.length
            ? '사진이 직접 업로드 자산으로 등록됐어요. 아래에서 사진 사용을 확인해 주세요.'
            : `${uploaded.length}장 중 ${uploaded.length - newRefs.length}장은 직접 업로드 자산 참조가 없어 실사 사진 방향의 근거로 사용할 수 없어요.`,
        );
      }
      if (failed) {
        const message = `${failed}장은 업로드하지 못했어요. 나머지 사진은 보존했어요.`;
        setPhotoError(message);
        toast('error', message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '사진 업로드에 실패했습니다.';
      setPhotoError(message);
      toast('error', message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (url: string) => {
    const current = watch('storePhotoUrls') ?? [];
    const currentRefs = watch('storePhotoAssetRefs') ?? [];
    const currentImportedRefs = watch('importedPhotoAssetRefs') ?? [];
    const nextRefs = currentRefs.filter((ref) => ref.url !== url);
    setValue('storePhotoUrls', current.filter((u) => u !== url), { shouldValidate: true });
    setValue('storePhotoAssetRefs', nextRefs, { shouldValidate: false });
    setValue(
      'importedPhotoAssetRefs',
      currentImportedRefs.filter((ref) => ref.url !== url),
      { shouldValidate: false },
    );
    const removedIds = new Set(currentRefs.filter((ref) => ref.url === url).map((ref) => ref.assetId));
    if (removedIds.size) {
      setValue(
        'personPhotoAssetIds',
        personPhotoAssetIds.filter((assetId) => !removedIds.has(assetId)),
        { shouldValidate: false },
      );
      setValue(
        'nonPersonPhotoAssetIds',
        nonPersonPhotoAssetIds.filter((assetId) => !removedIds.has(assetId)),
        { shouldValidate: false },
      );
    }
    if (nextRefs.length !== currentRefs.length) invalidateGeneralAttestation();
  };

  const handleGeneralAttestation = async (accepted: boolean) => {
    resetPhotoMessages();
    if (!accepted) {
      setValue('generalAssetAttestationId', undefined, { shouldValidate: false });
      attestationKeyRef.current = null;
      setPhotoStatus('사진 사용 확인을 해제했어요. 실사 사진 방향은 확인 전까지 사용할 수 없어요.');
      return;
    }
    if (!registeredAssetRefs.length) {
      setPhotoError('서버에 등록된 직접 업로드 사진이 없습니다. 사진을 다시 올려주세요.');
      return;
    }
    if (!classificationComplete) {
      setPhotoError('모든 직접 업로드 사진에서 식별 가능한 인물 여부를 하나씩 골라주세요.');
      return;
    }
    setAttesting(true);
    try {
      if (!attestationKeyRef.current) {
        if (typeof globalThis.crypto?.randomUUID !== 'function') {
          throw new Error('이 브라우저에서는 사진 사용 확인을 안전하게 기록할 수 없습니다.');
        }
        attestationKeyRef.current = globalThis.crypto.randomUUID();
      }
      const attestation = await createGeneralAssetAttestation({
        assetIds: registeredAssetRefs.map((ref) => ref.assetId),
        personAssetIds: personPhotoAssetIds,
        nonPersonAssetIds: nonPersonPhotoAssetIds,
        idempotencyKey: attestationKeyRef.current,
        ...(siteId ? { siteId } : {}),
      });
      setValue('generalAssetAttestationId', attestation.id, { shouldValidate: true });
      setPhotoStatus('사진의 관계와 사용 권한 확인이 기록됐어요. 실사 사진 방향을 선택할 수 있습니다.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '사진 사용 확인을 기록하지 못했습니다.';
      setPhotoError(message);
      setValue('generalAssetAttestationId', undefined, { shouldValidate: false });
    } finally {
      setAttesting(false);
    }
  };

  const handlePersonClassification = async (
    assetId: string,
    classification: 'person' | 'non-person',
  ) => {
    resetPhotoMessages();
    invalidateGeneralAttestation();
    if (classification === 'non-person') {
      setValue(
        'personPhotoAssetIds',
        personPhotoAssetIds.filter((current) => current !== assetId),
        { shouldValidate: false },
      );
      setValue(
        'nonPersonPhotoAssetIds',
        [...new Set([...nonPersonPhotoAssetIds, assetId])],
        { shouldValidate: true },
      );
      setPhotoStatus('이 사진은 식별 가능한 인물이 없는 사진으로 분류했어요.');
      return;
    }
    setPersonAttestingAssetId(assetId);
    try {
      await createPersonAssetConsent(assetId, siteId);
      setValue(
        'personPhotoAssetIds',
        [...new Set([...personPhotoAssetIds, assetId])],
        { shouldValidate: true },
      );
      setValue(
        'nonPersonPhotoAssetIds',
        nonPersonPhotoAssetIds.filter((current) => current !== assetId),
        { shouldValidate: false },
      );
      setPhotoStatus('인물 사진의 공개·홍보 사용 확인이 자산별로 기록됐어요.');
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : '인물 사진 사용 확인을 기록하지 못했습니다.');
    } finally {
      setPersonAttestingAssetId(null);
    }
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
                  onClick={removeHeroPhoto}
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

      {assetPolicyV2Ready && registeredAssetRefs.length ? (
        <fieldset
          className="rounded-ob border border-ob-border bg-ob-surface p-4"
          aria-describedby="general-asset-attestation-help"
          aria-busy={attesting}
        >
          <legend className="px-1 text-[15px] font-semibold text-ob-ink">실제 사진 사용 확인</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-ob p-1 text-[14px] leading-6 text-ob-ink">
            <input
              type="checkbox"
              checked={Boolean(generalAssetAttestationId)}
              disabled={attesting || !classificationComplete}
              onChange={(event) => void handleGeneralAttestation(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-ob-border text-ob-accent-strong focus:ring-ob-accent"
            />
            <span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-4 w-4 text-ob-accent-strong" aria-hidden="true" />
                {GENERAL_ASSET_ATTESTATION_TEXT}
              </span>
              <span id="general-asset-attestation-help" className="mt-1 block text-[13px] leading-5 text-ob-muted">
                먼저 아래에서 모든 사진의 인물 여부를 선택해야 기록할 수 있어요. 법적 보증을 요구하는 것이 아니라, 이 사진을 실제 제품·장소·작업을 보여주는 이미지로 사용할 수 있는지 확인하는 절차예요.
              </span>
            </span>
          </label>
          {attesting ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ob-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              확인을 안전하게 기록하고 있어요.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {assetPolicyV2Ready && registeredAssetRefs.length ? (
        <fieldset
          className="rounded-ob border border-ob-border bg-ob-surface p-4"
          aria-describedby="person-asset-consent-help"
          aria-busy={Boolean(personAttestingAssetId)}
        >
          <legend className="px-1 text-[15px] font-semibold text-ob-ink">사진별 인물 여부 확인</legend>
          <p id="person-asset-consent-help" className="mb-3 text-[13px] leading-5 text-ob-muted">
            모든 직접 업로드 사진마다 식별 가능한 인물이 있는지 하나씩 선택해 주세요.
            인물이 있는 사진은 자산별로 다음 확인을 기록합니다: {PERSON_ASSET_CONSENT_TEXT}
            이 절차가 법적 검토를 대신하지는 않습니다.
          </p>
          <div className="space-y-2">
            {registeredAssetRefs.map((ref, index) => {
              const busy = personAttestingAssetId === ref.assetId;
              return (
                <div
                  key={ref.assetId}
                  role="group"
                  aria-labelledby={`asset-classification-${ref.assetId}`}
                  className="rounded-ob border border-ob-border px-3 py-2 text-[13px] text-ob-ink"
                >
                  <span className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ref.url}
                      alt=""
                      aria-hidden="true"
                      width={64}
                      height={48}
                      className="h-12 w-16 shrink-0 rounded-ob border border-ob-border object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span id={`asset-classification-${ref.assetId}`} className="block font-medium">
                        사진 {index + 1}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`asset-classification-${ref.assetId}`}
                        value="non-person"
                        checked={nonPersonPhotoAssetIds.includes(ref.assetId)}
                        disabled={Boolean(personAttestingAssetId)}
                        onChange={() => void handlePersonClassification(ref.assetId, 'non-person')}
                        className="h-4 w-4 border-ob-border text-ob-accent-strong focus:ring-ob-accent"
                      />
                      식별 가능한 인물 없음
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`asset-classification-${ref.assetId}`}
                        value="person"
                        checked={personPhotoAssetIds.includes(ref.assetId)}
                        disabled={Boolean(personAttestingAssetId)}
                        onChange={() => void handlePersonClassification(ref.assetId, 'person')}
                        className="h-4 w-4 border-ob-border text-ob-accent-strong focus:ring-ob-accent"
                      />
                      식별 가능한 인물 있음
                    </label>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin text-ob-muted" aria-hidden="true" /> : null}
                      </span>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {assetPolicyV2Ready && unregisteredPhotoCount > 0 ? (
        <p className="rounded-ob border border-ob-border bg-ob-bg px-3 py-2 text-[13px] leading-5 text-ob-muted">
          직접 업로드 참조가 없는 URL·가져온 사진 {unregisteredPhotoCount}장은 실사 사진 방향의 근거로 사용되지 않아요.
        </p>
      ) : null}

      {assetPolicyV2Ready ? (
        <div aria-live="polite" aria-atomic="true" className="min-h-5 text-[13px] leading-5">
          {photoStatus ? <p role="status" className="text-ob-accent-strong">{photoStatus}</p> : null}
          {photoError ? <p role="alert" className="text-ob-danger">{photoError}</p> : null}
        </div>
      ) : null}

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
