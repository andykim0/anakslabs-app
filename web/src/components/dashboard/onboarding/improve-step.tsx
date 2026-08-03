'use client';

/**
 * [I2] 개선 모드 온보딩 짧은 흐름 — 기존(fresh) 8스텝 설문(SurveyStep)을 대체하는 step1 컴포넌트.
 *
 * 진단한 기존 사이트를 1회 가져와(improveExtract) 최소 질문(목적·업종·지역·콘텐츠·색·톤)만 받고
 * SurveyInput을 조립해 onComplete로 넘긴다. 이후 wizard의 step2~5(움직임→디자인→부가기능→생성)는
 * fresh와 동일하게 재사용된다. onComplete 시그니처는 SurveyStep과 동일한 계약.
 *
 * 로컬 흐름(localStep 1~3): 1) 불러오는 중/요약  2) 확인(목적·업종·지역·콘텐츠)  3) 색·분위기.
 * RHF를 쓰지 않고 로컬 useState로만 관리한다(짧은 흐름).
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ImageIcon, ListChecks, Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import type { ContentItem, LivePurposeId, SiteGoalId, SurveyInput } from '@/lib/types/domain';
import { LIVE_PURPOSE_IDS, findPurpose } from '@/lib/data/purpose-taxonomy';
import { capabilityOf } from '@/lib/onboarding/purpose-capabilities';
import { contentGateStatus, requirementOf } from '@/lib/onboarding/content-requirements';
import { defaultImageStyle } from '@/lib/onboarding/image-style';
import {
  imageDirectionToLegacyCandidateStyle,
  recommendedImageDirection,
} from '@/lib/assets/image-directions';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { REFERENCE_SAMPLES, styleIdsForSamples } from '@/lib/design/reference-samples';
import { improveExtract, type ImproveExtractResult } from '../api';
import { cn } from '../ui';
import { Chip, Field, SelectCard, StepIntro, obInput, deriveColors } from './steps/shared';
import type { ImproveContext } from './wizard';

/** 팔레트 시드가 없을 때(저채도/실패) 쓰는 중립 기본 톤 */
const NEUTRAL_SEED = { primary: '#1f2430', secondary: '#f4f5f7' } as const;

/** step3 톤 칩 (최대 2개 선택) — fresh 설문과 라벨 통일 */
const TONE_CHIPS = ["tranquil", "friendly", "modern", "luxurious", "bold", "minimalist"];

/** step3 무드 칩 — REFERENCE_SAMPLES 상위 6개 */
const MOOD_SAMPLES = REFERENCE_SAMPLES.slice(0, 6);

/** 편집용 콘텐츠 항목(입력 controlled를 위해 전 필드 string) */
type EditItem = {
  name: string;
  price: string;
  description: string;
  photoUrl: string;
  photoAssetRef?: ContentItem['photoAssetRef'];
};

function toEditItem(it: ContentItem): EditItem {
  return {
    name: it.name ?? '',
    price: it.price ?? '',
    description: it.description ?? '',
    photoUrl: it.photoUrl ?? '',
    photoAssetRef: it.photoAssetRef,
  };
}

/** URL → 호스트(www 제거). 파싱 실패 시 원문 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 가져온 텍스트에서 목적 추론 (spec 키워드 규칙) */
export function inferPurpose(r: ImproveExtractResult): LivePurposeId {
  const hay = `${r.title ?? ''} ${r.description ?? ''} ${r.text ?? ''}`;
  if (/메뉴|카페|음식/.test(hay)) return 'local_store';
  if (/시술|미용|예약/.test(hay)) return 'booking_service';
  if (/학원|교육|수업/.test(hay)) return 'edu_membership';
  if (/포트폴리오|작업|디자이너/.test(hay)) return 'portfolio';
  return 'company_brand';
}

/** 본문에서 '시/구/동' 패턴 첫 매칭 → 지역 기본값(없으면 '') */
export function inferRegion(text: string): string {
  const m = /([가-힣]{2,}(?:시|구|동))/.exec(text ?? '');
  return m ? m[1] : '';
}

function Swatch({ color, size = 'h-5 w-5' }: { color: string; size?: string }) {
  return (
    <span
      className={cn('inline-block rounded-full border border-black/10', size)}
      style={{ backgroundColor: color }}
    />
  );
}

export function ImproveStep({
  improve,
  defaultBusinessName,
  assetPolicyV2Ready = false,
  onComplete,
}: {
  improve: ImproveContext;
  defaultBusinessName?: string;
  /** Server-derived rollout readiness. False keeps improve requests legacy-compatible. */
  assetPolicyV2Ready?: boolean;
  onComplete: (survey: SurveyInput) => void;
}) {
  const host = useMemo(() => hostOf(improve.url), [improve.url]);

  // ── 가져오기 상태 ──
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [extract, setExtract] = useState<ImproveExtractResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // [H1] "다시 시도" 트리거 — 증가 시 import effect 재실행
  const [retryKey, setRetryKey] = useState(0);

  // ── 로컬 스텝 ──
  const [localStep, setLocalStep] = useState<1 | 2 | 3>(1);

  // ── step2: 확인 ──
  const [purposeId, setPurposeId] = useState<LivePurposeId>('company_brand');
  const [industry, setIndustry] = useState(host);
  const [region, setRegion] = useState('');
  const [items, setItems] = useState<EditItem[]>([]);

  // ── step3: 색·분위기 ──
  const [useSeedPalette, setUseSeedPalette] = useState(false);
  const [moodId, setMoodId] = useState<string | null>(null);
  const [showMoods, setShowMoods] = useState(false);
  const [refine, setRefine] = useState(false);
  const [tone, setTone] = useState<string[]>([]);

  // ── 가져오기 실행 ──
  // [H1] StrictMode 안전: startedRef(1회 가드) 제거 — 이중 마운트 시 mount2가 실제 fetch를 수행해
  // 상태를 채운다(dev 이중 fetch는 무해, rate limit 5/분). cancelled는 '그 effect 인스턴스'만 무시.
  // + 12초 상한 타임아웃(서버 8초와 별개 UX 안전망) → 에러 상태 + "다시 시도" 버튼. retryKey로 재시도.
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setErrorMsg("It takes a long time to load. Please try again or start by entering it manually.");
      setPhase('error');
    }, 12000);
    (async () => {
      try {
        const result = await improveExtract(improve.url);
        if (cancelled) return;
        clearTimeout(timeout);
        setExtract(result);
        setPurposeId(inferPurpose(result));
        setIndustry((result.title ?? '').trim() || host);
        setRegion(inferRegion(result.text ?? ''));
        setItems((result.contentItems ?? []).map(toEditItem));
        setUseSeedPalette(Boolean(result.paletteSeed));
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        clearTimeout(timeout);
        setErrorMsg(err instanceof Error ? err.message : "The existing site failed to load.");
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [improve.url, host, retryKey]);

  // [H1] 재시도 — 이벤트 핸들러에서 loading 리셋 후 effect 재실행 트리거
  const retryImport = () => {
    setErrorMsg('');
    setPhase('loading');
    setRetryKey((k) => k + 1);
  };

  // ── 파생 게이트 ──
  const req = requirementOf(purposeId);
  const showPrice = req.fields.price !== 'hidden';
  const filledCount = items.filter((it) => it.name.trim().length > 0).length;
  const gate = contentGateStatus(purposeId, filledCount);

  const seed = extract?.paletteSeed ?? null;
  const preview =
    useSeedPalette && seed
      ? { primary: seed.primary, secondary: seed.secondary }
      : moodId
        ? (() => {
            const d = deriveColors({ moodIds: [moodId], colorOverride: '', secondaryColor: '' });
            return { primary: d.colorPreference, secondary: d.secondaryColor };
          })()
        : { primary: NEUTRAL_SEED.primary, secondary: NEUTRAL_SEED.secondary };

  // ── 항목 편집 ──
  const updateItem = (i: number, patch: Partial<EditItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const addItem = () =>
    setItems((prev) => [...prev, { name: '', price: '', description: '', photoUrl: '', photoAssetRef: undefined }]);

  // ── 무드/팔레트 선택 ──
  const pickSeed = () => {
    setUseSeedPalette(true);
    setMoodId(null);
  };
  const toggleMood = (id: string) => {
    if (moodId === id) {
      setMoodId(null);
      setUseSeedPalette(Boolean(seed));
    } else {
      setMoodId(id);
      setUseSeedPalette(false);
    }
  };
  const toggleTone = (chip: string) => {
    setTone((prev) => {
      if (prev.includes(chip)) return prev.filter((t) => t !== chip);
      if (prev.length >= 2) return prev;
      return [...prev, chip];
    });
  };

  // ── 최종 조립 ──
  const submit = () => {
    const industryClean = industry.trim() || host;
    const template = resolveTemplate(purposeId, industryClean);
    const purposeDef = findPurpose(purposeId);
    const group = purposeDef?.group;

    const cleanItems: ContentItem[] = items
      .map((it) => ({
        name: it.name.trim(),
        price: it.price.trim() || undefined,
        description: it.description.trim() || undefined,
        photoUrl: it.photoUrl.trim() || undefined,
        photoAssetRef: it.photoAssetRef,
      }))
      .filter((it) => it.name.length > 0);

    let colorPreference = '';
    let secondaryColor: string | undefined;
    if (useSeedPalette && seed) {
      colorPreference = seed.primary;
      secondaryColor = seed.secondary;
    } else if (moodId) {
      const d = deriveColors({ moodIds: [moodId], colorOverride: '', secondaryColor: '' });
      colorPreference = d.colorPreference;
      secondaryColor = d.secondaryColor;
    }
    if (!colorPreference) {
      colorPreference = NEUTRAL_SEED.primary;
      secondaryColor = NEUTRAL_SEED.secondary;
    }

    const businessName = (extract?.title ?? '').trim() || defaultBusinessName?.trim() || host;
    const providedContent = (extract?.text ?? '').slice(0, 3000).trim() || undefined;
    const storePhotoUrls = (extract?.imageUrls ?? []).slice(0, 12);
    const referenceStyleIds = !useSeedPalette && moodId ? styleIdsForSamples([moodId]) : undefined;
    const siteGoal: SiteGoalId | undefined = group === 'serve' ? 'directions' : undefined;
    // Imported/extracted URLs are not direct customer-upload evidence. Improve mode therefore
    // always starts in an explicitly artistic direction and carries no factual asset refs.
    const imageDirectionId = recommendedImageDirection({ industry: industryClean, tone });

    onComplete({
      purposeId,
      purpose: purposeDef?.label ?? purposeId,
      businessName,
      industry: industryClean,
      region: region.trim() || undefined,
      tone,
      colorPreference,
      secondaryColor,
      ...(assetPolicyV2Ready ? { imageDirectionId } : {}),
      imageStyle: assetPolicyV2Ready
        ? imageDirectionToLegacyCandidateStyle(imageDirectionId)
        : defaultImageStyle(industryClean),
      storePhotoUrls: storePhotoUrls.length ? storePhotoUrls : undefined,
      referenceImageUrls: [],
      referenceStyleIds: referenceStyleIds && referenceStyleIds.length ? referenceStyleIds : undefined,
      siteGoal,
      contentItems: cleanItems,
      providedContent,
      mode: 'improve',
      sourceUrl: improve.url,
      sourceScanId: improve.scanId,
      sectionPlan: planFromTemplate(template),
      pagePlan: pagePlanFromTemplate(template),
      templateId: template.id,
      extraNotes: refine ? "Please refine it to feel a little more sophisticated and luxurious." : undefined,
    });
  };

  const title =
    localStep === 1
      ? phase === 'ready'
        ? "Please check the loaded contents"
        : "Loading an existing site"
      : localStep === 2
        ? "Please check where it is"
        : "Please choose the color and mood";

  return (
    <div className="space-y-5">
      {/* 개선 모드 안내 배너 */}
      <div className="rounded-xl border border-ob-border bg-ob-accent-soft px-4 py-3">
        <p className="flex items-start gap-2 text-sm leading-6 text-ob-ink">
          <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-ob-accent-strong" />
          <span>
            {improve.issueCount > 0
              ? `found in diagnosis${improve.issueCount}Fix the dog problem and rebuild.`
              : "Rebuild to reflect the diagnosis results."}{' '}
            All you have to do is import the existing content and check a few things.
          </span>
        </p>
      </div>

      <div className="overflow-hidden rounded-ob border border-ob-border bg-ob-surface text-ob-ink shadow-sm">
        {/* 헤더 */}
        <div className="px-5 pt-5 sm:px-7 sm:pt-6">
          <div className="flex gap-1.5" role="progressbar" aria-valuenow={localStep} aria-valuemin={1} aria-valuemax={3}>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={cn('h-1.5 flex-1 rounded-full transition-colors', n <= localStep ? 'bg-ob-accent-strong' : 'bg-ob-border')}
              />
            ))}
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[22px] font-semibold sm:text-[24px]">{title}</h2>
            <span className="shrink-0 text-[13px] text-ob-muted">{localStep} / 3</span>
          </div>
        </div>

        {/* 본문 */}
        <div className="px-5 py-6 sm:px-7">
          {/* ── step 1: 불러오는 중 / 요약 / 에러 ── */}
          {localStep === 1 ? (
            phase === 'loading' ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-ob-accent-strong" />
                <p className="text-[15px] text-ob-ink">Looking at the existing site...</p>
                <p className="text-[13px] text-ob-muted">Importing content and color signals from {host}.</p>
              </div>
            ) : phase === 'error' ? (
              <div className="space-y-4">
                <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-[14px] leading-relaxed text-ob-danger">
                  {errorMsg}
                </div>
                <p className="text-[14px] leading-relaxed text-ob-muted">
                  We couldn’t import it automatically. Try again, or enter a few details manually.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={retryImport}
                    className="inline-flex h-12 items-center gap-2 rounded-ob border border-ob-border bg-ob-surface px-5 text-[15px] font-medium text-ob-ink transition-colors hover:border-ob-accent-strong hover:text-ob-accent-strong"
                  >
                    <Loader2 className="h-4 w-4" />
                    try again
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalStep(2)}
                    className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-ob-accent-strong"
                  >
                    Start with direct input
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <StepIntro>This is what I brought. Just check the purpose and color below and we will make it right away.</StepIntro>
                <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-4">
                  <p className="text-[13px] text-ob-muted">mutual</p>
                  <p className="mt-0.5 text-[17px] font-semibold text-ob-ink">
                    {(extract?.title ?? '').trim() || defaultBusinessName || host}
                  </p>
                  {(extract?.description ?? '').trim() ? (
                    <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-ob-muted">
                      {extract?.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-ob-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <ListChecks className="h-4 w-4 text-ob-accent-strong" />
                      imported item {extract?.contentItems?.length ?? 0} items
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-ob-accent-strong" />
                      image {extract?.imageUrls?.length ?? 0} images
                    </span>
                    {seed ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch color={seed.primary} size="h-4 w-4" />
                        Representative color detected
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          ) : null}

          {/* ── step 2: 확인 ── */}
          {localStep === 2 ? (
            <div className="space-y-7">
              <StepIntro>I chose it in advance based on the content I brought. If they are different, please click to change them.</StepIntro>

              {/* 목적 */}
              <Field label="What kind of place is it?">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {LIVE_PURPOSE_IDS.map((id) => {
                    const def = findPurpose(id);
                    const cap = capabilityOf(id);
                    return (
                      <SelectCard key={id} selected={purposeId === id} onClick={() => setPurposeId(id)} ariaLabel={def?.label}>
                        <span className={cn('text-[15px] font-semibold', purposeId === id ? 'text-ob-accent-strong' : 'text-ob-ink')}>
                          {def?.label}
                        </span>
                        <span className="mt-1 text-[13px] leading-relaxed text-ob-muted">{cap.summary}</span>
                      </SelectCard>
                    );
                  })}
                </div>
              </Field>

              {/* 업종 */}
              <Field label="Industry" hint="Example: Cafe/Dessert / Beauty Salon / Coding Academy. It is used to determine search and design direction.">
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Please enter your industry"
                  className={obInput}
                />
              </Field>

              {/* 지역 */}
              <Field label="Region (optional)" hint="Example: Yeonhui-dong, Seoul. It helps with local search exposure.">
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Please write your region"
                  className={obInput}
                />
              </Field>

              {/* 콘텐츠 항목 */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <label className="text-[15px] font-medium text-ob-ink">
                    {req.itemLabel} inventory <span className="text-ob-danger">*</span>
                  </label>
                  <span className="shrink-0 text-[13px] text-ob-muted">{filledCount} items</span>
                </div>

                <div className="space-y-2.5">
                  {items.map((it, index) => (
                    <div key={index} className="flex gap-3 rounded-ob border border-ob-border bg-ob-surface p-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={it.name}
                            onChange={(e) => updateItem(index, { name: e.target.value })}
                            placeholder={`${req.itemLabel}name`}
                            className={cn(obInput, 'min-w-0 flex-1')}
                          />
                          {showPrice ? (
                            <input
                              value={it.price}
                              onChange={(e) => updateItem(index, { price: e.target.value })}
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
                          value={it.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder="One-line description (optional)"
                          className={obInput}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex h-11 items-center gap-1.5 rounded-ob border border-dashed border-ob-border px-4 text-[14px] text-ob-muted transition-colors hover:border-ob-muted hover:text-ob-ink"
                >
                  <Plus className="h-4 w-4" />
                  {req.itemLabel} Add
                </button>

                {gate.needMore > 0 ? (
                  <p className="rounded-ob border border-ob-border bg-ob-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-ob-danger">
                    {req.itemLabel}You must enter at least one to proceed to the next step.
                  </p>
                ) : gate.recommendedShort > 0 ? (
                  <p className="text-[13px] leading-relaxed text-ob-muted">
                    {req.itemLabel}Lee {gate.recommendedItems}If there are more than one, it is more advantageous for search exposure.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── step 3: 색·분위기 ── */}
          {localStep === 3 ? (
            <div className="space-y-7">
              <StepIntro>You can keep the existing feel or choose a new one.</StepIntro>

              {/* 그대로 팔레트 or 기본 톤 */}
              {seed ? (
                <button
                  type="button"
                  onClick={pickSeed}
                  aria-pressed={useSeedPalette}
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-ob border p-4 text-left transition-colors',
                    useSeedPalette ? 'border-ob-accent-strong bg-ob-accent-soft ring-1 ring-ob-accent' : 'border-ob-border bg-ob-surface hover:border-ob-muted',
                  )}
                >
                  {useSeedPalette ? (
                    <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-ob-accent-strong text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1.5">
                    <Swatch color={seed.primary} />
                    {seed.secondary ? <Swatch color={seed.secondary} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[15px] font-semibold', useSeedPalette ? 'text-ob-accent-strong' : 'text-ob-ink')}>
                      Same as the existing site
                    </span>
                    <span className="block text-[13px] text-ob-muted">Imported Representative Colors {seed.primary}Make it with</span>
                  </span>
                </button>
              ) : (
                <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-[13px] leading-relaxed text-ob-muted">
                  We couldn’t identify a clear representative color. Start with the default or choose a direction below.
                </div>
              )}

              {/* 직접 고르기 (무드) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowMoods((v) => !v)}
                  className="text-[14px] font-medium text-ob-accent-strong underline"
                >
                  {showMoods ? "fold feeling" : "Pick your own"}
                </button>
                {showMoods ? (
                  <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {MOOD_SAMPLES.map((s) => {
                      const selected = moodId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleMood(s.id)}
                          aria-pressed={selected}
                          className={cn(
                            'relative flex flex-col overflow-hidden rounded-ob border text-left transition-colors',
                            selected ? 'border-ob-accent-strong ring-1 ring-ob-accent' : 'border-ob-border hover:border-ob-muted',
                          )}
                        >
                          <span
                            className="h-14 w-full"
                            style={{ backgroundImage: `linear-gradient(135deg, ${s.swatch[0]}, ${s.swatch[1]})` }}
                          />
                          {selected ? (
                            <span className="absolute top-1.5 right-1.5 rounded-full bg-ob-accent-strong px-2 py-0.5 text-[10px] font-bold text-white">
                              Select
                            </span>
                          ) : null}
                          <span className="flex flex-col gap-0.5 p-2.5">
                            <span className={cn('text-[13px] font-semibold', selected ? 'text-ob-accent-strong' : 'text-ob-ink')}>
                              {s.label}
                            </span>
                            <span className="text-[11px] leading-4 text-ob-muted">{s.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* 조금 더 세련되게 (표식) */}
              <label className="flex cursor-pointer items-center gap-2.5 rounded-ob border border-ob-border bg-ob-surface px-4 py-3">
                <input
                  type="checkbox"
                  checked={refine}
                  onChange={(e) => setRefine(e.target.checked)}
                  className="h-4 w-4 accent-ob-accent-strong"
                />
                <span className="text-[14px] text-ob-ink">Please refine it a little more.</span>
              </label>

              {/* 톤 */}
              <Field label={<>Mood (tone) <span className="font-normal text-ob-muted">(maximum 2)</span></>}>
                <div className="flex flex-wrap gap-2">
                  {TONE_CHIPS.map((chip) => (
                    <Chip key={chip} selected={tone.includes(chip)} onClick={() => toggleTone(chip)}>
                      {chip}
                    </Chip>
                  ))}
                </div>
              </Field>

              {/* 적용될 색 미리보기 */}
              <div className="flex items-center gap-2.5 rounded-ob border border-ob-border bg-ob-bg px-4 py-3">
                <span className="text-[13px] text-ob-muted">color to be applied</span>
                <Swatch color={preview.primary} />
                {preview.secondary ? <Swatch color={preview.secondary} /> : null}
                <span className="text-[13px] text-ob-muted">{preview.primary}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* 하단 네비 */}
        {localStep === 1 && phase === 'ready' ? (
          <div className="sticky bottom-0 z-10 flex items-center justify-end border-t border-ob-border bg-ob-surface/95 px-5 py-3 backdrop-blur sm:px-7">
            <button
              type="button"
              onClick={() => setLocalStep(2)}
              className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-ob-accent-strong"
            >
              Continue with this content
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {localStep === 2 ? (
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-ob-border bg-ob-surface/95 px-5 py-3 backdrop-blur sm:px-7">
            <button
              type="button"
              onClick={() => setLocalStep(1)}
              className="inline-flex h-12 items-center gap-1.5 rounded-ob border border-ob-border bg-ob-surface px-4 text-[15px] text-ob-ink transition-colors hover:border-ob-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => setLocalStep(3)}
              disabled={!gate.ok}
              className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-ob-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {localStep === 3 ? (
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-ob-border bg-ob-surface/95 px-5 py-3 backdrop-blur sm:px-7">
            <button
              type="button"
              onClick={() => setLocalStep(2)}
              className="inline-flex h-12 items-center gap-1.5 rounded-ob border border-ob-border bg-ob-surface px-4 text-[15px] text-ob-ink transition-colors hover:border-ob-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={tone.length === 0}
              className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-ob-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              make it this way
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
