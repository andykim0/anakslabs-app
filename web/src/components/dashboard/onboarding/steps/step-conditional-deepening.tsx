'use client';

import { ArrowLeft, ArrowRight, Camera, Link2 } from 'lucide-react';
import type { AbsentSitePlanSection } from '@/lib/content/site-plan';
import { StepIntro, useSurveyUx } from './shared';
import { Step03Content } from './step03-content';
import { ProofFields } from './step07-direction';

const PROOF_SECTION_TYPES = new Set(['about', 'team', 'cases', 'testimonials']);

export type DeepeningTarget = Pick<AbsentSitePlanSection, 'type' | 'name' | 'inputHint'>;

export function StepConditionalDeepening({
  target,
  availableTargets,
  onSelectTarget,
  onBackToPlan,
}: {
  target: DeepeningTarget | null;
  availableTargets: readonly DeepeningTarget[];
  onSelectTarget: (target: DeepeningTarget) => void;
  onBackToPlan: () => void;
}) {
  const { goTo } = useSurveyUx();

  if (!target) {
    return (
      <div className="space-y-5">
        <StepIntro>
          지금 구성만으로도 만들 수 있어요. 유지할 구성 가운데 실제 내용을 더 채우고 싶은 곳만 골라주세요.
        </StepIntro>
        <div className="grid gap-2 sm:grid-cols-2">
          {availableTargets.map((item) => (
            <button
              key={`${item.type}:${item.name}`}
              type="button"
              onClick={() => onSelectTarget(item)}
              className="group flex min-h-20 items-center justify-between gap-3 rounded-ob border border-ob-border bg-ob-surface px-4 py-3 text-left hover:border-ob-accent-strong"
            >
              <span>
                <span className="block text-[14px] font-semibold text-ob-ink">{item.name}</span>
                <span className="mt-1 line-clamp-2 block text-[12px] leading-relaxed text-ob-muted">{item.inputHint}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ob-accent-strong transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onBackToPlan}
          className="inline-flex h-11 items-center gap-2 rounded-ob border border-ob-border px-4 text-[14px] font-medium text-ob-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          구성으로 돌아가기
        </button>
      </div>
    );
  }

  if (target.type === 'gallery') {
    return (
      <div className="space-y-5">
        <StepIntro>
          ‘{target.name}’에는 사용 권리를 확인한 실제 사진이 필요해요. 사진 단계로 이동해 올리면 구성에 바로 반영됩니다.
        </StepIntro>
        <button
          type="button"
          onClick={() => goTo(6)}
          className="inline-flex h-11 items-center gap-2 rounded-ob bg-ob-accent px-4 text-[14px] font-semibold text-white"
        >
          <Camera className="h-4 w-4" />
          사진 올리기
        </button>
      </div>
    );
  }

  if (target.type === 'cta') {
    return (
      <div className="space-y-5">
        <StepIntro>
          ‘{target.name}’에는 실제로 연결할 홈페이지·블로그·플레이스·공식 채널 주소가 필요해요.
        </StepIntro>
        <button
          type="button"
          onClick={() => goTo(1)}
          className="inline-flex h-11 items-center gap-2 rounded-ob bg-ob-accent px-4 text-[14px] font-semibold text-white"
        >
          <Link2 className="h-4 w-4" />
          공식 채널 입력하기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="rounded-ob border border-ob-accent-strong/30 bg-ob-accent-soft px-4 py-3">
        <p className="text-[12px] font-semibold text-ob-accent-strong">선택한 구성</p>
        <p className="mt-1 text-[16px] font-semibold text-ob-ink">{target.name}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">{target.inputHint}</p>
      </div>
      {target.type !== 'testimonials' ? (
        <Step03Content mode="deepening" focusType={target.type} />
      ) : null}
      {PROOF_SECTION_TYPES.has(target.type) ? <ProofFields /> : null}
      {target.type === 'team' ? (
        <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-[13px] leading-6 text-ob-muted">
          구성원 얼굴을 보여주려면 사장님이 제공하고 공개 사용을 확인한 실제 인물 사진만 사용해요.
          사진이 없어도 경력·자격 정보 중심으로 구성할 수 있어요.
          <button
            type="button"
            onClick={() => goTo(6)}
            className="ml-2 inline-flex min-h-9 items-center gap-1 font-semibold text-ob-accent-strong"
          >
            <Camera className="h-3.5 w-3.5" />
            실제 인물 사진 올리기(선택)
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onBackToPlan}
        className="inline-flex h-11 items-center gap-2 rounded-ob border border-ob-border px-4 text-[14px] font-medium text-ob-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        구성에 반영됐는지 확인하기
      </button>
    </div>
  );
}
