'use client';

/**
 * [survey v5] 설문 스텝 = 짧은 코어 브리프 → 조기 SitePlan → 조건부 심화 호스트.
 *
 * 단일 useForm + FormProvider로 상태를 들고, currentStep(1~9)으로 화면을 전환한다.
 * 각 스텝(steps/stepNN-*.tsx)은 useFormContext로 읽고 쓴다. 마지막 확인에서
 * SurveyForm → SurveyInput 으로 조립해 onComplete를 호출한다. onComplete 시그니처·initialValues
 * prop은 외부 wizard.tsx와의 계약이라 불변.
 *
 * sectionPlan/pagePlan/templateId는 목적·업종 → resolveTemplate → planFromTemplate/
 * pagePlanFromTemplate 로 결정적 파생(별도 편집 스텝 없음). referenceImageUrls는 수집 중단 → 항상 [].
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import type {
  CandidateStyle,
  LivePurposeId,
  SiteGoalId,
  SitePurposeId,
  SurveyInput,
} from '@/lib/types/domain';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import {
  REAL_PHOTO_REQUIRED_GUIDANCE,
  canSelectRealPhoto,
  imageDirectionToLegacyCandidateStyle,
  recommendedImageDirection,
} from '@/lib/assets/image-directions';
import { styleIdsForSamples } from '@/lib/design/reference-samples';
import { defaultImageStyle } from '@/lib/onboarding/image-style';
import { missingRequiredFacts } from '@/lib/content/content-depth';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { isRecognizedReservationUrl } from '@/lib/analytics/trackable-actions';
import { isHttpsUrl } from '@/lib/safe-url';
import { buildSitePlan } from '@/lib/content/site-plan';
import { useToast } from '../toast';
import { cn } from '../ui';
import {
  STEP_REQUIRED_FIELDS,
  StepFade,
  SurveyUxProvider,
  deriveColors,
  surveyFormSchema,
  toFormDefaults,
  type SurveyForm,
} from './steps/shared';
import { Step01Basics } from './steps/step01-basics';
import { Step02Existing } from './steps/step02-existing';
import { Step03Content } from './steps/step03-content';
import { Step04Photos } from './steps/step04-photos';
import { Step05ImageStyle } from './steps/step05-image-style';
import { Step06MoodColor } from './steps/step06-mood-color';
import { Step07Direction } from './steps/step07-direction';
import { Step08Review } from './steps/step08-review';
import {
  StepConditionalDeepening,
  type DeepeningTarget,
} from './steps/step-conditional-deepening';
import { WireframePreview, sectionKey } from './wireframe-preview';

const TOTAL_STEPS = 9;
const SURVEY_DRAFT_PREFIX = 'daboim:survey-brief:draft:';

const STEP_TITLES: Record<number, string> = {
  1: '이미 홈페이지·블로그·플레이스가 있으세요?',
  2: '무엇을 하는 곳인가요?',
  3: '3~5분 핵심 브리프를 완성해요',
  4: '먼저 홈페이지 구성을 확인해주세요',
  5: '원하는 구성만 더 채워주세요',
  6: '사진을 올려주세요',
  7: '이미지 느낌을 골라주세요',
  8: '마음에 드는 느낌을 골라주세요',
  9: '입력하신 내용을 확인해주세요',
};

function scrollToTop() {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cleanOptional(value?: string): string | undefined {
  const cleaned = (value ?? '').trim();
  return cleaned || undefined;
}

export function parseSurveyDraft(raw: string): SurveyForm | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    // 저장 시점에는 필수 질문도 아직 비어 있을 수 있다. 빈 필수값만 검사용 표식으로
    // 바꾸고 나머지 전체 구조를 같은 폼 스키마로 검증한 뒤 원래 미완성 값을 복원한다.
    const validation = surveyFormSchema.safeParse({
      ...candidate,
      purposeId: typeof candidate.purposeId === 'string' && candidate.purposeId
        ? candidate.purposeId
        : '__draft__',
      businessName: typeof candidate.businessName === 'string' && candidate.businessName
        ? candidate.businessName
        : '__draft__',
      industry: typeof candidate.industry === 'string' && candidate.industry
        ? candidate.industry
        : '__draft__',
      tone: Array.isArray(candidate.tone) && candidate.tone.length ? candidate.tone : ['__draft__'],
    });
    return validation.success ? candidate as unknown as SurveyForm : null;
  } catch {
    return null;
  }
}

/** 이미지·AI 호출 없이 조기 와이어프레임이 소비할 현재 폼의 결정적 SitePlan 입력. */
export function surveyForEarlySitePlan(values: SurveyForm): SurveyInput {
  const purposeId = (values.purposeId || 'local_store') as SitePurposeId;
  const template = resolveTemplate(purposeId, values.industry);
  const colors = deriveColors(values);
  const facts = (values.factualAnswers ?? [])
    .map((answer) => ({ ...answer, value: answer.value.trim() }))
    .filter((answer) => answer.value.length > 0);
  const faqAnswers = (values.faqAnswers ?? [])
    .map((answer) => ({ ...answer, answer: answer.answer.trim() }))
    .filter((answer) => answer.answer.length > 0);
  const proofs = (values.proofItems ?? [])
    .map((proof) => ({ ...proof, content: proof.content.trim() }))
    .filter((proof) => proof.content.length > 0);
  const contentItems = (values.contentItems ?? [])
    .map((item) => ({
      name: item.name.trim(),
      price: cleanOptional(item.price),
      description: cleanOptional(item.description),
      photoUrl: cleanOptional(item.photoUrl),
      ...(item.photoAssetRef ? { photoAssetRef: item.photoAssetRef } : {}),
    }))
    .filter((item) => item.name.length > 0);

  return {
    purposeId,
    purpose: findPurpose(purposeId)?.label ?? purposeId,
    businessName: values.businessName.trim() || '상호명',
    industry: values.industry.trim(),
    tone: values.tone.length ? values.tone : ['차분한'],
    colorPreference: colors.colorPreference || '#174DDA',
    secondaryColor: colors.secondaryColor,
    referenceImageUrls: [],
    existingPresence: values.existingPresence.length ? values.existingPresence : undefined,
    contentDepth: {
      version: 2,
      facts,
      faqAnswers,
      imports: values.importedContentSources ?? [],
      mainStorytelling: {
        version: 1,
        ...(cleanOptional(values.brandStory) ? { brandStory: cleanOptional(values.brandStory) } : {}),
        ...(cleanOptional(values.brandOrigin) ? { origin: cleanOptional(values.brandOrigin) } : {}),
        ...(cleanOptional(values.brandPhilosophy) ? { philosophy: cleanOptional(values.brandPhilosophy) } : {}),
      },
      surveyBrief: {
        version: 1,
        ...(cleanOptional(values.targetCustomer) ? { targetCustomer: cleanOptional(values.targetCustomer) } : {}),
        ...(cleanOptional(values.visitorNeed) ? { visitorNeed: cleanOptional(values.visitorNeed) } : {}),
        ...(cleanOptional(values.valueProposition) ? { valueProposition: cleanOptional(values.valueProposition) } : {}),
        ...(proofs.length ? { proofs } : {}),
      },
    },
    siteGoal: values.siteGoal as SiteGoalId | undefined,
    highlights: values.highlights.filter((value) => value.trim()),
    storePhotoUrls: values.storePhotoUrls,
    contentItems,
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    providedContent: cleanOptional(values.providedContent),
  };
}

export function SurveyStep({
  defaultBusinessName,
  initialValues,
  improveSeed,
  existingSiteId,
  assetPolicyV2Ready = false,
  onComplete,
}: {
  defaultBusinessName?: string;
  initialValues: SurveyInput | null;
  /** [I1] 개선 모드 시드 — 폼에 mode/sourceUrl/sourceScanId 프리필(핸드오프). 미지정=fresh */
  improveSeed?: { url: string; scanId: string };
  /** Existing owned site scope for direct uploads and attestations. */
  existingSiteId?: string;
  /** Server-derived rollout readiness. False preserves the legacy request contract. */
  assetPolicyV2Ready?: boolean;
  onComplete: (values: SurveyInput) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [importedBadge, setImportedBadge] = useState(false);
  const [removedSections, setRemovedSections] = useState<Set<string>>(new Set());
  const [deepeningTarget, setDeepeningTarget] = useState<DeepeningTarget | null>(null);
  const draftReady = useRef(false);
  const draftKey = `${SURVEY_DRAFT_PREFIX}${existingSiteId ?? 'new'}`;

  const methods = useForm<SurveyForm>({
    resolver: zodResolver(surveyFormSchema),
    defaultValues: useMemo(
      () => toFormDefaults(initialValues, defaultBusinessName),
      [initialValues, defaultBusinessName],
    ),
  });
  const { trigger, getValues, handleSubmit, setValue, reset } = methods;
  const watchedValues = useWatch({ control: methods.control }) as SurveyForm;
  const earlySurvey = surveyForEarlySitePlan(watchedValues);
  const earlyPlan = buildSitePlan(earlySurvey);
  const plannedDeepeningTargets = [...new Map(
    earlyPlan.sections
      .filter((section) => section.mode === 'full' && section.type !== 'hero' && section.type !== 'custom')
      .map((section) => [section.type, {
        type: section.type,
        name: section.name,
        inputHint: section.brief,
      }]),
  ).values()];

  useEffect(() => {
    if (initialValues || improveSeed || typeof window === 'undefined') {
      draftReady.current = true;
      return;
    }
    try {
      const stored = window.localStorage.getItem(draftKey);
      const parsed = stored ? parseSurveyDraft(stored) : null;
      if (parsed) {
        reset(parsed);
        window.setTimeout(() => {
          draftReady.current = true;
        }, 0);
        return;
      }
    } catch {
      // 손상되거나 저장 한도를 넘긴 로컬 초안은 기본값으로 안전하게 시작한다.
    }
    draftReady.current = true;
  }, [draftKey, improveSeed, initialValues, reset]);

  useEffect(() => {
    if (!draftReady.current || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(watchedValues));
    } catch {
      // 저장 공간 부족은 설문 진행을 막지 않는다.
    }
  }, [draftKey, watchedValues]);

  // [I1] 개선 모드 진입 시 폼에 진단 컨텍스트 프리필 → onComplete가 SurveyInput.mode/source*로 전달
  useEffect(() => {
    if (!improveSeed) return;
    setValue('mode', 'improve');
    setValue('sourceUrl', improveSeed.url);
    setValue('sourceScanId', improveSeed.scanId);
  }, [improveSeed, setValue]);

  const goTo = (target: number) => {
    setStep(Math.min(TOTAL_STEPS, Math.max(1, target)));
    scrollToTop();
  };

  const goNext = async () => {
    const required = STEP_REQUIRED_FIELDS[step] ?? [];
    if (required.length) {
      const ok = await trigger(required);
      if (!ok) return;
    }
    if (step === 2 && !(getValues('region') ?? '').trim()) {
      toast('info', '지역을 입력해 주세요.');
      return;
    }
    if (step === 3) {
      const pid = ((getValues('purposeId') as LivePurposeId) || 'local_store') as LivePurposeId;
      const missingFacts = missingRequiredFacts(pid, getValues('factualAnswers') ?? []);
      if (missingFacts.length) {
        toast('info', '별표로 표시된 핵심 정보를 입력해 주세요.');
        return;
      }
      const goal = getValues('siteGoal');
      if (!goal) {
        toast('info', '방문자가 뭘 해주면 좋을지 하나 골라주세요.');
        return;
      }
      if (goal === 'call') {
        const phone = (getValues('factualAnswers') ?? []).find(
          (fact) => fact.key === 'phone' && fact.value.trim(),
        );
        if (!phone) {
          toast('info', '전화 버튼에 연결할 연락처를 입력해 주세요.');
          return;
        }
      }
      if (goal === 'reserve' && !isRecognizedReservationUrl(getValues('conversionUrl') ?? '')) {
        toast('info', '실제 예약 페이지의 https 주소를 입력해 주세요.');
        return;
      }
      if (
        goal === 'kakao_inquiry' &&
        getValues('conversionKind') === 'messenger_url' &&
        !isHttpsUrl(getValues('conversionUrl') ?? '')
      ) {
        toast('info', '실제 메신저의 https 주소를 입력해 주세요.');
        return;
      }
    }
    if (step === 7) {
      if (!assetPolicyV2Ready) {
        goTo(step + 1);
        return;
      }
      const values = getValues();
      const recommended = recommendedImageDirection({
        industry: values.industry,
        tone: values.tone,
      });
      const direction = values.imageDirectionId ?? recommended;
      if (direction === 'real_photo' && !canSelectRealPhoto(values)) {
        toast('info', REAL_PHOTO_REQUIRED_GUIDANCE);
        return;
      }
      setValue('imageDirectionId', direction, { shouldValidate: true });
      setValue('imageStyle', imageDirectionToLegacyCandidateStyle(direction), {
        shouldValidate: false,
      });
    }
    if (step === 8) {
      const { colorPreference } = deriveColors(getValues());
      if (!colorPreference) {
        toast('info', '느낌을 하나 고르거나 대표 색을 골라주세요.');
        return;
      }
    }
    goTo(step + 1);
  };

  const submit = handleSubmit((values) => {
    const pid = values.purposeId as SitePurposeId;
    const template = resolveTemplate(pid, values.industry);
    const { colorPreference, secondaryColor } = deriveColors(values);
    if (!colorPreference) {
      toast('info', '느낌을 하나 고르거나 대표 색을 골라주세요.');
      goTo(8);
      return;
    }
    const clean = (s?: string) => {
      const t = (s ?? '').trim();
      return t ? t : undefined;
    };
    const highlights = (values.highlights ?? []).map((h) => h.trim()).filter(Boolean).slice(0, 3);
    const factualAnswers = (values.factualAnswers ?? [])
      .map((answer) => ({ ...answer, value: answer.value.trim() }))
      .filter((answer) => answer.value.length > 0);
    const faqAnswers = (values.faqAnswers ?? [])
      .map((answer) => ({ ...answer, answer: answer.answer.trim() }))
      .filter((answer) => answer.answer.length > 0);
    const importedContentSources = values.importedContentSources ?? [];
    const proofs = (values.proofItems ?? [])
      .map((proof) => ({ ...proof, content: proof.content.trim() }))
      .filter((proof) => proof.content.length > 0);
    const presence = values.existingPresence ?? [];
    const recommended = recommendedImageDirection({
      industry: values.industry,
      tone: values.tone,
    });
    const selectedImageDirection = values.imageDirectionId ?? recommended;
    if (assetPolicyV2Ready && selectedImageDirection === 'real_photo' && !canSelectRealPhoto(values)) {
      toast('info', REAL_PHOTO_REQUIRED_GUIDANCE);
      goTo(7);
      return;
    }
    const heroPhotoUrl = clean(values.heroPhotoUrl);
    const conversionDestination = (() => {
      if (values.siteGoal === 'call') return { kind: 'phone_fact' as const };
      if (values.siteGoal === 'reserve') {
        const url = clean(values.conversionUrl);
        return url && isRecognizedReservationUrl(url) ? { kind: 'reservation_url' as const, url } : undefined;
      }
      if (values.siteGoal === 'kakao_inquiry') {
        if (values.conversionKind === 'messenger_url') {
          const url = clean(values.conversionUrl);
          return url && isHttpsUrl(url) ? { kind: 'messenger_url' as const, url } : undefined;
        }
        return { kind: 'contact_form' as const };
      }
      return undefined;
    })();
    // A matching URL cannot establish provenance, but a mismatch must drop a stale ref.
    const heroPhotoAssetRef = values.heroPhotoAssetRef?.url === heroPhotoUrl
      ? values.heroPhotoAssetRef
      : undefined;

    const finalSectionPlan = planFromTemplate(template).filter(
      (section) => !removedSections.has(sectionKey(section)),
    );
    const completedSurvey: SurveyInput = {
      purposeId: pid,
      purpose: findPurpose(pid)?.label ?? pid,
      businessName: values.businessName.trim(),
      industry: values.industry.trim(),
      tone: values.tone,
      colorPreference,
      secondaryColor,
      ...(assetPolicyV2Ready ? { imageDirectionId: selectedImageDirection } : {}),
      // Flag-off requests preserve the exact legacy default/selection contract.
      imageStyle: assetPolicyV2Ready
        ? imageDirectionToLegacyCandidateStyle(selectedImageDirection)
        : (values.imageStyle as CandidateStyle | undefined) ?? defaultImageStyle(values.industry),
      heroPhotoUrl,
      ...(assetPolicyV2Ready && heroPhotoAssetRef ? { heroPhotoAssetRef } : {}),
      storePhotoUrls: values.storePhotoUrls.length ? values.storePhotoUrls : undefined,
      ...(assetPolicyV2Ready && values.storePhotoAssetRefs.length
        ? { storePhotoAssetRefs: values.storePhotoAssetRefs }
        : {}),
      ...(assetPolicyV2Ready && values.importedPhotoAssetRefs.length
        ? { importedPhotoAssetRefs: values.importedPhotoAssetRefs }
        : {}),
      ...(assetPolicyV2Ready && values.generalAssetAttestationId
        ? { generalAssetAttestationId: values.generalAssetAttestationId }
        : {}),
      ...(assetPolicyV2Ready && values.personPhotoAssetIds.length
        ? { personPhotoAssetIds: values.personPhotoAssetIds }
        : {}),
      ...(assetPolicyV2Ready && values.nonPersonPhotoAssetIds.length
        ? { nonPersonPhotoAssetIds: values.nonPersonPhotoAssetIds }
        : {}),
      logoUrl: clean(values.logoUrl),
      referenceImageUrls: [], // [v4] 수집 중단 — 항상 빈 배열
      referenceStyleIds: values.moodIds.length ? styleIdsForSamples(values.moodIds) : undefined,
      referenceDesignId: clean(values.referenceDesignId),
      existingPresence: presence.length ? presence : undefined,
      contentDepth: {
        version: 2 as const,
        facts: factualAnswers,
        faqAnswers,
        imports: importedContentSources,
        mainStorytelling: {
          version: 1 as const,
          ...(clean(values.brandStory) ? { brandStory: clean(values.brandStory) } : {}),
          ...(clean(values.brandOrigin) ? { origin: clean(values.brandOrigin) } : {}),
          ...(clean(values.brandPhilosophy) ? { philosophy: clean(values.brandPhilosophy) } : {}),
        },
        surveyBrief: {
          version: 1 as const,
          ...(clean(values.targetCustomer) ? { targetCustomer: clean(values.targetCustomer) } : {}),
          ...(clean(values.visitorNeed) ? { visitorNeed: clean(values.visitorNeed) } : {}),
          ...(clean(values.valueProposition) ? { valueProposition: clean(values.valueProposition) } : {}),
          ...(conversionDestination ? { conversionDestination } : {}),
          ...(proofs.length ? { proofs } : {}),
        },
      },
      siteGoal: values.siteGoal as SiteGoalId | undefined,
      ...(values.siteGoal === 'reserve' && conversionDestination?.kind === 'reservation_url'
        ? { reservationMode: 'external_link' as const, reservationUrl: conversionDestination.url }
        : {}),
      highlights: highlights.length ? highlights : undefined,
      region: clean(values.region),
      mode: values.mode === 'improve' ? 'improve' : undefined,
      sourceUrl: clean(values.sourceUrl),
      sourceScanId: clean(values.sourceScanId),
      contentItems: (values.contentItems ?? [])
        .map((it) => ({
          name: it.name.trim(),
          price: it.price?.trim() || undefined,
          description: it.description?.trim() || undefined,
          photoUrl: it.photoUrl?.trim() || undefined,
          ...(assetPolicyV2Ready && it.photoAssetRef ? { photoAssetRef: it.photoAssetRef } : {}),
        }))
        .filter((it) => it.name.length > 0),
      sectionPlan: finalSectionPlan,
      pagePlan: pagePlanFromTemplate(template),
      templateId: template.id,
      tagline: clean(values.tagline),
      providedContent: clean(values.providedContent),
      extraNotes: clean(values.extraNotes),
    };
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(draftKey);
    }
    onComplete(completedSurvey);
  });

  const toggleRemovedSection = (key: string) => {
    setRemovedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isLast = step === TOTAL_STEPS;
  const primaryLabel = isLast ? '생성 시작' : '다음';

  return (
    <FormProvider {...methods}>
      <SurveyUxProvider value={{
        goTo,
        importedBadge,
        setImportedBadge,
        siteId: existingSiteId,
        assetPolicyV2Ready,
      }}>
        <div className="overflow-hidden rounded-ob border border-ob-border bg-ob-surface text-ob-ink shadow-sm">
          {/* 진행바 + 스텝 제목 */}
          <div className="px-5 pt-5 sm:px-7 sm:pt-6">
            <div className="flex gap-1.5" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <span
                  key={i}
                  className={cn('h-1.5 flex-1 rounded-full transition-colors', i < step ? 'bg-ob-accent-strong' : 'bg-ob-border')}
                />
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[22px] font-semibold sm:text-[24px]">{STEP_TITLES[step]}</h2>
              <span className="shrink-0 text-[13px] text-ob-muted">
                {step} / {TOTAL_STEPS}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-ob-muted" aria-live="polite">
              작성 중인 답변은 이 브라우저에 자동 저장되고, 다시 들어오면 이어서 쓸 수 있어요.
            </p>
          </div>

          {/* 스텝 본문 */}
          <div className="px-5 py-6 sm:px-7">
            <StepFade key={step}>
              {step === 1 ? <Step02Existing /> : null}
              {step === 2 ? <Step01Basics /> : null}
              {step === 3 ? <div className="space-y-8"><Step03Content mode="core" /><Step07Direction mode="core" /></div> : null}
              {step === 4 ? (
                <div className="space-y-5">
                  <p className="text-[14px] leading-relaxed text-ob-muted">
                    지금 답한 내용으로 실제 생성될 구성이에요. 빠진 구성은 아래에서 골라 바로 채울 수 있어요.
                  </p>
                  <WireframePreview
                    survey={earlySurvey}
                    removed={removedSections}
                    onToggle={toggleRemovedSection}
                    onMissingSection={(target) => {
                      setDeepeningTarget(target);
                      goTo(5);
                    }}
                  />
                </div>
              ) : null}
              {step === 5 ? (
                <StepConditionalDeepening
                  target={deepeningTarget}
                  availableTargets={plannedDeepeningTargets}
                  onSelectTarget={setDeepeningTarget}
                  onBackToPlan={() => {
                    setDeepeningTarget(null);
                    goTo(4);
                  }}
                />
              ) : null}
              {step === 6 ? <Step04Photos /> : null}
              {step === 7 ? <Step05ImageStyle assetPolicyV2Ready={assetPolicyV2Ready} /> : null}
              {step === 8 ? <Step06MoodColor /> : null}
              {step === 9 ? <Step08Review /> : null}
            </StepFade>
          </div>

          {/* 하단 고정 이전/다음 (모바일 스티키, 44px+) */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-ob-border bg-ob-surface/95 px-5 py-3 backdrop-blur sm:px-7">
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              disabled={step === 1}
              className="inline-flex h-12 items-center gap-1.5 rounded-ob border border-ob-border bg-ob-surface px-4 text-[15px] text-ob-ink transition-colors hover:border-ob-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              이전
            </button>
            <button
              type="button"
              onClick={() => (isLast ? void submit() : void goNext())}
              className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-ob-accent-strong"
            >
              {isLast ? <Sparkles className="h-4 w-4" /> : null}
              {primaryLabel}
              {isLast ? null : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </SurveyUxProvider>
    </FormProvider>
  );
}
