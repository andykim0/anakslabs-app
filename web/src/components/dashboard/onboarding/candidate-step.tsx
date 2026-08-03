'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import type { CandidateStyle, DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { AssetRef } from '@/lib/assets/provenance';
import {
  applyHeroImageToCandidate,
  heroCandidateIntent,
  surveyForHeroCandidates,
} from '@/lib/onboarding/hero-image-options';
import { genIdemKey } from '@/lib/onboarding/generate-dedup';
import { buildCandidatePreviewConfig } from '@/lib/onboarding/candidate-preview';
import { googleFontUrls, needsPretendard, PRETENDARD_CSS_URL } from '@/components/site-renderer/fonts';
import { fontPairingResources } from '@/lib/fonts/resources';
import { generateCandidates } from '../api';
import { SitePreview } from '../site-preview';
import { Badge, Button, Card, cn, ErrorState } from '../ui';

const STYLE_LABELS: Record<CandidateStyle, string> = {
  photo: "live photo",
  '3d_render': "3D render",
  illustration: "Illustration",
};

const LOADING_MESSAGES = [
  "We are choosing a configuration that suits your industry…",
  "Matches the mood with the entered content.",
  "Combining palettes and fonts...",
  "We are preparing a preview of the actual homepage.",
];

export function LoadingScreen({ messages }: { messages: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % messages.length), 2200);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <Card
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col items-center justify-center gap-5 border-ob-border bg-ob-surface py-20"
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-ob-accent/30 border-t-ob-accent-strong"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
        />
        <Sparkles className="h-6 w-6 text-ob-accent-strong" />
      </div>
      <motion.p
        key={index}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm text-ob-muted"
      >
        {messages[index]}
      </motion.p>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-ob-border">
        <motion.div
          aria-hidden="true"
          className="h-full w-1/3 rounded-full bg-ob-accent-strong"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        />
      </div>
    </Card>
  );
}

function firstFontName(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? fontFamily;
  return first.replaceAll("'", '').replaceAll('"', '').trim();
}

function CandidateCard({
  candidate,
  heroImageUrl,
  survey,
  selected,
  heroTechnique,
  onSelect,
}: {
  candidate: DesignCandidate;
  heroImageUrl: string;
  survey: SurveyInput;
  selected: boolean;
  heroTechnique?: string;
  onSelect: () => void;
}) {
  const { palette } = candidate.theme;
  const swatches = [palette.background, palette.surface, palette.primary, palette.accent, palette.text];
  const previewConfig = useMemo(
    () => buildCandidatePreviewConfig(survey, candidate, heroImageUrl, heroTechnique),
    [candidate, heroImageUrl, heroTechnique, survey],
  );

  return (
    <div
      role="radio"
      tabIndex={0}
      aria-checked={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ob-accent-strong',
        selected
          ? 'border-ob-accent-strong ring-1 ring-ob-accent'
          : 'border-ob-border hover:border-ob-muted',
      )}
    >
      <div className="relative overflow-hidden bg-ob-bg p-2">
        <div className="pointer-events-none overflow-hidden rounded-lg motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.015] motion-reduce:transform-none">
          <SitePreview
            config={previewConfig}
            mode="mobile"
            maxHeight={220}
            motion={Boolean(heroTechnique)}
          />
        </div>
        {selected ? (
          <span aria-hidden="true" className="absolute top-2 right-2 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-ob-accent-strong text-xs font-bold text-white">
            ✓
          </span>
        ) : null}
      </div>
      <div className="bg-ob-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ob-ink">{candidate.label}</p>
          <Badge tone={candidate.style === '3d_render' ? 'gold' : 'neutral'}>{STYLE_LABELS[candidate.style]}</Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-ob-muted">{candidate.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">
            {swatches.map((c, i) => (
              <span
                key={`${c}-${i}`}
                className="h-4 w-4 rounded-full border border-ob-border"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <span className="truncate pl-2 text-[10px] text-ob-muted">
            {firstFontName(candidate.theme.fonts.heading)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CandidateStep({
  survey,
  existingSiteId,
  heroImageUrl,
  heroImageAssetRef,
  heroTechnique,
  onBack,
  onSelect,
}: {
  survey: SurveyInput;
  /** Existing owned draft whose site-bound candidate assets may be reused. */
  existingSiteId?: string;
  /** [W1] 앞 단계에서 고른 단일 히어로 소스. 디자인 3안은 같은 사진 위에서 테마만 비교한다. */
  heroImageUrl: string;
  /** URL과 일치하는 경우에만 후보에 전달하며 서버가 소유권/origin을 다시 검증한다. */
  heroImageAssetRef?: AssetRef;
  /** [G1] '움직임 고르기'에서 고른 히어로 기법 — 후보 히어로 이미지에서 체감시켜 선택→확인 루프를 닫는다 */
  heroTechnique?: string;
  onBack: () => void;
  onSelect: (candidate: DesignCandidate) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const candidateSurvey = survey.imageDirectionId === 'real_photo'
    ? survey
    : surveyForHeroCandidates(survey);
  const requestKey = genIdemKey(heroCandidateIntent(candidateSurvey));

  // 후보 생성은 "마운트 시 1회 fetch" — useMutation을 useEffect에서 쏘는 안티패턴 대신 useQuery로:
  //  · dedup: 같은 survey면 in-flight/캐시를 공유 → StrictMode 이중 마운트(개발)에도 요청 1회(이중 과금 방지)
  //  · 캐시: 재마운트/뒤로가기 시 즉시 후보 표시(무한 스피너·재요청 없음)
  //  · 자동 refetch 전면 차단(창 포커스·재연결·재마운트) → 의도치 않은 재생성=재과금 방지
  //  · retry:false → 실패 즉시 에러 표면화(무한 스피너·재시도 폭주 금지)
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

  // fetch 중(최초 또는 명시적 오류 재시도)이면 분석 스피너. 성공/에러로 끝나면 반드시 벗어난다.
  if (isFetching) {
    return <LoadingScreen messages={LOADING_MESSAGES} />;
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to create design candidate."}
          onRetry={() => void refetch()}
        />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  const candidates = data ?? [];
  const namedTemplates = candidates.some((candidate) => candidate.namedTemplate);
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const pinnedFontResources = candidates
    .map((candidate) => fontPairingResources(candidate.theme))
    .filter((resources): resources is NonNullable<typeof resources> => resources !== null);
  const pinnedFontCss = [...new Map(
    pinnedFontResources.map((resources) => [resources.id, resources.css]),
  ).values()].join('');
  const candidateFontUrls = googleFontUrls(
    candidates.flatMap((candidate) => (
      candidate.theme.fontPairing
        ? []
        : (candidate.theme.fonts.googleFonts ?? []).filter((family) => !/pretendard/i.test(family))
    )),
  );
  const loadPretendard = candidates.some(
    (candidate) => !candidate.theme.fontPairing && needsPretendard(candidate.theme),
  );

  return (
    <div>
      {pinnedFontCss ? <style dangerouslySetInnerHTML={{ __html: pinnedFontCss }} /> : null}
      {loadPretendard ? <link rel="stylesheet" href={PRETENDARD_CSS_URL} /> : null}
      {candidateFontUrls.map((url) => <link key={url} rel="stylesheet" href={url} />)}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ob-ink">Please select a design direction</h2>
        <p className="mt-1 text-sm text-ob-muted">
          {namedTemplates
            ? `Selected according to industry${candidates.length}It's an eggplant. Compare how the same content changes depending on the composition and atmosphere.`
            : "These are the three directions suggested based on the survey. Even after selection, you can freely refine it on the canvas."}
        </p>
      </div>

      <div
        className={cn(
          'grid gap-4',
          namedTemplates ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-3',
        )}
        role="radiogroup"
        aria-label="design direction"
      >
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            heroImageUrl={heroImageUrl}
            survey={survey}
            selected={c.id === selectedId}
            heroTechnique={heroTechnique}
            onSelect={() => setSelectedId(c.id)}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          size="lg"
          disabled={!selected}
          onClick={() => selected && onSelect(applyHeroImageToCandidate(selected, heroImageUrl, heroImageAssetRef))}
        >
          Create with this design
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
