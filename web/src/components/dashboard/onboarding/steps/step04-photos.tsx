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
          ? "The representative photo was registered as a direct upload asset. Please check out the photo usage below."
          : "I uploaded a photo, but there is no direct upload asset reference, so it cannot be used as a basis for photo orientation.",
      );
      toast('success', heroPhotoUrl ? "The featured photo was replaced." : "The featured photo was uploaded.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload main photo.";
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
      toast('error', err instanceof Error ? err.message : "Logo upload failed.");
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
      toast('info', `You can upload up to ${MAX} photos.`);
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
        toast('success', `${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} uploaded.`);
        setPhotoStatus(
          newRefs.length === uploaded.length
            ? "The photo was registered as a direct upload asset. Please check out the photo usage below."
            : `${uploaded.length - newRefs.length} of ${uploaded.length} photos lack direct-upload provenance and cannot support a photographic direction.`,
        );
      }
      if (failed) {
        const message = `${failed} photo${failed === 1 ? '' : 's'} could not be uploaded. The other uploads were preserved.`;
        setPhotoError(message);
        toast('error', message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Photo upload failed.";
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
      setPhotoStatus("I unchecked the use of photos. Real photo orientation cannot be used until confirmed.");
      return;
    }
    if (!registeredAssetRefs.length) {
      setPhotoError("There are no photos registered on the server. Please repost or import the photo.");
      return;
    }
    if (personAttestingAssetId) {
      setPhotoError("Please note your confirmation to use portrait photos and try again.");
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
          throw new Error("This browser cannot securely log photo usage confirmations.");
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
      setPhotoStatus("Photo relationships and usage permission confirmation were recorded. You can choose the photo orientation of the photo.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to log photo usage confirmation.";
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
      setPhotoStatus("This photo was classified as a photo with no identifiable people.");
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
      setPhotoStatus("Confirmation of public and promotional use of portraits was recorded for each asset.");
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Failed to record portrait usage confirmation.");
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
              Representative real photos <span className="font-normal text-ob-muted">(for first screen · selection)</span>
            </>
          }
          hint={REFERENTIAL_IMAGE_POLICY_COPY.heroHint}
        >
          <div className="flex flex-wrap items-center gap-3">
            {heroPhotoUrl ? (
              <span className="relative block h-28 w-44 overflow-hidden rounded-ob border border-ob-border bg-ob-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={heroPhotoUrl} alt="representative photo" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={removeHeroPhoto}
                  aria-label="Remove featured photo"
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
                Upload featured photo
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
                Replace photo
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
          <p className="mt-2 text-[13px] text-ob-muted">Photos you own or are authorized to use · up to 5MB · PNG, JPG, or WEBP</p>
        </Field>
      </div>

      <Field
        label={
          <>
            Clinic, service, and team photos <span className="font-normal text-ob-muted">(optional · up to {MAX})</span>
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
                alt="Uploaded clinic photo"
                className="h-20 w-24 rounded-ob border border-ob-border object-cover"
              />
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label="Remove photo"
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
            Upload photo
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
          {photos.length}/{MAX} photos · up to 5MB each · PNG, JPG, or WEBP
        </p>
      </Field>

      {assetPolicyV2Ready && registeredAssetRefs.length ? (
        <fieldset
          className="rounded-ob border border-ob-border bg-ob-surface p-4"
          aria-describedby="person-asset-consent-help"
          aria-busy={Boolean(personAttestingAssetId)}
        >
          <legend className="px-1 text-[15px] font-semibold text-ob-ink">
            Please check only photos containing people.
          </legend>
          <p id="person-asset-consent-help" className="mb-3 text-[13px] leading-5 text-ob-muted">
            Unchecked photos are recorded as photos without identifiable people.
            When checked, the following public/promotional usage confirmations will be recorded for each asset for the photo: {PERSON_ASSET_CONSENT_TEXT}
            This verification is not a substitute for a legal review.
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
                        Photo {index + 1}
                      </span>
                      <label className="mt-2 inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={Boolean(personAttestingAssetId) || Boolean(generalAssetAttestationId)}
                          onChange={(event) => void handlePersonPhotoCheck(ref.assetId, event.target.checked)}
                          className="h-4 w-4 rounded border-ob-border text-ob-accent-strong focus:ring-ob-accent"
                        />
                        There is an identifiable person in this photo
                        {busy ? <Loader2 className="h-4 w-4 animate-spin text-ob-muted" aria-hidden="true" /> : null}
                      </label>
                      {checked ? (
                        <span className="mt-2 flex items-start gap-1.5 rounded-ob bg-ob-accent-soft/40 px-2.5 py-2 text-[12px] leading-5 text-ob-muted">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ob-accent-strong" aria-hidden="true" />
                          <span>Confirmation of public and promotional use of portraits of this asset has been recorded.</span>
                        </span>
                      ) : null}
                      {generalAssetAttestationId ? (
                        <span className="mt-2 block text-[12px] leading-5 text-ob-muted">
                          The presence or absence of people in this batch of photos was recorded. Check again when you add, replace, or delete photos.
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
          <legend className="px-1 text-[15px] font-semibold text-ob-ink">Make sure to use real photos</legend>
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
                Please make sure you only check the photos containing people above. It is not a request for a legal guarantee, but a process to check whether the photo can be used as an image showing the actual product, place, or work.
              </span>
            </span>
          </label>
          {attesting ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ob-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Confirmation is recorded securely.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {assetPolicyV2Ready && unregisteredPhotoCount > 0 ? (
        <p className="rounded-ob border border-ob-border bg-ob-bg px-3 py-2 text-[13px] leading-5 text-ob-muted">
          Photos without server origin records {unregisteredPhotoCount}Fields are not used as a basis for orientation in live-action photos.
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
        label={<>logo <span className="font-normal text-ob-muted">(select)</span></>}
        hint="If you have a logo, please upload it — if not, we will create a letter logo using your business name. We recommend PNG with a transparent background."
      >
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <span className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="logo" className="h-16 w-28 rounded-ob border border-ob-border bg-ob-bg object-contain p-1.5" />
              <button
                type="button"
                onClick={() => {
                  setValue('logoUrl', '', { shouldValidate: true });
                  setLogoWhiteBg(false);
                }}
                aria-label="remove logo"
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
              Post your logo
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
            A white background was detected — it will be cleaner if you upload it as a transparent PNG.
          </p>
        ) : null}
      </Field>
    </div>
  );
}
