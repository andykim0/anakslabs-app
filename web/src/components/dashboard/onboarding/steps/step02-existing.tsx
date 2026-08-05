'use client';

/**
 * S1 이미 있는 걸 알려주세요 — 기존 채널(홈페이지/블로그/플레이스/인스타그램) 입력 → 소유 확인 →
 * 가져오기(POST /api/onboarding/import) → 추출 텍스트 요약 + 이미지 후보 선택 → ingest.
 * 추출 텍스트는 S3 providedContent 프리필, 선택 이미지는 storePhotoUrls에 추가(S4 반영).
 */
import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { AtSign, Globe, ImageOff, Loader2 } from 'lucide-react';
import type { PresenceKind } from '@/lib/types/domain';
import type { AssetRef } from '@/lib/assets/provenance';
import { handleFromSnsUrl, snsUrlFromHandle } from '@/lib/onboarding/sns';
import { Button, cn } from '../../ui';
import { useToast } from '../../toast';
import { Field, StepIntro, obInput, useSurveyUx, type SurveyForm } from './shared';

interface ImportExtracted {
  sourceUrl: string;
  title?: string;
  description?: string;
  headings: string[];
  text: string;
  imageUrls: string[];
  structured: {
    businessName?: string;
    description?: string;
    phone?: string;
    address?: string;
    openingHours?: string;
    commercialPhrases: string[];
    contentItems: { name: string; price?: string }[];
  };
}
interface ImportResult {
  kind: PresenceKind;
  url: string;
  ok: boolean;
  extracted?: ImportExtracted;
  provenance?: {
    origin: 'customer_import';
    sourceUrl: string;
    extractedAt: string;
  };
  fallbackMessage?: string;
}

const KIND_LABEL: Record<PresenceKind, string> = {
  website: "homepage",
  naver_blog: "Legacy blog",
  instagram: "Instagram",
  naver_place: "Legacy directory",
  other: "Other",
};

function normalizeWebUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function isWebUrl(u: string): boolean {
  return /^https?:\/\/[^\s./]+(\.[^\s./]+)+/i.test(u);
}

function isAssetRef(value: unknown): value is AssetRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Partial<AssetRef>;
  return typeof ref.assetId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref.assetId)
    && typeof ref.url === 'string'
    && ref.url.length > 0;
}

export function Step02Existing() {
  const { watch, setValue, getValues } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const { setImportedBadge, assetPolicyV2Ready } = useSurveyUx();

  const presence = watch('existingPresence') ?? [];

  // 로컬 입력 (form.existingPresence 역추출로 최초 state를 직접 초기화)
  const [instaHandle, setInstaHandle] = useState(() => {
    const value = presence.find((item) => item.kind === 'instagram')?.url;
    return value ? handleFromSnsUrl('instagram', value) : '';
  });
  const [websiteUrl, setWebsiteUrl] = useState(
    () => presence.find((item) => item.kind === 'website')?.url ?? '',
  );
  const [skip, setSkip] = useState(false);

  const [owned, setOwned] = useState(false);
  const [importing, setImporting] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  const presences = useMemo(() => {
    const out: { kind: PresenceKind; url: string }[] = [];
    if (instaHandle.trim().replace(/^@+/, '')) {
      out.push({ kind: 'instagram', url: snsUrlFromHandle('instagram', instaHandle) });
    }
    const web = normalizeWebUrl(websiteUrl);
    if (isWebUrl(web)) out.push({ kind: 'website', url: web });
    return out.slice(0, 5);
  }, [instaHandle, websiteUrl]);

  // 입력한 원천을 form.existingPresence에 저장 (가져오기 없이도)
  useEffect(() => {
    setValue('existingPresence', presences, { shouldValidate: false });
  }, [presences, setValue]);

  const imageCandidates = useMemo(() => {
    if (!results) return [];
    const urls = results.flatMap((r) => r.extracted?.imageUrls ?? []);
    return Array.from(new Set(urls)).slice(0, 18);
  }, [results]);

  const runImport = async () => {
    if (presences.length === 0 || importing) return;
    setImporting(true);
    setResults(null);
    setSelectedImages([]);
    try {
      const res = await fetch('/api/onboarding/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: presences }),
      });
      const data = (await res.json().catch(() => null)) as
        | { results?: ImportResult[]; error?: { message?: string } }
        | null;
      if (!res.ok) {
        toast('error', data?.error?.message ?? "Import failed.");
        return;
      }
      const list = Array.isArray(data?.results) ? data.results : [];
      setResults(list);

      const extracted = list.filter(
        (result): result is ImportResult & { extracted: ImportExtracted } => Boolean(result.extracted),
      );

      // 검증 가능한 구조화 사실만 해당 필드에 자동 채운다. 기존 고객 입력은 덮어쓰지 않는다.
      const firstStructured = extracted.map((result) => result.extracted.structured);
      const businessName = firstStructured.find((facts) => facts.businessName)?.businessName;
      const description = firstStructured.find((facts) => facts.description)?.description;
      if (businessName && !(getValues('businessName') ?? '').trim()) {
        setValue('businessName', businessName.slice(0, 60), { shouldValidate: false });
      }
      if (description && !(getValues('tagline') ?? '').trim()) {
        setValue('tagline', description.slice(0, 80), { shouldValidate: false });
      }

      const importedFacts = firstStructured.flatMap((facts) => [
        facts.phone ? { key: 'phone' as const, value: facts.phone } : null,
        facts.address ? { key: 'address' as const, value: facts.address } : null,
        facts.openingHours ? { key: 'openingHours' as const, value: facts.openingHours } : null,
      ]).filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
      const factsByKey = new Map((getValues('factualAnswers') ?? []).map((fact) => [fact.key, fact]));
      for (const fact of importedFacts) {
        if (!factsByKey.get(fact.key)?.value.trim()) {
          factsByKey.set(fact.key, { ...fact, value: fact.value.slice(0, 500), source: 'customer_import' });
        }
      }
      setValue('factualAnswers', [...factsByKey.values()], { shouldValidate: false });

      const importedItems = firstStructured.flatMap((facts) => facts.contentItems);
      const itemKey = (item: { name: string; price?: string }) => `${item.name.trim()}\u0000${item.price?.trim() ?? ''}`;
      const itemsByKey = new Map((getValues('contentItems') ?? []).map((item) => [itemKey(item), item]));
      for (const item of importedItems) {
        if (!item.name.trim()) continue;
        const normalized = {
          name: item.name.trim(),
          ...(item.price?.trim() ? { price: item.price.trim() } : {}),
        };
        if (!itemsByKey.has(itemKey(normalized))) itemsByKey.set(itemKey(normalized), normalized);
      }
      setValue('contentItems', [...itemsByKey.values()].slice(0, 20), { shouldValidate: false });

      const importedSourceByUrl = new Map(
        (getValues('importedContentSources') ?? []).map((source) => [source.url, source]),
      );
      for (const result of extracted) {
        if (!result.provenance) continue;
        const fields = Object.entries(result.extracted.structured)
          .filter(([key, value]) => key !== 'commercialPhrases'
            && key !== 'contentItems'
            && (Array.isArray(value) ? value.length > 0 : Boolean(value)))
          .map(([key]) => key);
        if (result.extracted.structured.commercialPhrases.length) fields.push('commercialPhrases');
        if (result.extracted.structured.contentItems.length) fields.push('contentItems');
        importedSourceByUrl.set(result.provenance.sourceUrl, {
          url: result.provenance.sourceUrl,
          origin: 'customer_import',
          extractedAt: result.provenance.extractedAt,
          fields,
        });
      }
      setValue('importedContentSources', [...importedSourceByUrl.values()].slice(0, 5), {
        shouldValidate: false,
      });

      // 추출 텍스트 → S3 providedContent 프리필
      const parts = extracted
        .map((r) => {
          const e = r.extracted;
          return [e.title, e.description, ...(e.headings ?? []).slice(0, 8), e.text]
            .filter(Boolean)
            .join('\n');
        })
        .filter(Boolean);
      const importedText = parts.join('\n\n').trim().slice(0, 5000);
      if (importedText) {
        const cur = (getValues('providedContent') ?? '').trim();
        const merged = cur ? `${cur}\n\n${importedText}`.slice(0, 5000) : importedText;
        setValue('providedContent', merged, { shouldValidate: false });
        setImportedBadge(true);
        toast('success', "I filled in the information I brought into the corresponding input box. Please check and fix it.");
      } else {
        toast('info', "There is no text to automatically import. Please paste the original text directly.");
      }
    } catch {
      toast('error', "Please check your network connection.");
    } finally {
      setImporting(false);
    }
  };

  const toggleImage = (url: string) =>
    setSelectedImages((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url]));

  const ingestSelected = async () => {
    if (selectedImages.length === 0 || ingesting) return;
    setIngesting(true);
    try {
      const res = await fetch('/api/onboarding/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingestImageUrls: selectedImages.slice(0, 12) }),
      });
      const data = (await res.json().catch(() => null)) as
        | { imageUrls?: string[]; assetRefs?: unknown; error?: { message?: string } }
        | null;
      if (!res.ok) {
        toast('error', data?.error?.message ?? "Failed to import image.");
        return;
      }
      const got = Array.isArray(data?.imageUrls) ? data.imageUrls : [];
      if (got.length === 0) {
        toast('info', "There were no images I could import.");
        return;
      }
      const importedRefs = data?.assetRefs === undefined
        ? []
        : Array.isArray(data.assetRefs) && data.assetRefs.every(isAssetRef)
          ? data.assetRefs
          : null;
      if (importedRefs === null
        || (data?.assetRefs !== undefined
          && (importedRefs.length !== got.length
            || importedRefs.some((ref, index) => ref.url !== got[index])))) {
        toast('error', "The server origin record for the imported image could not be verified. Please try again.");
        return;
      }
      const cur = getValues('storePhotoUrls') ?? [];
      const next = Array.from(new Set([...cur, ...got])).slice(0, 12);
      setValue('storePhotoUrls', next, { shouldValidate: false });
      if (importedRefs.length) {
        const currentImportedRefs = getValues('importedPhotoAssetRefs') ?? [];
        const byId = new Map(currentImportedRefs.map((ref) => [ref.assetId, ref]));
        for (const ref of importedRefs) byId.set(ref.assetId, ref);
        setValue('importedPhotoAssetRefs', [...byId.values()].slice(0, 12), { shouldValidate: false });
      }
      setSelectedImages([]);
      toast(
        'success',
        assetPolicyV2Ready
          ? `${got.length} image${got.length === 1 ? '' : 's'} imported. Confirm usage rights in the photo step before using them as photographic evidence.`
          : `${got.length} image${got.length === 1 ? '' : 's'} imported. Review them in the next photo step.`,
      );
    } catch {
      toast('error', "Please check your network connection.");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-7">
      <StepIntro>
        Add a website or social profile you control. We will import only verifiable public content, and you can review it before publishing.
      </StepIntro>

      {!skip ? (
        <>
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <AtSign className="h-4 w-4 text-ob-muted" /> Instagram
              </span>
            }
                hint="Enter your Instagram handle. An @handle or full profile URL works."
          >
            <div className="flex items-stretch overflow-hidden rounded-ob border border-ob-border bg-ob-surface focus-within:border-ob-accent-strong focus-within:ring-1 focus-within:ring-ob-accent">
              <span className="flex items-center bg-ob-bg px-3 text-[15px] text-ob-muted">
                instagram.com/
              </span>
              <input
                value={instaHandle}
                onChange={(e) => setInstaHandle(e.target.value)}
                placeholder="myshop"
                className="w-full bg-transparent px-3 py-2.5 text-[16px] text-ob-ink outline-none placeholder:text-ob-muted/70"
              />
            </div>
          </Field>

          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-ob-muted" /> Homepage address <span className="font-normal text-ob-muted">(select)</span>
              </span>
            }
          >
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="example.com"
              className={obInput}
            />
          </Field>

          <div className="rounded-ob border border-ob-border bg-ob-bg p-4">
            <label className="flex items-start gap-2.5 text-[15px] text-ob-ink">
              <input
                type="checkbox"
                checked={owned}
                onChange={(e) => setOwned(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#2D63F0]"
              />
                      <span>I own or manage this page.</span>
            </label>
            <p className="mt-1.5 pl-7 text-[13px] leading-relaxed text-ob-muted">
                    Import only from channels you own or manage. Do not import another organization’s content.
            </p>
            <div className="mt-3 pl-7">
              <Button
                type="button"
                onClick={() => void runImport()}
                loading={importing}
                disabled={!owned || presences.length === 0}
              >
                Import from my channels
              </Button>
              {presences.length === 0 ? (
                    <span className="ml-2 text-[13px] text-ob-muted">Add at least one channel first.</span>
              ) : null}
            </div>
          </div>

          {importing ? (
            <div className="flex items-center gap-2 text-[15px] text-ob-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Retrieving content from the channel...
            </div>
          ) : null}

          {results ? (
            <div className="space-y-4">
              {results.map((r, i) => (
                <div key={`${r.url}-${i}`} className="rounded-ob border border-ob-border bg-ob-surface p-4">
                  <div className="mb-1.5 text-[13px] font-semibold text-ob-accent-strong">
                    {KIND_LABEL[r.kind]}
                  </div>
                  {r.extracted ? (
                    <div className="space-y-1.5">
                      {r.extracted.title ? (
                        <p className="text-[15px] font-medium text-ob-ink">{r.extracted.title}</p>
                      ) : null}
                      {r.extracted.description ? (
                        <p className="text-[14px] leading-relaxed text-ob-muted">
                          {r.extracted.description}
                        </p>
                      ) : null}
                      {r.extracted.text ? (
                        <p className="line-clamp-3 text-[13px] leading-relaxed text-ob-muted">
                          {r.extracted.text}
                        </p>
                      ) : null}
                      {[
                        r.extracted.structured.phone && "contact",
                        r.extracted.structured.address && "address",
                        r.extracted.structured.openingHours && "Business hours",
                        r.extracted.structured.contentItems.length > 0 && "Menu/Service",
                      ].filter(Boolean).length ? (
                        <p className="pt-1 text-[12px] font-medium text-ob-accent-strong">
                          Autofill: {[
                            r.extracted.structured.phone && "contact",
                            r.extracted.structured.address && "address",
                            r.extracted.structured.openingHours && "Business hours",
                            r.extracted.structured.contentItems.length > 0 && "Menu/Service",
                          ].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {r.fallbackMessage ? (
                    <p className="text-[14px] leading-relaxed text-ob-muted">{r.fallbackMessage}</p>
                  ) : null}
                </div>
              ))}

              {imageCandidates.length > 0 ? (
                <div>
                  <p className="mb-2 text-[15px] font-medium text-ob-ink">
                    Please select a photo to import <span className="font-normal text-ob-muted">(select)</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {imageCandidates.map((url) => {
                      const on = selectedImages.includes(url);
                      return (
                        <button
                          key={url}
                          type="button"
                          onClick={() => toggleImage(url)}
                          aria-pressed={on}
                          className={cn(
                            'relative aspect-square overflow-hidden rounded-ob border-2 transition-colors',
                            on ? 'border-ob-accent-strong ring-1 ring-ob-accent' : 'border-ob-border',
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Candidate photos to import" className="h-full w-full object-cover" />
                          {on ? (
                            <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ob-accent-strong text-[11px] font-bold text-white">
                              ✓
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void ingestSelected()}
                      loading={ingesting}
                      disabled={selectedImages.length === 0}
                    >
                      selected photo {selectedImages.length > 0 ? `${selectedImages.length} images` : ''}import
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-[13px] text-ob-muted">
                  <ImageOff className="h-3.5 w-3.5" /> There are no photo candidates brought in. You can upload it directly in the next step.
                </p>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setSkip(true)}
            className="text-[14px] text-ob-muted underline transition-colors hover:text-ob-ink"
          >
                No channels yet · Skip for now
          </button>
        </>
      ) : (
        <div className="rounded-ob border border-dashed border-ob-border bg-ob-bg px-5 py-8 text-center">
          <p className="text-[15px] text-ob-ink">Channel input was skipped.</p>
          <p className="mt-1 text-[13px] text-ob-muted">You can re-enter it if necessary.</p>
          <button
            type="button"
            onClick={() => setSkip(false)}
            className="mt-3 text-[14px] text-ob-accent-strong underline"
          >
            Enter again
          </button>
        </div>
      )}
    </div>
  );
}
