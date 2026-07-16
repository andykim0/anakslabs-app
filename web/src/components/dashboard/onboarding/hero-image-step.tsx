'use client';

/**
 * [W1] 히어로 이미지 선택 — 고객 대표 사진(선택) + 안전한 AI 무드 이미지 3안 중 하나를 고른다.
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
  '원하는 느낌을 이미지로 풀고 있어요…',
  '제품 대신 공간·빛·질감으로 연출하는 중…',
  '서로 다른 무드 3안을 준비하고 있습니다',
];
const REAL_PHOTO_LOADING_MESSAGES = [
  '올린 사진의 소유권과 등록 상태를 확인하고 있어요…',
  '실제 사진을 바꾸지 않고 디자인 구도를 준비하고 있습니다',
];

function optionCopy(option: HeroImageSelection): { label: string; description: string } {
  if (option.source === 'upload') {
    return {
      label: '내가 올린 대표 사진',
      description: '실제 사진을 그대로 히어로에 크게 사용해요.',
    };
  }
  const index = Number(option.id.replace('ai-', '')) || 1;
  return {
    label: `AI 무드 ${index}`,
    description: '선택한 느낌을 공간·빛·질감 중심으로 연출한 이미지예요.',
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
          message={error instanceof Error ? error.message : '히어로 이미지 제안에 실패했습니다.'}
          onRetry={() => void refetch()}
        />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          이전
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

  if (isRealPhoto && options.length === 0) {
    return (
      <div className="space-y-4">
        <ErrorState message="확인된 직접 업로드 사진을 찾지 못했어요. 사진 단계에서 다시 올리고 사용 확인을 완료해 주세요." />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          사진 방향 다시 고르기
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
            {isRealPhoto ? '첫 화면에 쓸 실제 사진을 확인해 주세요' : '첫 화면에 쓸 이미지를 골라주세요'}
          </h2>
        </div>
        <p className="mt-1 text-sm leading-6 text-ob-muted">
          {isRealPhoto
            ? '서버에서 확인한 고객님의 실제 사진만 사용합니다. AI로 제품·공간·사람을 다시 만들지 않아요.'
            : '선택한 예술 방향으로 만든 무드 3안 중 하나를 고르면, 이후 움직임과 최종 히어로가 모두 이 이미지를 사용해요.'}
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
                  {option.source === 'upload' ? '실제 사진' : 'AI 무드'}
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

      <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-xs leading-5 text-ob-muted">
        {isRealPhoto
          ? '실제 사진은 원본 픽셀을 유지한 채 크롭·배치·색감과 CSS 모션만 연출합니다.'
          : 'AI 이미지는 특정 메뉴·상품·시술 결과를 만들지 않고, 선택한 톤의 공간·빛·질감만 표현합니다.'}
      </div>

      <div className="flex items-center justify-between border-t border-ob-border pt-5">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          이전
        </Button>
        <Button size="lg" disabled={!selected} onClick={() => selected && onComplete(selected)}>
          이 사진으로 계속
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
