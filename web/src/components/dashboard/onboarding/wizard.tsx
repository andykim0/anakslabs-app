'use client';

import { useState } from 'react';
import { ScanSearch } from 'lucide-react';
import type { DesignCandidate, ExtraFeatureSelection, SurveyInput, Tier } from '@/lib/types/domain';
import type { ExtrasOptionsDto } from '../api';
import { cn } from '../ui';
import { SurveyStep } from './survey-step';
import { CandidateStep } from './candidate-step';
import { ExtrasStep } from './extras-step';
import { GenerateStep } from './generate-step';

export interface ScanContext {
  url: string;
  total: number;
  issueCount: number;
  notes: string;
}

const STEPS = [
  { no: 1, label: '설문' },
  { no: 2, label: '디자인 선택' },
  { no: 3, label: '부가기능' },
  { no: 4, label: '생성' },
] as const;

export function OnboardingWizard({
  defaultBusinessName,
  scanContext,
  tier = 'basic',
}: {
  defaultBusinessName?: string;
  scanContext?: ScanContext;
  /** [motion 4단계] 소유자 티어 — Premium이면 성공화면에 AI 영상 히어로 스튜디오 노출 */
  tier?: Tier;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [survey, setSurvey] = useState<SurveyInput | null>(null);
  const [candidate, setCandidate] = useState<DesignCandidate | null>(null);
  // [v3 Phase 3] 부가기능 선택 (건너뛰면 undefined)
  const [extras, setExtras] = useState<ExtraFeatureSelection | undefined>(undefined);
  const [extrasOptions, setExtrasOptions] = useState<ExtrasOptionsDto | undefined>(undefined);
  // [§3] 재생성: 최초 생성으로 만들어진 사이트 id + 무료 재생성 사용 횟수
  const [siteId, setSiteId] = useState<string | null>(null);
  const [freeRegensUsed, setFreeRegensUsed] = useState(0);

  return (
    <div className="mx-auto max-w-3xl">
      {/* [v3 Phase 7] 스캔 프리필 컨텍스트 — 왜 이 사이트를 다시 짓는지 상기 */}
      {scanContext && step === 1 ? (
        <div className="mb-6 rounded-xl border border-[#4a3a22] bg-[#151310] px-4 py-3">
          <p className="flex items-start gap-2 text-sm leading-6 text-neutral-300">
            <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-[#d9b878]" />
            <span>{scanContext.notes || `이전 진단 ${scanContext.total}점 · 문제 ${scanContext.issueCount}개`} 새 사이트는 이 문제들을 해결한 100점 기반으로 시작합니다.</span>
          </p>
        </div>
      ) : null}

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
        <ExtrasStep
          survey={survey}
          onBack={() => setStep(2)}
          onComplete={(sel, opts) => {
            setExtras(sel);
            setExtrasOptions(opts);
            setStep(4);
          }}
        />
      ) : null}

      {step === 4 && survey && candidate ? (
        <GenerateStep
          survey={survey}
          candidate={candidate}
          extras={extras}
          extrasOptions={extrasOptions}
          existingSiteId={siteId}
          freeRegensUsed={freeRegensUsed}
          tier={tier}
          onResult={(id, used) => {
            setSiteId(id);
            setFreeRegensUsed(used);
          }}
          onBack={() => setStep(3)}
          onPickAnother={() => setStep(2)}
          onEditSurvey={() => setStep(1)}
        />
      ) : null}
    </div>
  );
}
