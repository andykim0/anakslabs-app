'use client';

/**
 * S3 소개·메뉴 원문(providedContent) — 템플릿 칩(머리말 삽입) + S2 가져온 내용 프리필 배지.
 */
import { useFormContext } from 'react-hook-form';
import { Sparkles } from 'lucide-react';
import { cn } from '../../ui';
import { Chip, Field, StepIntro, obInput, useSurveyUx, type SurveyForm } from './shared';

const TEMPLATES: { label: string; heading: string }[] = [
  { label: '소개', heading: '[소개]\n' },
  { label: '메뉴·가격', heading: '[메뉴·가격]\n' },
  { label: '영업 정보', heading: '[영업 정보]\n영업시간: \n휴무: \n주차: \n' },
  { label: '하고 싶은 말', heading: '[하고 싶은 말]\n' },
];

export function Step03Content() {
  const { register, watch, setValue, formState } = useFormContext<SurveyForm>();
  const { importedBadge } = useSurveyUx();
  const content = watch('providedContent') ?? '';

  const insert = (heading: string) => {
    const base = content.trim();
    const next = (base ? `${base}\n\n${heading}` : heading).slice(0, 5000);
    setValue('providedContent', next, { shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      <StepIntro>
        여기 적어주신 내용을 AI가 지어내지 않고 그대로 다듬어 써요. 없으면 비워두셔도 AI가 초안을 채워요.
      </StepIntro>

      {importedBadge ? (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-ob-border bg-ob-accent-soft px-3 py-1.5 text-[13px] text-ob-accent-strong">
          <Sparkles className="h-3.5 w-3.5" />
          가져온 내용이에요, 자유롭게 고쳐주세요
        </div>
      ) : null}

      <Field
        label="소개·메뉴 원문"
        hint="아래 버튼을 누르면 머리말이 들어가요. URL을 붙여넣어도 돼요."
        error={formState.errors.providedContent?.message}
      >
        <div className="mb-2 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <Chip key={t.label} selected={false} onClick={() => insert(t.heading)}>
              + {t.label}
            </Chip>
          ))}
        </div>
        <textarea
          {...register('providedContent')}
          rows={9}
          placeholder="실제 소개 문구, 대표 메뉴·서비스, 가격, 영업 정보 등을 자유롭게 붙여넣어 주세요."
          className={cn(obInput, 'resize-y leading-relaxed')}
        />
      </Field>
    </div>
  );
}
