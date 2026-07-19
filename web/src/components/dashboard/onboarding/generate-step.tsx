'use client';

/**
 * 온보딩 3단계 — 선택한 디자인 후보 + 설문으로 SiteConfig 초안 생성.
 * 최초: POST /api/onboarding/generate (사이트 생성).
 * [§3] 재생성(무료 1회): POST /api/onboarding/regenerate — 같은 사이트 draft 교체.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
import { hasVideoAddon } from '@/lib/services/entitlements';
import { FREE_REGEN_LIMIT } from '@/lib/credits/constants';
import {
  applyHeroVideoDraft,
  generateHeroVideoDrafts,
  generateSite,
  getSite,
  regenerateSite,
  type ExtrasOptionsDto,
  type MotionChoiceDto,
} from '../api';
import { genIdemKey, sharedGenerate } from '@/lib/onboarding/generate-dedup';
import { heroImageUrlIntent } from '@/lib/onboarding/hero-image-options';
import { processApprovedHeroVideo } from '@/lib/onboarding/hero-video-process';
import { sectionDirectionsIntent } from '@/lib/onboarding/section-directions';
import { Badge, Button, Card, ErrorState } from '../ui';
import { LoadingScreen } from './candidate-step';
import { WireframePreview, pruneSections } from './wireframe-preview';
import { HeroVideoStudio } from './hero-video-studio';
import { NextStepsChecklist } from './next-steps-checklist';
import { PageEnrichmentCards } from './page-enrichment-cards';
import { SectionReviewStep } from './section-review-step';

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
  tier = 'basic',
  onResult,
  onBack,
  onPickAnother,
  onEditSurvey,
  onChooseHeroImage,
  onChooseHeroMotion,
  onDirectionsChange,
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
  onChooseHeroImage: () => void;
  onChooseHeroMotion: () => void;
  onDirectionsChange: (directions: SurveyInput['directions']) => void;
}) {
  const queryClient = useQueryClient();
  // [A3] 와이어프레임 승인 게이트 — 첫 생성만(이미지·최종카피 원가 발생 전). 재생성은 이미 확정이라 스킵.
  const [confirmed, setConfirmed] = useState(Boolean(existingSiteId));
  // [A3] 구성 바꾸기 — 제외한 nice 섹션 키. 승인 시 survey.sectionPlan에서 필터.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [reviewComplete, setReviewComplete] = useState(false);
  const effectiveSurvey = useMemo(() => pruneSections(survey, removed), [survey, removed]);

  // intent가 같으면(=StrictMode 재마운트) 요청·idempotencyKey를 공유 → 요청 1회, 사이트 1개.
  // [Q7] 모션 시그니처 포함 — 모션만 바꿔 재생성해도 dedup 캐시에 걸리지 않게. [A3] 구성 변경도 시그니처에.
  const intent = `${existingSiteId ?? 'new'}::${candidate.id}:${heroImageUrlIntent(candidate.heroImageUrl)}::${motionChoice?.heroTechnique ?? ''}:${motionChoice?.intensity ?? ''}:${motionChoice?.videoConceptId ?? ''}:${motionChoice?.heroMotionId ?? ''}:${motionChoice?.signatureId ?? ''}:${motionChoice?.beforeAfterSelection?.beforeAssetId ?? ''}:${motionChoice?.beforeAfterSelection?.afterAssetId ?? ''}:${survey.heroImageChoice ?? ''}:${survey.videoAddon === true ? 'video' : 'still'}::${[...removed].sort().join(',')}::${sectionDirectionsIntent(survey.directions)}`;
  const idempotencyKey = genIdemKey(intent);

  const mutation = useMutation({
    mutationFn: () =>
      sharedGenerate(intent, async () => {
        const generated = existingSiteId
          ? regenerateSite({ siteId: existingSiteId, survey: effectiveSurvey, candidate, extras, extrasOptions, motionChoice, idempotencyKey })
          : generateSite({ survey: effectiveSurvey, candidate, extras, extrasOptions, motionChoice, idempotencyKey });
        const site = await generated;
        // [W4] 사이트를 먼저 완성한 뒤, 선택+승인일 때만 기존 U3 게이트 라우트로 1개를 생성·적용한다.
        const heroVideo = await processApprovedHeroVideo(
          {
            siteId: site.siteId,
            tier,
            videoAddon: effectiveSurvey.videoAddon === true,
            heroImageChoice: effectiveSurvey.heroImageChoice,
            heroPhotoUrl: effectiveSurvey.heroPhotoUrl,
            tone: effectiveSurvey.tone,
          },
          { generateDrafts: generateHeroVideoDrafts, applyDraft: applyHeroVideoDraft },
        );
        // 영상 적용까지 끝난 최신 draft를 검수 게이트의 단일 기준으로 사용한다. GET 실패 시
        // generate 응답에 포함된 config로 안전하게 이어가되, config 자체가 없으면 완료로 오인하지 않는다.
        let reviewConfig = site.site?.draftConfig ?? site.site?.siteConfig;
        try {
          const refreshed = await getSite(site.siteId);
          reviewConfig = refreshed.draftConfig ?? refreshed.siteConfig ?? reviewConfig;
        } catch (cause) {
          if (!reviewConfig) throw cause;
        }
        if (!reviewConfig) {
          throw new Error('생성된 사이트 초안을 불러오지 못했습니다.');
        }
        return { ...site, heroVideo, reviewConfig };
      }),
    // useMutation은 기본 재시도 없음 → 실패 시 즉시 에러 표면화(무한 스피너 없음).
    onSuccess: (data) => {
      setReviewComplete(false);
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      onResult(data.siteId, data.freeRegensUsed);
    },
  });

  // [A3] 승인(confirmed) 후에만 발화 — 승인 전에는 원가 0 와이어프레임만. 실제 요청은 sharedGenerate가
  // 1회로 dedup(StrictMode 안전). 재생성(existingSiteId)은 confirmed 초기값 true라 즉시 발화(무회귀).
  useEffect(() => {
    if (confirmed) mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  const toggleRemoved = (key: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // [A3] 풀 생성 전 구성(와이어프레임) 확인 게이트 — 원가 0(sectionPlan/pagePlan만, 이미지·AI 미호출).
  if (!confirmed) {
    return (
      <Card className="space-y-5 border-ob-border bg-ob-surface p-6">
        <div>
          <h2 className="text-lg font-semibold text-ob-ink">이런 구성으로 만들게요 — 맞나요?</h2>
          <p className="mt-1 text-sm text-ob-muted">
            페이지와 섹션 순서예요. 이대로 좋으면 바로 만들고, 빼고 싶은 선택 섹션만 체크를 풀어주세요.
          </p>
        </div>
        <WireframePreview survey={survey} removed={removed} onToggle={toggleRemoved} />
        <div className="flex items-center justify-between gap-3 border-t border-ob-border pt-5">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            이전
          </Button>
          <Button size="lg" onClick={() => setConfirmed(true)}>
            이대로 만들기
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    );
  }

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
  const heroVideo = mutation.data.heroVideo;

  // [Q$4] 생성 성공은 곧바로 완료가 아니다. 모든 섹션을 사용자가 명시적으로 keep한 뒤에만
  // 기존 완료 카드로 진입한다. adjust/regenerate는 같은 섹션을 다시 보여주는 검수 루프다.
  if (!reviewComplete) {
    return (
      <SectionReviewStep
        siteId={siteId}
        initialConfig={mutation.data.reviewConfig}
        onChooseHeroImage={onChooseHeroImage}
        onChooseHeroMotion={onChooseHeroMotion}
        onComplete={(reviewedConfig) => {
          onDirectionsChange(reviewedConfig.directions);
          setReviewComplete(true);
        }}
      />
    );
  }

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

        {survey.videoAddon === true ? (
          <div className="w-full max-w-md rounded-xl border border-ob-border bg-ob-bg px-4 py-3 text-xs leading-5 text-ob-muted">
            {heroVideo.status === 'applied' ? (
              <span className="font-medium text-ob-success">선택한 사진과 연출로 영상 히어로까지 적용했어요.</span>
            ) : heroVideo.status === 'skipped' && heroVideo.reason === 'not-approved' ? (
              'AI 영상 홈페이지 승인 전이라 우선 정지 사진+포함·무료 기본 모션으로 완성했어요. 승인 후에만 다보임 AI 영상 생성을 시작합니다.'
            ) : heroVideo.status === 'fallback' ? (
              `사이트는 완성했지만 영상은 준비하지 못해 정지 히어로로 보여요. ${heroVideo.message}`
            ) : (
              '선택한 사진을 정지 히어로로 적용했어요.'
            )}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/dashboard/sites/${siteId}/editor`}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-ob-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-ob-accent-strong"
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

        {/* [W4] 선택+승인인데 자동 적용에 실패한 경우만 기존 수동 스튜디오를 재시도 경로로 노출. */}
        {survey.videoAddon === true && hasVideoAddon(tier) && heroVideo.status !== 'applied' ? (
          <HeroVideoStudio
            siteId={siteId}
            tone={survey.tone}
            heroPhotoUrl={survey.heroImageChoice === 'upload' ? survey.heroPhotoUrl : undefined}
          />
        ) : null}

        <p className="text-xs text-ob-muted">
          발행 전까지는 초안 상태예요. 발행하면 서브도메인이 즉시 라이브됩니다.
        </p>
      </Card>
    </motion.div>
  );
}
