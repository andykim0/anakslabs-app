'use client';

/**
 * [W1] 첫 화면 비주얼 선택 — 고객 대표 사진(선택) + Anaks Labs이 준비한 안전한 무드 3안.
 * 후보 요청은 CandidateStep과 동일 query key/requestKey를 공유해 한 온보딩에서 AI 3안을 한 번만 만든다.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ImageIcon, Sparkles, Upload } from 'lucide-react';
import type { SurveyInput } from '@/lib/types/domain';
import {
  buildHeroImageOptions,
  heroCandidateIntent,
  surveyForHeroCandidates,
  type HeroImageSelection,
} from '@/lib/onboarding/hero-image-options';
import { genIdemKey } from '@/lib/onboarding/generate-dedup';
import { generateCandidates } from '../api';
import { Button, Card, cn, ErrorState } from '../ui';
import { LoadingScreen } from './candidate-step';

const LOADING_MESSAGES = [
  "I'm expressing the feeling I want through images...",
  "We are creating with space, light, and texture instead of products...",
  "We are preparing 3 different moods.",
];
const REAL_PHOTO_LOADING_MESSAGES = [
  "We are checking the ownership and registration status of the uploaded photo...",
  "We are preparing a design composition without changing the actual photo.",
];

function optionCopy(option: HeroImageSelection): { label: string; description: string } {
  if (option.source === 'system') {
    return {
      label: "The first screen prepared by Anaks Labs",
      description: "Instead of photos, we use a safe stage that matches the site color and design.",
    };
  }
  if (option.source === 'upload') {
    return {
      label: "Featured photo I posted",
      description: "I use actual photos as they are for the hero.",
    };
  }
  const index = Number(option.id.replace('ai-', '')) || 1;
  return {
    label: `Anaks Labs Mood${index}`,
    description: "This is a visual prepared by Anaks Labs focusing on space, light, and texture to express the chosen feeling.",
  };
}

export function HeroImageStep({
  survey,
  existingSiteId,
  initial,
  onBack,
  onComplete,
}: {
  survey: SurveyInput;
  /** Existing owned draft whose site-bound assets may be reused for regeneration. */
  existingSiteId?: string;
  initial?: HeroImageSelection;
  onBack: () => void;
  onComplete: (selection: HeroImageSelection) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const isRealPhoto = survey.imageDirectionId === 'real_photo';
  const candidateSurvey = isRealPhoto ? survey : surveyForHeroCandidates(survey);
  const intent = heroCandidateIntent(candidateSurvey);
  const requestKey = genIdemKey(intent);
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['onboarding', 'hero-images', existingSiteId ?? 'new', candidateSurvey],
    queryFn: () => generateCandidates(candidateSurvey, requestKey, existingSiteId),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });

  if (isFetching) {
    return <LoadingScreen messages={isRealPhoto ? REAL_PHOTO_LOADING_MESSAGES : LOADING_MESSAGES} />;
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <ErrorState
          message={error instanceof Error ? error.message : "The hero image proposal failed."}
          onRetry={() => void refetch()}
        />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  const options = buildHeroImageOptions(
    data ?? [],
    survey.heroPhotoUrl,
    survey.heroPhotoAssetRef,
    survey.imageDirectionId,
  );
  const selected = options.find((option) => option.id === selectedId) ?? null;
  const qualityGuidance = options.find((option) => option.source === 'system')?.guidance;

  if (isRealPhoto && options.length === 0) {
    return (
      <div className="space-y-4">
        <ErrorState message="I couldn't find any verified direct upload photos. Please upload again at the photo stage and complete usage confirmation." />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Re-select photo orientation
        </Button>
      </div>
    );
  }

  return (
    <Card className="space-y-5 border-ob-border bg-ob-surface p-6">
      <div>
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-ob-accent-strong" />
          <h2 className="text-lg font-semibold text-ob-ink">
            {isRealPhoto ? "Please check the actual photo to be used on the first screen." : "Please select an image for the home screen"}
          </h2>
        </div>
        <p className="mt-1 text-sm leading-6 text-ob-muted">
          {isRealPhoto
            ? "The first screen is basically the stage prepared by Anaks Labs. Only actual photos that have passed the quality check are promoted as originals."
            : "No photos required. If you choose one of the three mood plans prepared by Anaks Labs, this visual will be used for subsequent movements and the final first screen."}
        </p>
      </div>

      <div className={cn('grid gap-3', options.length > 3 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        {options.map((option) => {
          const active = option.id === selectedId;
          const copy = optionCopy(option);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedId(option.id)}
              className={cn(
                'overflow-hidden rounded-ob border bg-ob-surface text-left transition-all',
                active
                  ? 'border-ob-accent-strong ring-1 ring-ob-accent'
                  : 'border-ob-border hover:border-ob-muted',
              )}
            >
              <div className="relative aspect-video overflow-hidden bg-ob-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={option.url} alt={copy.label} className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-medium text-white">
                  {option.source === 'upload' ? <Upload className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                  {option.source === 'upload' ? "real photo" : "Preparing for Anaks Labs"}
                </span>
                {active ? (
                  <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ob-accent-strong text-xs font-bold text-white">
                    ✓
                  </span>
                ) : null}
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-ob-ink">{copy.label}</p>
                <p className="mt-1 text-xs leading-5 text-ob-muted">{copy.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {isRealPhoto && qualityGuidance ? (
        <div
          data-hero-photo-quality-guidance
          className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-xs leading-5 text-ob-muted"
        >
          {qualityGuidance}
        </div>
      ) : null}

      <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-xs leading-5 text-ob-muted">
        {isRealPhoto
          ? "Photos that pass are not retouched or recreated with AI. The original is maintained and only cropping, placement, and focus are performed."
          : "AI images do not create specific menus, products, or treatment results, but only express the space, light, and texture of the selected tone."}
      </div>

      <div className="flex items-center justify-between border-t border-ob-border pt-5">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button size="lg" disabled={!selected} onClick={() => selected && onComplete(selected)}>
          Continue with this photo
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
