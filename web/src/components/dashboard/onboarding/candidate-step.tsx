'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
    <Card className="flex flex-col items-center justify-center gap-5 py-20">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-[#c8a96a]/30 border-t-[#c8a96a]"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
        />
        <Sparkles className="h-6 w-6 text-[#c8a96a]" />
      </div>
      <motion.p
        key={index}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm text-neutral-300"
      >
        {messages[index]}
      </motion.p>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-neutral-800">
        <motion.div
          className="h-full w-1/3 rounded-full bg-[#c8a96a]"
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
  selected,
  onSelect,
}: {
  candidate: DesignCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const { palette } = candidate.theme;
  const swatches = [palette.background, palette.surface, palette.primary, palette.accent, palette.text];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group overflow-hidden rounded-xl border text-left transition-all',
        selected
          ? 'border-[#c8a96a] ring-1 ring-[#c8a96a]/50'
          : 'border-neutral-800 hover:border-neutral-600',
      )}
    >
      <div className="relative h-36 overflow-hidden bg-neutral-900">
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
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={() => setImgFailed(true)}
          />
        )}
        <span className="absolute top-2 left-2">
          <Badge tone={candidate.style === '3d_render' ? 'gold' : 'neutral'}>{STYLE_LABELS[candidate.style]}</Badge>
        </span>
        {selected ? (
          <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#c8a96a] text-xs font-bold text-neutral-950">
            ✓
          </span>
        ) : null}
      </div>
      <div className="bg-neutral-900/60 p-4">
        <p className="text-sm font-semibold text-neutral-100">{candidate.label}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{candidate.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">
            {swatches.map((c, i) => (
              <span
                key={`${c}-${i}`}
                className="h-4 w-4 rounded-full border border-neutral-950"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <span className="truncate pl-2 text-[10px] text-neutral-500">
            {firstFontName(candidate.theme.fonts.heading)}
          </span>
        </div>
      </div>
    </button>
  );
}

export function CandidateStep({
  survey,
  onBack,
  onSelect,
}: {
  survey: SurveyInput;
  onBack: () => void;
  onSelect: (candidate: DesignCandidate) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const startedRef = useRef(false);

  const mutation = useMutation({
    mutationFn: generateCandidates,
    onSuccess: () => setSelectedId(null),
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    mutation.mutate(survey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mutation.isPending || (!mutation.data && !mutation.isError)) {
    return <LoadingScreen messages={LOADING_MESSAGES} />;
  }

  if (mutation.isError) {
    return (
      <div className="space-y-4">
        <ErrorState
          message={mutation.error instanceof Error ? mutation.error.message : '디자인 후보 생성에 실패했습니다.'}
          onRetry={() => mutation.mutate(survey)}
        />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          설문으로 돌아가기
        </Button>
      </div>
    );
  }

  const candidates = mutation.data ?? [];
  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-neutral-50">디자인 방향을 골라주세요</h2>
        <p className="mt-1 text-sm text-neutral-500">
          설문을 바탕으로 AI가 제안한 3가지 방향입니다. 선택 후에도 캔버스에서 자유롭게 다듬을 수 있어요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {candidates.map((c) => (
          <CandidateCard key={c.id} candidate={c} selected={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            설문 수정
          </Button>
          <Button variant="secondary" onClick={() => mutation.mutate(survey)}>
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
