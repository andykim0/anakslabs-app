'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import type { CandidateStyle, DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { generateCandidates } from '../api';
import { Badge, Button, Card, cn, ErrorState } from '../ui';

const STYLE_LABELS: Record<CandidateStyle, string> = {
  photo: '실사 포토',
  '3d_render': '3D 렌더',
  illustration: '일러스트',
};

const LOADING_MESSAGES = [
  'AI가 디자인 방향을 잡고 있습니다…',
  '레퍼런스와 톤을 분석하고 있어요',
  '팔레트와 타이포그래피를 조합하는 중…',
  '히어로 비주얼을 스케치하고 있습니다',
];

export function LoadingScreen({ messages }: { messages: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % messages.length), 2200);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <Card className="flex flex-col items-center justify-center gap-5 border-ob-border bg-ob-surface py-20">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <motion.span
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

/** [G1] 후보 히어로 이미지에 선택한 heroTechnique을 CSS로 체감시키는 클래스(로컬 keyframes). */
const HERO_MOTION_CLASS: Record<string, string> = {
  'ken-burns': 'cand-hero-kenburns',
  'mask-reveal': 'cand-hero-mask',
  'video-hero': 'cand-hero-pan',
};

const CANDIDATE_MOTION_CSS = `
.cand-hero-kenburns { animation: cand-kb 7s ease-in-out infinite alternate; transform-origin: 50% 50%; }
@keyframes cand-kb { from { transform: scale(1); } to { transform: scale(1.08); } }
.cand-hero-pan { animation: cand-pan 8s ease-in-out infinite alternate; transform-origin: 50% 50%; }
@keyframes cand-pan { from { transform: scale(1.05) translateX(-2%); } to { transform: scale(1.05) translateX(2%); } }
.cand-hero-mask { animation: cand-mask 3s ease-in-out infinite; }
@keyframes cand-mask { 0% { clip-path: inset(0 100% 0 0); } 45%,100% { clip-path: inset(0 0 0 0); } }
@media (prefers-reduced-motion: reduce) {
  .cand-hero-kenburns, .cand-hero-pan, .cand-hero-mask { animation: none !important; clip-path: none !important; transform: none !important; }
}`;

function CandidateCard({
  candidate,
  selected,
  heroTechnique,
  onSelect,
}: {
  candidate: DesignCandidate;
  selected: boolean;
  heroTechnique?: string;
  onSelect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const { palette } = candidate.theme;
  const swatches = [palette.background, palette.surface, palette.primary, palette.accent, palette.text];
  const motionClass = heroTechnique ? HERO_MOTION_CLASS[heroTechnique] : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group overflow-hidden rounded-xl border text-left transition-all',
        selected
          ? 'border-ob-accent-strong ring-1 ring-ob-accent'
          : 'border-ob-border hover:border-ob-muted',
      )}
    >
      <div className="relative h-36 overflow-hidden bg-ob-bg">
        {imgFailed ? (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${palette.background} 0%, ${palette.primary} 100%)`,
            }}
          />
        ) : (
          <img
            src={candidate.heroImageUrl}
            alt={candidate.label}
            className={cn('h-full w-full object-cover', motionClass ?? 'transition-transform duration-300 group-hover:scale-[1.03]')}
            onError={() => setImgFailed(true)}
          />
        )}
        <span className="absolute top-2 left-2">
          <Badge tone={candidate.style === '3d_render' ? 'gold' : 'neutral'}>{STYLE_LABELS[candidate.style]}</Badge>
        </span>
        {selected ? (
          <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ob-accent-strong text-xs font-bold text-white">
            ✓
          </span>
        ) : null}
      </div>
      <div className="bg-ob-surface p-4">
        <p className="text-sm font-semibold text-ob-ink">{candidate.label}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-ob-muted">{candidate.description}</p>
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
    </button>
  );
}

export function CandidateStep({
  survey,
  heroTechnique,
  onBack,
  onSelect,
}: {
  survey: SurveyInput;
  /** [G1] '움직임 고르기'에서 고른 히어로 기법 — 후보 히어로 이미지에서 체감시켜 선택→확인 루프를 닫는다 */
  heroTechnique?: string;
  onBack: () => void;
  onSelect: (candidate: DesignCandidate) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 후보 생성은 "마운트 시 1회 fetch" — useMutation을 useEffect에서 쏘는 안티패턴 대신 useQuery로:
  //  · dedup: 같은 survey면 in-flight/캐시를 공유 → StrictMode 이중 마운트(개발)에도 요청 1회(이중 과금 방지)
  //  · 캐시: 재마운트/뒤로가기 시 즉시 후보 표시(무한 스피너·재요청 없음)
  //  · 자동 refetch 전면 차단(창 포커스·재연결·재마운트) → 의도치 않은 재생성=재과금 방지
  //  · retry:false → 실패 즉시 에러 표면화(무한 스피너·재시도 폭주 금지)
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['onboarding', 'candidates', survey],
    queryFn: () => generateCandidates(survey),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });

  // 명시적 재생성(재과금) — 사용자 액션에서만. refetch는 staleTime을 무시하고 새 후보를 받아온다.
  const regenerate = () => {
    setSelectedId(null);
    void refetch();
  };

  // fetch 중(최초 또는 재생성)이면 분석 스피너. 성공/에러로 끝나면 반드시 벗어난다(idle 무한 스피너 불가).
  if (isFetching) {
    return <LoadingScreen messages={LOADING_MESSAGES} />;
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <ErrorState
          message={error instanceof Error ? error.message : '디자인 후보 생성에 실패했습니다.'}
          onRetry={() => void refetch()}
        />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          이전
        </Button>
      </div>
    );
  }

  const candidates = data ?? [];
  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  return (
    <div>
      {/* [G1] 후보 히어로 이미지에 선택한 움직임을 CSS로 재생(비용 0, reduced-motion 존중) */}
      {heroTechnique && HERO_MOTION_CLASS[heroTechnique] ? (
        <style dangerouslySetInnerHTML={{ __html: CANDIDATE_MOTION_CSS }} />
      ) : null}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ob-ink">디자인 방향을 골라주세요</h2>
        <p className="mt-1 text-sm text-ob-muted">
          설문을 바탕으로 AI가 제안한 3가지 방향입니다. 선택 후에도 캔버스에서 자유롭게 다듬을 수 있어요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            selected={c.id === selectedId}
            heroTechnique={heroTechnique}
            onSelect={() => setSelectedId(c.id)}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            이전
          </Button>
          <Button variant="secondary" onClick={regenerate}>
            <RefreshCw className="h-4 w-4" />
            다시 추천받기
          </Button>
        </div>
        <Button size="lg" disabled={!selected} onClick={() => selected && onSelect(selected)}>
          이 디자인으로 만들기
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
