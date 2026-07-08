'use client';

/**
 * 온보딩 3단계 — 선택한 디자인 후보 + 설문으로 SiteConfig 초안 생성.
 * POST /api/onboarding/generate → { siteId } → 에디터 CTA (2차 가공으로 연결).
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, LayoutDashboard, PencilRuler, PartyPopper } from 'lucide-react';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { generateSite } from '../api';
import { Badge, Button, Card, ErrorState } from '../ui';
import { LoadingScreen } from './candidate-step';

const LOADING_MESSAGES = [
  '선택하신 방향으로 사이트 구조를 설계하고 있습니다…',
  '섹션별 카피를 다듬는 중이에요',
  '이미지와 팔레트를 캔버스에 배치하고 있습니다',
  '거의 다 됐어요 — 마감 디테일을 정리하는 중…',
];

export function GenerateStep({
  survey,
  candidate,
  onBack,
}: {
  survey: SurveyInput;
  candidate: DesignCandidate;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const startedRef = useRef(false);

  const mutation = useMutation({
    mutationFn: generateSite,
    onSuccess: () => {
      // 사이트 목록/대시보드 요약이 즉시 새 사이트를 반영하도록
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    mutation.mutate({ survey, candidate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mutation.isPending || (!mutation.data && !mutation.isError)) {
    return <LoadingScreen messages={LOADING_MESSAGES} />;
  }

  if (mutation.isError) {
    return (
      <div className="space-y-4">
        <ErrorState
          message={
            mutation.error instanceof Error ? mutation.error.message : '사이트 생성에 실패했습니다.'
          }
          onRetry={() => mutation.mutate({ survey, candidate })}
        />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          디자인 선택으로 돌아가기
        </Button>
      </div>
    );
  }

  const siteId = mutation.data.siteId;

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
          <Badge>섹션 {survey.sections.length}개</Badge>
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
        <p className="text-xs text-neutral-600">
          발행 전까지는 초안 상태예요. 발행하면 서브도메인이 즉시 라이브됩니다.
        </p>
      </Card>
    </motion.div>
  );
}
