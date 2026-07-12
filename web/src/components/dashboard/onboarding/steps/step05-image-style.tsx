'use client';

/**
 * S5 이미지 스타일 — IMAGE_STYLE_OPTIONS 3카드. 실제 샘플 이미지(onError → SVG StyleThumb 폴백).
 * 업종 기본값(defaultImageStyle)에 '추천' 뱃지.
 */
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { CandidateStyle } from '@/lib/types/domain';
import { IMAGE_STYLE_OPTIONS, defaultImageStyle } from '@/lib/onboarding/image-style';
import { cn } from '../../ui';
import { STYLE_SAMPLE_SRC, StepIntro, StyleThumb, type SurveyForm } from './shared';

function StyleSample({ style }: { style: CandidateStyle }) {
  const [err, setErr] = useState(false);
  if (err) return <StyleThumb style={style} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={STYLE_SAMPLE_SRC[style]}
      alt=""
      aria-hidden
      className="h-full w-full object-cover"
      onError={() => setErr(true)}
    />
  );
}

export function Step05ImageStyle() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const industry = watch('industry');
  const recommended = defaultImageStyle(industry);
  const effective = (watch('imageStyle') as CandidateStyle | undefined) ?? recommended;

  return (
    <div className="space-y-6">
      <StepIntro>
        사이트에 들어갈 이미지의 전체 분위기를 정해요. 이 스타일로 디자인 후보가 만들어져요.
      </StepIntro>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {IMAGE_STYLE_OPTIONS.map((opt) => {
          const selected = effective === opt.id;
          const isRec = opt.id === recommended;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setValue('imageStyle', opt.id, { shouldValidate: true })}
              aria-pressed={selected}
              className={cn(
                'flex flex-col overflow-hidden rounded-ob border text-left transition-colors',
                selected
                  ? 'border-ob-accent-strong ring-1 ring-ob-accent'
                  : 'border-ob-border hover:border-ob-muted',
              )}
            >
              <div className="relative aspect-[8/5] w-full bg-ob-bg">
                <StyleSample style={opt.id} />
                {isRec ? (
                  <span className="absolute top-2 left-2 rounded-full bg-ob-accent-strong px-2 py-0.5 text-[11px] font-semibold text-white">
                    추천
                  </span>
                ) : null}
              </div>
              <div className="p-3">
                <p
                  className={cn(
                    'text-[15px] font-semibold',
                    selected ? 'text-ob-accent-strong' : 'text-ob-ink',
                  )}
                >
                  {opt.label}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
