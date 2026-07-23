'use client';

/**
 * S4 사진 — 대표 히어로 실사 1장(heroPhotoUrl) + 본문·갤러리 사진(storePhotoUrls, 최대 12).
 * 두 소스는 역할이 다르므로 별도 슬롯으로 유지한다. S2에서 고른 가져온 이미지는 일반 사진에 담긴다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ImagePlus, Loader2, ShieldCheck, X } from 'lucide-react';
import type { AssetRef } from '@/lib/assets/provenance';
import { REFERENTIAL_IMAGE_POLICY_COPY } from '@/lib/assets/image-directions';
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
import { projectPersonPhotoClassification } from './photo-person-classification';
import { Field, StepIntro, detectWhiteBg, useSurveyUx, type SurveyForm } from './shared';

const MAX = 12;

function sameAssetIdSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualIds = new Set(actual);
  return actualIds.size === actual.length && expected.every((assetId) => actualIds.has(assetId));
}
const EMPTY_ASSET_REFS: AssetRef[] = [];
const EMPTY_CONTENT_ITEMS: SurveyForm['contentItems'] = [];
const EMPTY_ASSET_IDS: string[] = [];

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
  const storePhotoAssetRefs = watch('storePhotoAssetRefs') ?? EMPTY_ASSET_REFS;
  const importedPhotoAssetRefs = watch('importedPhotoAssetRefs') ?? EMPTY_ASSET_REFS;
  const contentItems = watch('contentItems') ?? EMPTY_CONTENT_ITEMS;
  const generalAssetAttestationId = watch('generalAssetAttestationId');
  const personPhotoAssetIds = watch('personPhotoAssetIds') ?? EMPTY_ASSET_IDS;
  const nonPersonPhotoAssetIds = watch('nonPersonPhotoAssetIds') ?? EMPTY_ASSET_IDS;
  const logoUrl = watch('logoUrl') ?? '';

  const registeredAssetRefs = useMemo<AssetRef[]>(() => [...new Map([
    ...(heroPhotoAssetRef ? [heroPhotoAssetRef] : []),
    ...storePhotoAssetRefs,
    ...importedPhotoAssetRefs,
    ...contentItems.flatMap((item) => item.photoAssetRef ? [item.photoAssetRef] : []),
  ].map((ref) => [ref.assetId, ref] as const)).values()], [
    contentItems,
    heroPhotoAssetRef,
    importedPhotoAssetRefs,
    storePhotoAssetRefs,
  ]);
  const contentPhotoCount = contentItems.filter((item) => Boolean(item.photoUrl)).length;
  const unregisteredPhotoCount = Math.max(
    0,
    (heroPhotoUrl ? 1 : 0) + photos.length + contentPhotoCount - registeredAssetRefs.length,
  );
  const personClassification = useMemo(
    () => projectPersonPhotoClassification(registeredAssetRefs, personPhotoAssetIds),
    [personPhotoAssetIds, registeredAssetRefs],
  );
  const classificationMatchesForm = sameAssetIdSet(
    personPhotoAssetIds,
    personClassification.personPhotoAssetIds,
  ) && sameAssetIdSet(
    nonPersonPhotoAssetIds,
    personClassification.nonPersonPhotoAssetIds,
  );

  useEffect(() => {
    if (!assetPolicyV2Ready || classificationMatchesForm) return;
    setValue('personPhotoAssetIds', personClassification.personPhotoAssetIds, {
      shouldValidate: false,
    });
    setValue('nonPersonPhotoAssetIds', personClassification.nonPersonPhotoAssetIds, {
      shouldValidate: false,
    });
    if (generalAssetAttestationId) {
      setValue('generalAssetAttestationId', undefined, { shouldValidate: false });
      attestationKeyRef.current = null;
    }
  }, [
    assetPolicyV2Ready,
    classificationMatchesForm,
    generalAssetAttestationId,
    personClassification.nonPersonPhotoAssetIds,
    personClassification.personPhotoAssetIds,
    setValue,
  ]);

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
    const removedIds = new Set(
      [...currentRefs, ...currentImportedRefs]
        .filter((ref) => ref.url === url)
        .map((ref) => ref.assetId),
    );
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
      setPhotoError('서버에 등록된 사진이 없습니다. 사진을 다시 올리거나 가져와 주세요.');
      return;
    }
    if (personAttestingAssetId) {
      setPhotoError('인물 사진 사용 확인을 기록한 뒤 다시 시도해 주세요.');
      return;
    }
    const exactClassification = projectPersonPhotoClassification(
      registeredAssetRefs,
      personPhotoAssetIds,
    );
    setValue('personPhotoAssetIds', exactClassification.personPhotoAssetIds, {
      shouldValidate: false,
    });
    setValue('nonPersonPhotoAssetIds', exactClassification.nonPersonPhotoAssetIds, {
      shouldValidate: false,
    });
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
        personAssetIds: exactClassification.personPhotoAssetIds,
        nonPersonAssetIds: exactClassification.nonPersonPhotoAssetIds,
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

  const handlePersonPhotoCheck = async (assetId: string, checked: boolean) => {
    resetPhotoMessages();
    invalidateGeneralAttestation();
    if (!checked) {
      const nextClassification = projectPersonPhotoClassification(
        registeredAssetRefs,
        personClassification.personPhotoAssetIds.filter((current) => current !== assetId),
      );
      setValue('personPhotoAssetIds', nextClassification.personPhotoAssetIds, {
        shouldValidate: false,
      });
      setValue('nonPersonPhotoAssetIds', nextClassification.nonPersonPhotoAssetIds, {
        shouldValidate: true,
      });
      setPhotoStatus('이 사진은 식별 가능한 인물이 없는 사진으로 분류했어요.');
      return;
    }
    setPersonAttestingAssetId(assetId);
    try {
      await createPersonAssetConsent(assetId, siteId);
      const nextClassification = projectPersonPhotoClassification(
        registeredAssetRefs,
        [...personClassification.personPhotoAssetIds, assetId],
      );
      setValue('personPhotoAssetIds', nextClassification.personPhotoAssetIds, {
        shouldValidate: true,
      });
      setValue('nonPersonPhotoAssetIds', nextClassification.nonPersonPhotoAssetIds, {
        shouldValidate: false,
      });
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
        {REFERENTIAL_IMAGE_POLICY_COPY.intro}
      </StepIntro>

      <div className="rounded-ob border border-ob-accent/50 bg-ob-accent-soft/30 p-4">
        <Field
          label={
            <>
              대표 실제 사진 <span className="font-normal text-ob-muted">(첫 화면용 · 선택)</span>
            </>
          }
          hint={REFERENTIAL_IMAGE_POLICY_COPY.heroHint}
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
            제품·공간·인물 사진 <span className="font-normal text-ob-muted">(본문·갤러리용 · 선택 · 최대 {MAX}장)</span>
          </>
        }
        hint={REFERENTIAL_IMAGE_POLICY_COPY.collectionHint}
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
          aria-describedby="person-asset-consent-help"
          aria-busy={Boolean(personAttestingAssetId)}
        >
          <legend className="px-1 text-[15px] font-semibold text-ob-ink">
            인물이 들어간 사진만 체크해 주세요
          </legend>
          <p id="person-asset-consent-help" className="mb-3 text-[13px] leading-5 text-ob-muted">
            체크하지 않은 사진은 식별 가능한 인물이 없는 사진으로 기록합니다.
            체크하면 해당 사진에 다음 공개·홍보 사용 확인을 자산별로 기록합니다: {PERSON_ASSET_CONSENT_TEXT}
            이 확인은 법적 검토를 대신하지 않습니다.
          </p>
          <div className="space-y-2">
            {registeredAssetRefs.map((ref, index) => {
              const busy = personAttestingAssetId === ref.assetId;
              const checked = personClassification.personPhotoAssetIds.includes(ref.assetId);
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
                      <label className="mt-2 inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={Boolean(personAttestingAssetId) || Boolean(generalAssetAttestationId)}
                          onChange={(event) => void handlePersonPhotoCheck(ref.assetId, event.target.checked)}
                          className="h-4 w-4 rounded border-ob-border text-ob-accent-strong focus:ring-ob-accent"
                        />
                        이 사진에 식별 가능한 인물이 있어요
                        {busy ? <Loader2 className="h-4 w-4 animate-spin text-ob-muted" aria-hidden="true" /> : null}
                      </label>
                      {checked ? (
                        <span className="mt-2 flex items-start gap-1.5 rounded-ob bg-ob-accent-soft/40 px-2.5 py-2 text-[12px] leading-5 text-ob-muted">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ob-accent-strong" aria-hidden="true" />
                          <span>이 자산의 인물 사진 공개·홍보 사용 확인이 기록됐어요.</span>
                        </span>
                      ) : null}
                      {generalAssetAttestationId ? (
                        <span className="mt-2 block text-[12px] leading-5 text-ob-muted">
                          이 사진 묶음의 인물 여부가 기록됐어요. 사진을 추가·교체·삭제하면 다시 확인합니다.
                        </span>
                      ) : null}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </fieldset>
      ) : null}

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
              disabled={attesting || Boolean(personAttestingAssetId) || Boolean(generalAssetAttestationId)}
              onChange={(event) => void handleGeneralAttestation(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-ob-border text-ob-accent-strong focus:ring-ob-accent"
            />
            <span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-4 w-4 text-ob-accent-strong" aria-hidden="true" />
                {GENERAL_ASSET_ATTESTATION_TEXT}
              </span>
              <span id="general-asset-attestation-help" className="mt-1 block text-[13px] leading-5 text-ob-muted">
                위에서 인물이 들어간 사진만 체크했는지 확인해 주세요. 법적 보증을 요구하는 것이 아니라, 이 사진을 실제 제품·장소·작업을 보여주는 이미지로 사용할 수 있는지 확인하는 절차예요.
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

      {assetPolicyV2Ready && unregisteredPhotoCount > 0 ? (
        <p className="rounded-ob border border-ob-border bg-ob-bg px-3 py-2 text-[13px] leading-5 text-ob-muted">
          서버 출처 기록이 없는 사진 {unregisteredPhotoCount}장은 실사 사진 방향의 근거로 사용되지 않아요.
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
