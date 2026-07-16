'use client';

/**
 * S2 이미 있는 걸 알려주세요 — 기존 채널(인스타/홈페이지/네이버 플레이스) 입력 → 소유 확인 →
 * 가져오기(POST /api/onboarding/import) → 추출 텍스트 요약 + 이미지 후보 선택 → ingest.
 * 추출 텍스트는 S3 providedContent 프리필, 선택 이미지는 storePhotoUrls에 추가(S4 반영).
 */
import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { AtSign, Globe, ImageOff, Loader2, MapPin } from 'lucide-react';
import type { PresenceKind } from '@/lib/types/domain';
import type { AssetRef } from '@/lib/assets/provenance';
import { handleFromSnsUrl, snsUrlFromHandle } from '@/lib/onboarding/sns';
import { Button, cn } from '../../ui';
import { useToast } from '../../toast';
import { Field, StepIntro, obInput, useSurveyUx, type SurveyForm } from './shared';

interface ImportExtracted {
  title?: string;
  description?: string;
  headings: string[];
  text: string;
  imageUrls: string[];
}
interface ImportResult {
  kind: PresenceKind;
  url: string;
  ok: boolean;
  extracted?: ImportExtracted;
  fallbackMessage?: string;
}

const KIND_LABEL: Record<PresenceKind, string> = {
  website: '홈페이지',
  instagram: '인스타그램',
  naver_place: '네이버 플레이스',
  other: '기타',
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
  const [naverUrl, setNaverUrl] = useState(
    () => presence.find((item) => item.kind === 'naver_place')?.url ?? '',
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
    const nav = normalizeWebUrl(naverUrl);
    if (isWebUrl(nav)) out.push({ kind: 'naver_place', url: nav });
    return out.slice(0, 3);
  }, [instaHandle, websiteUrl, naverUrl]);

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
        toast('error', data?.error?.message ?? '가져오기에 실패했어요.');
        return;
      }
      const list = Array.isArray(data?.results) ? data.results : [];
      setResults(list);

      // 추출 텍스트 → S3 providedContent 프리필
      const parts = list
        .filter((r) => r.extracted)
        .map((r) => {
          const e = r.extracted!;
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
        toast('success', '가져온 내용을 다음 단계 원문 칸에 담았어요.');
      } else {
        toast('info', '자동으로 가져올 텍스트가 없어요. 원문을 직접 붙여넣어 주세요.');
      }
    } catch {
      toast('error', '네트워크 연결을 확인해 주세요.');
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
        toast('error', data?.error?.message ?? '이미지 가져오기에 실패했어요.');
        return;
      }
      const got = Array.isArray(data?.imageUrls) ? data.imageUrls : [];
      if (got.length === 0) {
        toast('info', '가져올 수 있는 이미지가 없었어요.');
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
        toast('error', '가져온 이미지의 서버 출처 기록을 확인하지 못했습니다. 다시 시도해 주세요.');
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
          ? `사진 ${got.length}장을 담았어요. 가져온 사진은 실사 사진 자격으로 자동 전환되지 않아요.`
          : `사진 ${got.length}장을 담았어요. 다음 사진 단계에서 확인할 수 있어요.`,
      );
    } catch {
      toast('error', '네트워크 연결을 확인해 주세요.');
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-7">
      <StepIntro>
        가지고 계신 채널을 알려주시면, 소개 글과 사진을 가져와 다음 단계 입력을 채워드려요. 없으면 건너뛰어도 돼요.
      </StepIntro>

      {!skip ? (
        <>
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <AtSign className="h-4 w-4 text-ob-muted" /> 인스타그램
              </span>
            }
            hint="아이디만 적어주세요. @나 전체 주소를 붙여넣어도 알아서 정리해요."
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
                <Globe className="h-4 w-4 text-ob-muted" /> 홈페이지 주소 <span className="font-normal text-ob-muted">(선택)</span>
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

          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-ob-muted" /> 네이버 플레이스 <span className="font-normal text-ob-muted">(선택)</span>
              </span>
            }
            hint="네이버 지도 → 내 가게 → 공유 → 링크 복사한 주소를 붙여넣어 주세요."
          >
            <input
              value={naverUrl}
              onChange={(e) => setNaverUrl(e.target.value)}
              placeholder="https://naver.me/..."
              className={obInput}
            />
          </Field>

          <div className="rounded-ob border border-ob-border bg-ob-bg p-4">
            <label className="flex items-start gap-2.5 text-[15px] text-ob-ink">
              <input
                type="checkbox"
                checked={owned}
                onChange={(e) => setOwned(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#174DDA]"
              />
              <span>제가 직접 운영하는 페이지입니다.</span>
            </label>
            <p className="mt-1.5 pl-7 text-[13px] leading-relaxed text-ob-muted">
              내 채널에서만 내용을 가져와요. 남의 페이지 내용은 가져오지 않아요.
            </p>
            <div className="mt-3 pl-7">
              <Button
                type="button"
                onClick={() => void runImport()}
                loading={importing}
                disabled={!owned || presences.length === 0}
              >
                내 채널에서 가져오기
              </Button>
              {presences.length === 0 ? (
                <span className="ml-2 text-[13px] text-ob-muted">먼저 채널을 하나 이상 입력해 주세요.</span>
              ) : null}
            </div>
          </div>

          {importing ? (
            <div className="flex items-center gap-2 text-[15px] text-ob-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> 채널에서 내용을 가져오는 중이에요...
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
                    가져올 사진을 골라주세요 <span className="font-normal text-ob-muted">(선택)</span>
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
                          <img src={url} alt="가져올 사진 후보" className="h-full w-full object-cover" />
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
                      선택한 사진 {selectedImages.length > 0 ? `${selectedImages.length}장 ` : ''}가져오기
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-[13px] text-ob-muted">
                  <ImageOff className="h-3.5 w-3.5" /> 가져온 사진 후보는 없어요. 다음 단계에서 직접 올릴 수 있어요.
                </p>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setSkip(true)}
            className="text-[14px] text-ob-muted underline transition-colors hover:text-ob-ink"
          >
            아직 채널이 없어요 · 건너뛸게요
          </button>
        </>
      ) : (
        <div className="rounded-ob border border-dashed border-ob-border bg-ob-bg px-5 py-8 text-center">
          <p className="text-[15px] text-ob-ink">채널 입력을 건너뛰었어요.</p>
          <p className="mt-1 text-[13px] text-ob-muted">필요하면 다시 입력할 수 있어요.</p>
          <button
            type="button"
            onClick={() => setSkip(false)}
            className="mt-3 text-[14px] text-ob-accent-strong underline"
          >
            다시 입력하기
          </button>
        </div>
      )}
    </div>
  );
}
