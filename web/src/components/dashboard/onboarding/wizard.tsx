'use client';

import { useState } from 'react';
import { ScanSearch } from 'lucide-react';
import type { DesignCandidate, ExtraFeatureSelection, SurveyInput, Tier } from '@/lib/types/domain';
import type { ExtrasOptionsDto, MotionChoiceDto } from '../api';
import { cn } from '../ui';
import { SurveyStep } from './survey-step';
import { ImproveStep } from './improve-step';
import { MotionChoiceStep } from './motion-choice-step';
import { CandidateStep } from './candidate-step';
import { ExtrasStep } from './extras-step';
import { GenerateStep } from './generate-step';

export interface ScanContext {
  url: string;
  total: number;
  issueCount: number;
  notes: string;
}

/** [I1] 개선 모드 진입 컨텍스트 — 있으면 개선 흐름(가져오기·자동추론·그대로 옵션). I2에서 분기 소비. */
export interface ImproveContext {
  url: string;
  scanId: string;
  total: number;
  issueCount: number;
}

// [A4] 승인 프레이밍 — 각 단계는 '확인하고 넘어가는' 게이트. 라벨을 승인 축으로.
const STEPS = [
  { no: 1, label: '내용' },
  { no: 2, label: '움직임' },
  { no: 3, label: '디자인 방향' },
  { no: 4, label: '부가기능' },
  { no: 5, label: '구성·생성' },
] as const;

export function OnboardingWizard({
  defaultBusinessName,
  scanContext,
  improve,
  tier = 'basic',
}: {
  defaultBusinessName?: string;
  scanContext?: ScanContext;
  /** [I1] 개선 모드 컨텍스트 — 있으면 개선 흐름(I2). 미지정 = fresh(기존 8스텝 무회귀) */
  improve?: ImproveContext;
  /** [motion 4단계] 소유자 티어 — Premium이면 성공화면에 AI 영상 히어로 스튜디오 노출 */
  tier?: Tier;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [survey, setSurvey] = useState<SurveyInput | null>(null);
  // [Q7] 움직임 고르기 선택 (설문 직후 · 디자인 선택 전)
  const [motionChoice, setMotionChoice] = useState<MotionChoiceDto | undefined>(undefined);
  const [candidate, setCandidate] = useState<DesignCandidate | null>(null);
  // [v3 Phase 3] 부가기능 선택 (건너뛰면 undefined)
  const [extras, setExtras] = useState<ExtraFeatureSelection | undefined>(undefined);
  const [extrasOptions, setExtrasOptions] = useState<ExtrasOptionsDto | undefined>(undefined);
  // [§3] 재생성: 최초 생성으로 만들어진 사이트 id + 무료 재생성 사용 횟수
  const [siteId, setSiteId] = useState<string | null>(null);
  const [freeRegensUsed, setFreeRegensUsed] = useState(0);

  return (
    <div className="mx-auto max-w-3xl">
      {/* [v3 Phase 7] 스캔 프리필 컨텍스트 — 왜 이 사이트를 다시 짓는지 상기. 개선 모드는 ImproveStep이 자체 배너를 가지므로 제외(중복 방지) */}
      {scanContext && step === 1 && !improve ? (
        <div className="mb-6 rounded-xl border border-ob-border bg-ob-accent-soft px-4 py-3">
          <p className="flex items-start gap-2 text-sm leading-6 text-ob-ink">
            <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-ob-accent-strong" />
            <span>{scanContext.notes || `이전 진단 ${scanContext.total}점 · 문제 ${scanContext.issueCount}개`} 새 사이트는 이 문제들을 해결한 100점 기반으로 시작합니다.</span>
          </p>
        </div>
      ) : null}

      {/* [A4] 진행 표시 + 승인 프레이밍 — 각 단계는 확인하고 넘어가는 게이트(기본 1클릭 통과, 언제든 이전) */}
      <div className="mb-8">
        <p className="mb-2 text-center text-[11px] text-ob-muted">
          {step}/5 단계 · 확인하고 넘어가면 돼요 — 마음에 안 들면 언제든 이전으로
        </p>
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
                      done || active ? 'bg-ob-accent text-ob-ink' : 'bg-ob-border text-ob-muted',
                    )}
                  >
                    {s.no}
                  </span>
                  <span
                    className={cn(
                      'text-xs whitespace-nowrap',
                      active ? 'font-semibold text-ob-ink' : 'text-ob-muted',
                    )}
                  >
                    {improve && s.no === 1 ? '가져오기' : s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 ? (
                  <div
                    className={cn(
                      'mx-3 h-px flex-1 transition-colors',
                      step > s.no ? 'bg-ob-accent-strong' : 'bg-ob-border',
                    )}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 ? (
        improve ? (
          // [I2] 개선 모드 — SurveyStep 대신 짧은 흐름(가져오기·확인·색). 이후 step2~5는 fresh와 동일 재사용.
          <ImproveStep
            improve={improve}
            defaultBusinessName={defaultBusinessName}
            onComplete={(values) => {
              setSurvey(values);
              setCandidate(null);
              setStep(2);
            }}
          />
        ) : (
          <SurveyStep
            defaultBusinessName={defaultBusinessName}
            initialValues={survey}
            improveSeed={undefined}
            onComplete={(values) => {
              setSurvey(values);
              // 설문이 바뀌었을 수 있으므로 이전 선택 초기화
              setCandidate(null);
              setStep(2);
            }}
          />
        )
      ) : null}

      {step === 2 && survey ? (
        <MotionChoiceStep
          tier={tier}
          purposeId={survey.purposeId}
          initial={motionChoice}
          onBack={() => setStep(1)}
          onComplete={(choice) => {
            setMotionChoice(choice);
            setStep(3);
          }}
        />
      ) : null}

      {step === 3 && survey ? (
        <CandidateStep
          survey={survey}
          heroTechnique={motionChoice?.heroTechnique}
          onBack={() => setStep(2)}
          onSelect={(selected) => {
            setCandidate(selected);
            setStep(4);
          }}
        />
      ) : null}

      {step === 4 && survey && candidate ? (
        <ExtrasStep
          survey={survey}
          onBack={() => setStep(3)}
          onComplete={(sel, opts) => {
            setExtras(sel);
            setExtrasOptions(opts);
            setStep(5);
          }}
        />
      ) : null}

      {step === 5 && survey && candidate ? (
        <GenerateStep
          survey={survey}
          candidate={candidate}
          extras={extras}
          extrasOptions={extrasOptions}
          motionChoice={motionChoice}
          existingSiteId={siteId}
          freeRegensUsed={freeRegensUsed}
          tier={tier}
          onResult={(id, used) => {
            setSiteId(id);
            setFreeRegensUsed(used);
          }}
          onBack={() => setStep(4)}
          onPickAnother={() => setStep(3)}
          onEditSurvey={() => setStep(1)}
        />
      ) : null}
    </div>
  );
}
