'use client';

/**
 * 온보딩 3단계 — 선택한 디자인 후보 + 설문으로 SiteConfig 초안 생성.
 * 최초: POST /api/onboarding/generate (사이트 생성).
 * [§3] 재생성(무료 1회): POST /api/onboarding/regenerate — 같은 사이트 draft 교체.
 */
import Link from 'next/link';
import { useEffect } from 'react';
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
import { generateSite, regenerateSite, type ExtrasOptionsDto, type MotionChoiceDto } from '../api';
import { genIdemKey, sharedGenerate } from '@/lib/onboarding/generate-dedup';
import { Badge, Button, Card, ErrorState } from '../ui';
import { LoadingScreen } from './candidate-step';
import { HeroVideoStudio } from './hero-video-studio';
import { NextStepsChecklist } from './next-steps-checklist';
import { PageEnrichmentCards } from './page-enrichment-cards';

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
  motionChoice,
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
  /** [Q7] 움직임 고르기 선택 (서버 sanitize가 티어 초과를 강등) */
  motionChoice?: MotionChoiceDto;
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
  // intent가 같으면(=StrictMode 재마운트) 요청·idempotencyKey를 공유 → 요청 1회, 사이트 1개.
  // [Q7] 모션 시그니처 포함 — 모션만 바꿔 재생성해도 dedup 캐시에 걸리지 않게.
  const intent = `${existingSiteId ?? 'new'}::${candidate.id}::${motionChoice?.heroTechnique ?? ''}:${motionChoice?.intensity ?? ''}:${motionChoice?.videoConceptId ?? ''}`;
  const idempotencyKey = genIdemKey(intent);

  const mutation = useMutation({
    mutationFn: () =>
      sharedGenerate(intent, () =>
        existingSiteId
          ? regenerateSite({ siteId: existingSiteId, survey, candidate, extras, extrasOptions, motionChoice, idempotencyKey })
          : generateSite({ survey, candidate, extras, extrasOptions, motionChoice, idempotencyKey }),
      ),
    // useMutation은 기본 재시도 없음 → 실패 시 즉시 에러 표면화(무한 스피너 없음).
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      onResult(data.siteId, data.freeRegensUsed);
    },
  });

  // ref 가드 없이 매 마운트에서 발화 — 실제 요청은 sharedGenerate(모듈)가 1회로 dedup하고,
  // 라이브 마운트의 mutation도 공유 프로미스로 resolve되어 전환된다(idle 무한 스피너 불가).
  useEffect(() => {
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
      <Card className="flex flex-col items-center gap-5 border-ob-border bg-ob-surface py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ob-accent-soft text-ob-accent-strong">
          <PartyPopper className="h-7 w-7" />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ob-ink">
            {survey.businessName} 사이트 초안이 완성됐어요
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ob-muted">
            선택하신 <span className="text-ob-ink">{candidate.label}</span> 방향으로 섹션과
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
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-ob-accent px-6 text-sm font-semibold text-ob-ink transition-colors hover:bg-ob-accent-strong hover:text-white"
          >
            <PencilRuler className="h-4 w-4" />
            에디터에서 다듬기
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/dashboard/sites/${siteId}`}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-ob-border px-6 text-sm text-ob-ink transition-colors hover:border-ob-muted"
          >
            <LayoutDashboard className="h-4 w-4" />
            사이트 상세 보기
          </Link>
        </div>

        {/* [F4] 프로그레시브 온보딩 — 생성 후 다듬을 것들을 액션 카드로 안내(에디터 딥링크) */}
        <NextStepsChecklist siteId={siteId} survey={survey} />

        {/* [D3] 페이지별 보강 — 생성본에서 비어 보이는 페이지를 감지해 채우기 코칭(에디터 딥링크) */}
        <PageEnrichmentCards siteId={siteId} />

        {/* [§3] 무료 재생성 안내 */}
        <div className="mt-3 w-full max-w-md rounded-xl border border-ob-border bg-ob-bg p-4">
          {canRegen ? (
            <>
              <p className="text-xs font-medium text-ob-ink">
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
            <p className="text-xs leading-5 text-ob-muted">
              무료 재생성({FREE_REGEN_LIMIT}회)을 모두 사용했어요. 이제 캔버스 에디터에서 직접 다듬거나
              편집 크레딧으로 수정할 수 있습니다.
            </p>
          )}
        </div>

        {/* [motion 4단계] Premium — AI 영상 히어로 스튜디오 (선택) */}
        {tier === 'premium' ? (
          <HeroVideoStudio siteId={siteId} businessName={survey.businessName} industry={survey.industry} />
        ) : null}

        <p className="text-xs text-ob-muted">
          발행 전까지는 초안 상태예요. 발행하면 서브도메인이 즉시 라이브됩니다.
        </p>
      </Card>
    </motion.div>
  );
}
