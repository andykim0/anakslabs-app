'use client';

import { useState } from 'react';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { cn } from '../ui';
import { SurveyStep } from './survey-step';
import { CandidateStep } from './candidate-step';
import { GenerateStep } from './generate-step';

const STEPS = [
  { no: 1, label: '설문' },
  { no: 2, label: '디자인 선택' },
  { no: 3, label: '생성' },
] as const;

export function OnboardingWizard({ defaultBusinessName }: { defaultBusinessName?: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [survey, setSurvey] = useState<SurveyInput | null>(null);
  const [candidate, setCandidate] = useState<DesignCandidate | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      {/* 진행 표시 */}
      <div className="mb-8">
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const done = step > s.no;
            const active = step === s.no;
            return (
              <div key={s.no} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                      done || active ? 'bg-[#c8a96a] text-neutral-950' : 'bg-neutral-800 text-neutral-500',
                    )}
                  >
                    {s.no}
                  </span>
                  <span
                    className={cn(
                      'text-xs whitespace-nowrap',
                      active ? 'font-semibold text-neutral-100' : 'text-neutral-500',
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 ? (
                  <div
                    className={cn(
                      'mx-3 h-px flex-1 transition-colors',
                      step > s.no ? 'bg-[#c8a96a]' : 'bg-neutral-800',
                    )}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 ? (
        <SurveyStep
          defaultBusinessName={defaultBusinessName}
          initialValues={survey}
          onComplete={(values) => {
            setSurvey(values);
            // 설문이 바뀌었을 수 있으므로 이전 선택 초기화
            setCandidate(null);
            setStep(2);
          }}
        />
      ) : null}

      {step === 2 && survey ? (
        <CandidateStep
          survey={survey}
          onBack={() => setStep(1)}
          onSelect={(selected) => {
            setCandidate(selected);
            setStep(3);
          }}
        />
      ) : null}

      {step === 3 && survey && candidate ? (
        <GenerateStep survey={survey} candidate={candidate} onBack={() => setStep(2)} />
      ) : null}
    </div>
  );
}
