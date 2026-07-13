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
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ImageIcon, ListChecks, Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import type { ContentItem, LivePurposeId, SiteGoalId, SurveyInput } from '@/lib/types/domain';
import { LIVE_PURPOSE_IDS, findPurpose } from '@/lib/data/purpose-taxonomy';
import { capabilityOf } from '@/lib/onboarding/purpose-capabilities';
import { contentGateStatus, requirementOf } from '@/lib/onboarding/content-requirements';
import { defaultImageStyle } from '@/lib/onboarding/image-style';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { REFERENCE_SAMPLES, styleIdsForSamples } from '@/lib/design/reference-samples';
import { improveExtract, type ImproveExtractResult } from '../api';
import { cn } from '../ui';
import { Chip, Field, SelectCard, StepIntro, obInput, deriveColors } from './steps/shared';
import type { ImproveContext } from './wizard';

/** 팔레트 시드가 없을 때(저채도/실패) 쓰는 중립 기본 톤 */
const NEUTRAL_SEED = { primary: '#1f2430', secondary: '#f4f5f7' } as const;

/** step3 톤 칩 (최대 2개 선택) — fresh 설문과 라벨 통일 */
const TONE_CHIPS = ['차분한', '친근한', '모던', '고급스러운', '대담한', '미니멀'];

/** step3 무드 칩 — REFERENCE_SAMPLES 상위 6개 */
const MOOD_SAMPLES = REFERENCE_SAMPLES.slice(0, 6);

/** 편집용 콘텐츠 항목(입력 controlled를 위해 전 필드 string) */
type EditItem = { name: string; price: string; description: string; photoUrl: string };

function toEditItem(it: ContentItem): EditItem {
  return {
    name: it.name ?? '',
    price: it.price ?? '',
    description: it.description ?? '',
    photoUrl: it.photoUrl ?? '',
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
function inferPurpose(r: ImproveExtractResult): LivePurposeId {
  const hay = `${r.title ?? ''} ${r.description ?? ''} ${r.text ?? ''}`;
  if (/메뉴|카페|음식/.test(hay)) return 'local_store';
  if (/시술|미용|예약/.test(hay)) return 'booking_service';
  if (/학원|교육|수업/.test(hay)) return 'edu_membership';
  if (/포트폴리오|작업|디자이너/.test(hay)) return 'portfolio';
  return 'company_brand';
}

/** 본문에서 '시/구/동' 패턴 첫 매칭 → 지역 기본값(없으면 '') */
function inferRegion(text: string): string {
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
  onComplete,
}: {
  improve: ImproveContext;
  defaultBusinessName?: string;
  onComplete: (survey: SurveyInput) => void;
}) {
  const host = useMemo(() => hostOf(improve.url), [improve.url]);

  // ── 가져오기 상태 ──
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [extract, setExtract] = useState<ImproveExtractResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

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

  // ── 가져오기 1회 실행 ──
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const result = await improveExtract(improve.url);
        if (cancelled) return;
        setExtract(result);
        setPurposeId(inferPurpose(result));
        setIndustry((result.title ?? '').trim() || host);
        setRegion(inferRegion(result.text ?? ''));
        setItems((result.contentItems ?? []).map(toEditItem));
        setUseSeedPalette(Boolean(result.paletteSeed));
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : '기존 사이트를 불러오지 못했어요.');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [improve.url, host]);

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
    setItems((prev) => [...prev, { name: '', price: '', description: '', photoUrl: '' }]);

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

    onComplete({
      purposeId,
      purpose: purposeDef?.label ?? purposeId,
      businessName,
      industry: industryClean,
      region: region.trim() || undefined,
      tone,
      colorPreference,
      secondaryColor,
      imageStyle: defaultImageStyle(industryClean),
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
      extraNotes: refine ? '조금 더 세련되고 고급스러운 느낌으로 다듬어 주세요.' : undefined,
    });
  };

  const title =
    localStep === 1
      ? phase === 'ready'
        ? '불러온 내용을 확인해주세요'
        : '기존 사이트를 불러오고 있어요'
      : localStep === 2
        ? '어떤 곳인지 확인해주세요'
        : '색과 분위기를 정해주세요';

  return (
    <div className="space-y-5">
      {/* 개선 모드 안내 배너 */}
      <div className="rounded-xl border border-ob-border bg-ob-accent-soft px-4 py-3">
        <p className="flex items-start gap-2 text-sm leading-6 text-ob-ink">
          <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-ob-accent-strong" />
          <span>
            {improve.issueCount > 0
              ? `진단에서 찾은 ${improve.issueCount}개 문제를 고쳐서 다시 짓습니다.`
              : '진단 결과를 반영해서 다시 짓습니다.'}{' '}
            기존 내용을 가져와 몇 가지만 확인하면 돼요.
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
                <p className="text-[15px] text-ob-ink">기존 사이트를 살펴보는 중…</p>
                <p className="text-[13px] text-ob-muted">{host} 의 내용과 색을 가져오고 있어요.</p>
              </div>
            ) : phase === 'error' ? (
              <div className="space-y-4">
                <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-[14px] leading-relaxed text-ob-danger">
                  {errorMsg}
                </div>
                <p className="text-[14px] leading-relaxed text-ob-muted">
                  자동으로 가져오지 못했어요. 직접 몇 가지만 입력해서 시작할 수 있어요.
                </p>
                <button
                  type="button"
                  onClick={() => setLocalStep(2)}
                  className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-ob-ink transition-colors hover:bg-ob-accent-strong hover:text-white"
                >
                  직접 입력으로 시작
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <StepIntro>가져온 내용이에요. 다음에서 목적·색만 확인하면 바로 만들어드려요.</StepIntro>
                <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-4">
                  <p className="text-[13px] text-ob-muted">상호</p>
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
                      가져온 항목 {extract?.contentItems?.length ?? 0}개
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-ob-accent-strong" />
                      이미지 {extract?.imageUrls?.length ?? 0}장
                    </span>
                    {seed ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch color={seed.primary} size="h-4 w-4" />
                        대표 색 감지됨
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
              <StepIntro>가져온 내용을 바탕으로 미리 골라뒀어요. 다르면 눌러서 바꿔주세요.</StepIntro>

              {/* 목적 */}
              <Field label="어떤 곳인가요?">
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
              <Field label="업종" hint="예: 카페·디저트 / 미용실 / 코딩 학원. 검색·디자인 방향을 잡는 데 쓰여요.">
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="업종을 적어주세요"
                  className={obInput}
                />
              </Field>

              {/* 지역 */}
              <Field label="지역 (선택)" hint="예: 서울 연희동. 지역 검색 노출에 도움이 돼요.">
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="지역을 적어주세요"
                  className={obInput}
                />
              </Field>

              {/* 콘텐츠 항목 */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <label className="text-[15px] font-medium text-ob-ink">
                    {req.itemLabel} 목록 <span className="text-ob-danger">*</span>
                  </label>
                  <span className="shrink-0 text-[13px] text-ob-muted">{filledCount}개</span>
                </div>

                <div className="space-y-2.5">
                  {items.map((it, index) => (
                    <div key={index} className="flex gap-3 rounded-ob border border-ob-border bg-ob-surface p-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={it.name}
                            onChange={(e) => updateItem(index, { name: e.target.value })}
                            placeholder={`${req.itemLabel} 이름`}
                            className={cn(obInput, 'min-w-0 flex-1')}
                          />
                          {showPrice ? (
                            <input
                              value={it.price}
                              onChange={(e) => updateItem(index, { price: e.target.value })}
                              placeholder="가격 (선택)"
                              inputMode="numeric"
                              className={cn(obInput, 'w-24 shrink-0 sm:w-28')}
                            />
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            aria-label="항목 삭제"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ob border border-ob-border text-ob-muted transition-colors hover:border-ob-danger hover:text-ob-danger"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <input
                          value={it.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder="한 줄 설명 (선택)"
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
                  {req.itemLabel} 추가
                </button>

                {gate.needMore > 0 ? (
                  <p className="rounded-ob border border-ob-border bg-ob-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-ob-danger">
                    {req.itemLabel}을(를) 1개 이상 입력해야 다음으로 넘어갈 수 있어요.
                  </p>
                ) : gate.recommendedShort > 0 ? (
                  <p className="text-[13px] leading-relaxed text-ob-muted">
                    {req.itemLabel}이(가) {gate.recommendedItems}개 이상이면 검색 노출에 더 유리해요.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── step 3: 색·분위기 ── */}
          {localStep === 3 ? (
            <div className="space-y-7">
              <StepIntro>기존 느낌을 그대로 살리거나, 새 느낌을 골라도 돼요.</StepIntro>

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
                      기존 사이트 느낌 그대로
                    </span>
                    <span className="block text-[13px] text-ob-muted">가져온 대표 색 {seed.primary}로 만들어요.</span>
                  </span>
                </button>
              ) : (
                <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-[13px] leading-relaxed text-ob-muted">
                  기존 사이트에서 뚜렷한 대표 색을 찾지 못했어요. 기본 톤으로 시작하거나 아래에서 느낌을 골라주세요.
                </div>
              )}

              {/* 직접 고르기 (무드) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowMoods((v) => !v)}
                  className="text-[14px] font-medium text-ob-accent-strong underline"
                >
                  {showMoods ? '느낌 접기' : '직접 고르기'}
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
                              선택
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
                <span className="text-[14px] text-ob-ink">조금 더 세련되게 다듬어 주세요</span>
              </label>

              {/* 톤 */}
              <Field label={<>분위기(톤) <span className="font-normal text-ob-muted">(최대 2개)</span></>}>
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
                <span className="text-[13px] text-ob-muted">적용될 색</span>
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
              className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-ob-ink transition-colors hover:bg-ob-accent-strong hover:text-white"
            >
              이 내용으로 계속
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
              이전
            </button>
            <button
              type="button"
              onClick={() => setLocalStep(3)}
              disabled={!gate.ok}
              className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-ob-ink transition-colors hover:bg-ob-accent-strong hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
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
              이전
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={tone.length === 0}
              className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-ob-ink transition-colors hover:bg-ob-accent-strong hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              이 방향으로 만들기
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
