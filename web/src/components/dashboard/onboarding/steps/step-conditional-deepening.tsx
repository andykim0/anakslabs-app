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
          You can make it with just the configuration right now. Among the configurations you want to keep, please select only the ones you want to fill with more actual content.
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
          Return to Configuration
        </button>
      </div>
    );
  }

  if (target.type === 'gallery') {
    return (
      <div className="space-y-5">
        <StepIntro>
          ‘{target.name}’ requires an actual photo with confirmed usage rights. If you go to the photo level and upload it, it will be immediately reflected in the composition.
        </StepIntro>
        <button
          type="button"
          onClick={() => goTo(6)}
          className="inline-flex h-11 items-center gap-2 rounded-ob bg-ob-accent px-4 text-[14px] font-semibold text-white"
        >
          <Camera className="h-4 w-4" />
          Post a photo
        </button>
      </div>
    );
  }

  if (target.type === 'cta') {
    return (
      <div className="space-y-5">
        <StepIntro>
          ‘{target.name}’ requires the address of the homepage, blog, place, or official channel to actually connect to.
        </StepIntro>
        <button
          type="button"
          onClick={() => goTo(1)}
          className="inline-flex h-11 items-center gap-2 rounded-ob bg-ob-accent px-4 text-[14px] font-semibold text-white"
        >
          <Link2 className="h-4 w-4" />
          Enter official channel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="rounded-ob border border-ob-accent-strong/30 bg-ob-accent-soft px-4 py-3">
        <p className="text-[12px] font-semibold text-ob-accent-strong">Configuration selected</p>
        <p className="mt-1 text-[16px] font-semibold text-ob-ink">{target.name}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">{target.inputHint}</p>
      </div>
      {target.type !== 'testimonials' ? (
        <Step03Content mode="deepening" focusType={target.type} />
      ) : null}
      {PROOF_SECTION_TYPES.has(target.type) ? <ProofFields /> : null}
      {target.type === 'team' ? (
        <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-[13px] leading-6 text-ob-muted">
          To show team members’ faces, we only use photos provided by the owner and confirmed for public use.
          Even without photos, you can organize it based on career and qualification information.
          <button
            type="button"
            onClick={() => goTo(6)}
            className="ml-2 inline-flex min-h-9 items-center gap-1 font-semibold text-ob-accent-strong"
          >
            <Camera className="h-3.5 w-3.5" />
            Upload a photo of a real person (optional)
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onBackToPlan}
        className="inline-flex h-11 items-center gap-2 rounded-ob border border-ob-border px-4 text-[14px] font-medium text-ob-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Check if this is reflected in the configuration
      </button>
    </div>
  );
}
