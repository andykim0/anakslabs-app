'use client';

/**
 * 온보딩 3단계 — 선택한 디자인 후보 + 설문으로 SiteConfig 초안 생성.
 * 최초: POST /api/onboarding/generate (사이트 생성).
 * [§3] 재생성(무료 1회): POST /api/onboarding/regenerate — 같은 사이트 draft 교체.
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  LayoutDashboard,
  PencilRuler,
  PartyPopper,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type { DesignCandidate, ExtraFeatureSelection, SurveyInput, Tier } from '@/lib/types/domain';
import { FREE_REGEN_LIMIT } from '@/lib/credits/constants';
import { generateSite, regenerateSite, type ExtrasOptionsDto } from '../api';
import { Badge, Button, Card, ErrorState } from '../ui';
import { LoadingScreen } from './candidate-step';
import { HeroVideoStudio } from './hero-video-studio';

const LOADING_MESSAGES = [
  '선택하신 방향으로 사이트 구조를 설계하고 있습니다…',
  '섹션별 카피를 다듬는 중이에요',
  '이미지와 팔레트를 캔버스에 배치하고 있습니다',
  '거의 다 됐어요 — 마감 디테일을 정리하는 중…',
];

export function GenerateStep({
  survey,
  candidate,
  extras,
  extrasOptions,
  existingSiteId,
  freeRegensUsed,
  tier = 'basic',
  onResult,
  onBack,
  onPickAnother,
  onEditSurvey,
}: {
  survey: SurveyInput;
  candidate: DesignCandidate;
  /** [v3 Phase 3] 부가기능 선택 (건너뛰면 undefined) */
  extras?: ExtraFeatureSelection;
  extrasOptions?: ExtrasOptionsDto;
  /** null=최초 생성 / 값 있으면 해당 사이트 재생성 */
  existingSiteId: string | null;
  freeRegensUsed: number;
  /** [motion 4단계] 소유자 티어 — Premium이면 AI 영상 히어로 스튜디오 노출 */
  tier?: Tier;
  onResult: (siteId: string, freeRegensUsed: number) => void;
  onBack: () => void;
  onPickAnother: () => void;
  onEditSurvey: () => void;
}) {
  const queryClient = useQueryClient();
  const startedRef = useRef(false);

  const mutation = useMutation({
    mutationFn: () =>
      existingSiteId
        ? regenerateSite({ siteId: existingSiteId, survey, candidate, extras, extrasOptions })
        : generateSite({ survey, candidate, extras, extrasOptions }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      onResult(data.siteId, data.freeRegensUsed);
    },
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mutation.isPending || (!mutation.data && !mutation.isError)) {
    return <LoadingScreen messages={LOADING_MESSAGES} />;
  }

  if (mutation.isError) {
    return (
      <div className="space-y-4">
        <ErrorState
          message={mutation.error instanceof Error ? mutation.error.message : '사이트 생성에 실패했습니다.'}
          onRetry={() => mutation.mutate()}
        />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          디자인 선택으로 돌아가기
        </Button>
      </div>
    );
  }

  const siteId = mutation.data.siteId;
  const usedNow = mutation.data.freeRegensUsed;
  const regenLeft = Math.max(0, FREE_REGEN_LIMIT - usedNow);
  const canRegen = regenLeft > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card className="flex flex-col items-center gap-5 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2a2117] text-[#d9b878]">
          <PartyPopper className="h-7 w-7" />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-neutral-50">
            {survey.businessName} 사이트 초안이 완성됐어요
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
            선택하신 <span className="text-neutral-200">{candidate.label}</span> 방향으로 섹션과
            카피를 구성했습니다. 이제 캔버스에서 PPT처럼 자유롭게 다듬고, 준비되면 발행하세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Badge tone="gold">{candidate.label}</Badge>
          <Badge>섹션 {survey.sectionPlan.length}개</Badge>
          <Badge>초안 저장됨</Badge>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/dashboard/sites/${siteId}/editor`}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#c8a96a] px-6 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
          >
            <PencilRuler className="h-4 w-4" />
            에디터에서 다듬기
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/dashboard/sites/${siteId}`}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-neutral-700 px-6 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
          >
            <LayoutDashboard className="h-4 w-4" />
            사이트 상세 보기
          </Link>
        </div>

        {/* [§3] 무료 재생성 안내 */}
        <div className="mt-3 w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          {canRegen ? (
            <>
              <p className="text-xs font-medium text-neutral-300">
                마음에 안 드세요? 무료로 다시 생성할 수 있어요 (남은 무료 {regenLeft}회)
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Button variant="secondary" onClick={onPickAnother}>
                  <RefreshCw className="h-4 w-4" />
                  다른 디자인으로 다시
                </Button>
                <Button variant="ghost" onClick={onEditSurvey}>
                  <SlidersHorizontal className="h-4 w-4" />
                  설문 수정하기
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs leading-5 text-neutral-500">
              무료 재생성({FREE_REGEN_LIMIT}회)을 모두 사용했어요. 이제 캔버스 에디터에서 직접 다듬거나
              편집 크레딧으로 수정할 수 있습니다.
            </p>
          )}
        </div>

        {/* [motion 4단계] Premium — AI 영상 히어로 스튜디오 (선택) */}
        {tier === 'premium' ? (
          <HeroVideoStudio siteId={siteId} businessName={survey.businessName} industry={survey.industry} />
        ) : null}

        <p className="text-xs text-neutral-600">
          발행 전까지는 초안 상태예요. 발행하면 서브도메인이 즉시 라이브됩니다.
        </p>
      </Card>
    </motion.div>
  );
}
