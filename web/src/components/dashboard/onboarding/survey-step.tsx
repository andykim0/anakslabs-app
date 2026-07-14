'use client';

/**
 * [survey v4] 설문 스텝 = 8스텝 서브위저드 호스트.
 *
 * 단일 useForm + FormProvider로 상태를 들고, currentStep(1~8)으로 화면을 전환한다.
 * 각 스텝(steps/stepNN-*.tsx)은 useFormContext로 읽고 쓴다. 마지막 S8 "생성 시작"에서
 * SurveyForm → SurveyInput 으로 조립해 onComplete를 호출한다. onComplete 시그니처·initialValues
 * prop은 외부 wizard.tsx와의 계약이라 불변.
 *
 * sectionPlan/pagePlan/templateId는 목적·업종 → resolveTemplate → planFromTemplate/
 * pagePlanFromTemplate 로 결정적 파생(별도 편집 스텝 없음). referenceImageUrls는 수집 중단 → 항상 [].
 */
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import type { CandidateStyle, LivePurposeId, SiteGoalId, SitePurposeId, SurveyInput } from '@/lib/types/domain';
import { contentGateStatus, requirementOf } from '@/lib/onboarding/content-requirements';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import { defaultImageStyle } from '@/lib/onboarding/image-style';
import { styleIdsForSamples } from '@/lib/design/reference-samples';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
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

const TOTAL_STEPS = 8;

const STEP_TITLES: Record<number, string> = {
  1: '무엇을 하는 곳인가요?',
  2: '이미 있는 걸 알려주세요',
  3: '소개·메뉴 원문을 알려주세요',
  4: '사진을 올려주세요',
  5: '이미지 느낌을 골라주세요',
  6: '마음에 드는 느낌을 골라주세요',
  7: '방향을 잡아주세요',
  8: '입력하신 내용을 확인해주세요',
};

function scrollToTop() {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function SurveyStep({
  defaultBusinessName,
  initialValues,
  improveSeed,
  onComplete,
}: {
  defaultBusinessName?: string;
  initialValues: SurveyInput | null;
  /** [I1] 개선 모드 시드 — 폼에 mode/sourceUrl/sourceScanId 프리필(핸드오프). 미지정=fresh */
  improveSeed?: { url: string; scanId: string };
  onComplete: (values: SurveyInput) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [importedBadge, setImportedBadge] = useState(false);

  const methods = useForm<SurveyForm>({
    resolver: zodResolver(surveyFormSchema),
    defaultValues: useMemo(
      () => toFormDefaults(initialValues, defaultBusinessName),
      [initialValues, defaultBusinessName],
    ),
  });
  const { trigger, getValues, handleSubmit, setValue } = methods;

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
    if (step === 3) {
      const pid = ((getValues('purposeId') as LivePurposeId) || 'local_store') as LivePurposeId;
      const items = (getValues('contentItems') ?? []).filter((i) => i.name?.trim());
      if (!contentGateStatus(pid, items.length).ok) {
        toast('info', `${requirementOf(pid).itemLabel} 항목을 1개 이상 입력해 주세요.`);
        return;
      }
    }
    if (step === 6) {
      const { colorPreference } = deriveColors(getValues());
      if (!colorPreference) {
        toast('info', '느낌을 하나 고르거나 대표 색을 골라주세요.');
        return;
      }
    }
    if (step === 7 && !getValues('siteGoal')) {
      toast('info', '방문자가 뭘 해주면 좋을지 하나 골라주세요.');
      return;
    }
    goTo(step + 1);
  };

  const submit = handleSubmit((values) => {
    const pid = values.purposeId as SitePurposeId;
    const template = resolveTemplate(pid, values.industry);
    const { colorPreference, secondaryColor } = deriveColors(values);
    if (!colorPreference) {
      toast('info', '느낌을 하나 고르거나 대표 색을 골라주세요.');
      goTo(6);
      return;
    }
    const clean = (s?: string) => {
      const t = (s ?? '').trim();
      return t ? t : undefined;
    };
    const highlights = (values.highlights ?? []).map((h) => h.trim()).filter(Boolean).slice(0, 3);
    const presence = values.existingPresence ?? [];

    onComplete({
      purposeId: pid,
      purpose: findPurpose(pid)?.label ?? pid,
      businessName: values.businessName.trim(),
      industry: values.industry.trim(),
      tone: values.tone,
      colorPreference,
      secondaryColor,
      imageStyle: (values.imageStyle as CandidateStyle | undefined) ?? defaultImageStyle(values.industry),
      heroPhotoUrl: clean(values.heroPhotoUrl),
      storePhotoUrls: values.storePhotoUrls.length ? values.storePhotoUrls : undefined,
      logoUrl: clean(values.logoUrl),
      referenceImageUrls: [], // [v4] 수집 중단 — 항상 빈 배열
      referenceStyleIds: values.moodIds.length ? styleIdsForSamples(values.moodIds) : undefined,
      referenceDesignId: clean(values.referenceDesignId),
      existingPresence: presence.length ? presence : undefined,
      siteGoal: values.siteGoal as SiteGoalId | undefined,
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
        }))
        .filter((it) => it.name.length > 0),
      sectionPlan: planFromTemplate(template),
      pagePlan: pagePlanFromTemplate(template),
      templateId: template.id,
      tagline: clean(values.tagline),
      providedContent: clean(values.providedContent),
      extraNotes: clean(values.extraNotes),
    });
  });

  const isLast = step === TOTAL_STEPS;
  const primaryLabel = isLast ? '생성 시작' : '다음';

  return (
    <FormProvider {...methods}>
      <SurveyUxProvider value={{ goTo, importedBadge, setImportedBadge }}>
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
          </div>

          {/* 스텝 본문 */}
          <div className="px-5 py-6 sm:px-7">
            <StepFade key={step}>
              {step === 1 ? <Step01Basics /> : null}
              {step === 2 ? <Step02Existing /> : null}
              {step === 3 ? <Step03Content /> : null}
              {step === 4 ? <Step04Photos /> : null}
              {step === 5 ? <Step05ImageStyle /> : null}
              {step === 6 ? <Step06MoodColor /> : null}
              {step === 7 ? <Step07Direction /> : null}
              {step === 8 ? <Step08Review /> : null}
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
              className="inline-flex h-12 items-center gap-2 rounded-ob bg-ob-accent px-6 text-[15px] font-semibold text-ob-ink transition-colors hover:bg-ob-accent-strong hover:text-white"
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
