'use client';

/**
 * S6 느낌 고르기(통합) — REFERENCE_SAMPLES 12카드(최대 2, 첫 선택=팔레트 시드) +
 * 접힌 토글 "대표 색이 따로 있어요" → COLOR_FAMILIES 8계열 → shades 5단 + 직접 고르기(colorOverride).
 * 보조색은 "보조색도 직접" 링크로만 노출.
 */
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { COLOR_FAMILIES } from '@/lib/onboarding/color-families';
import { REFERENCE_SAMPLES } from '@/lib/design/reference-samples';
import { cn } from '../../ui';
import { useToast } from '../../toast';
import { StepIntro, deriveColors, type SurveyForm } from './shared';

function Swatch({ color, size = 'h-5 w-5' }: { color: string; size?: string }) {
  return (
    <span
      className={cn('inline-block rounded-full border border-black/10', size)}
      style={{ backgroundColor: color }}
    />
  );
}

export function Step06MoodColor() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const moodIds = watch('moodIds') ?? [];
  const colorOverride = watch('colorOverride') ?? '';
  const secondaryColor = watch('secondaryColor') ?? '';

  const [openColor, setOpenColor] = useState(Boolean(colorOverride));
  const [familyId, setFamilyId] = useState<string>(COLOR_FAMILIES[0].id);
  const [showSecondary, setShowSecondary] = useState(Boolean(secondaryColor));

  const toggleMood = (id: string) => {
    if (moodIds.includes(id)) {
      setValue('moodIds', moodIds.filter((m) => m !== id), { shouldValidate: true });
    } else if (moodIds.length >= 2) {
      toast('info', '느낌은 최대 2개까지 고를 수 있어요.');
    } else {
      setValue('moodIds', [...moodIds, id], { shouldValidate: true });
    }
  };

  const family = COLOR_FAMILIES.find((f) => f.id === familyId) ?? COLOR_FAMILIES[0];
  const applied = deriveColors({ moodIds, colorOverride, secondaryColor });

  return (
    <div className="space-y-7">
      <StepIntro>
        마음에 드는 느낌을 고르면, 그 느낌으로 디자인 후보의 색과 스타일을 정해요. 최대 2개까지 고를 수 있어요.
      </StepIntro>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {REFERENCE_SAMPLES.map((s) => {
          const selected = moodIds.includes(s.id);
          const isSeed = moodIds[0] === s.id;
          const strip = [s.paletteSeed.primary, s.paletteSeed.secondary ?? s.swatch[1], s.swatch[0]];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleMood(s.id)}
              aria-pressed={selected}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-ob border text-left transition-colors',
                selected
                  ? 'border-ob-accent-strong ring-1 ring-ob-accent'
                  : 'border-ob-border hover:border-ob-muted',
              )}
            >
              <span
                className="h-16 w-full"
                style={{ backgroundImage: `linear-gradient(135deg, ${s.swatch[0]}, ${s.swatch[1]})` }}
              />
              {selected ? (
                <span className="absolute top-1.5 right-1.5 rounded-full bg-ob-accent-strong px-2 py-0.5 text-[10px] font-bold text-white">
                  {isSeed ? '대표 색' : '선택'}
                </span>
              ) : null}
              <span className="flex flex-col gap-1.5 p-2.5">
                <span
                  className={cn(
                    'text-[13px] font-semibold',
                    selected ? 'text-ob-accent-strong' : 'text-ob-ink',
                  )}
                >
                  {s.label}
                </span>
                <span className="text-[11px] leading-4 text-ob-muted">{s.description}</span>
                <span className="mt-0.5 flex items-center gap-1">
                  {strip.map((c, i) => (
                    <Swatch key={i} color={c} size="h-4 w-4" />
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 대표 색 직접 지정 (접힘) */}
      <div className="rounded-ob border border-ob-border bg-ob-surface">
        <button
          type="button"
          onClick={() => setOpenColor((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[15px] font-medium text-ob-ink">우리 가게 대표 색이 따로 있어요</span>
          {openColor ? (
            <ChevronUp className="h-4 w-4 text-ob-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ob-muted" />
          )}
        </button>

        {openColor ? (
          <div className="space-y-4 border-t border-ob-border px-4 py-4">
            {/* 1단계: 계열 */}
            <div>
              <p className="mb-2 text-[13px] text-ob-muted">먼저 색 계열을 골라주세요.</p>
              <div className="flex flex-wrap gap-2">
                {COLOR_FAMILIES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFamilyId(f.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors',
                      familyId === f.id
                        ? 'border-ob-accent-strong bg-ob-accent-soft text-ob-accent-strong'
                        : 'border-ob-border text-ob-muted hover:border-ob-muted',
                    )}
                  >
                    <Swatch color={f.shades[2]} size="h-3.5 w-3.5" />
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2단계: 명암 5단 + 직접 고르기 */}
            <div>
              <p className="mb-2 text-[13px] text-ob-muted">밝기를 고르거나 직접 고르세요.</p>
              <div className="flex flex-wrap items-center gap-2">
                {family.shades.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={hex}
                    onClick={() => setValue('colorOverride', hex, { shouldValidate: true })}
                    className={cn(
                      'h-9 w-9 rounded-ob border-2 transition-transform',
                      colorOverride.toLowerCase() === hex.toLowerCase()
                        ? 'scale-105 border-ob-accent-strong'
                        : 'border-black/10 hover:border-ob-muted',
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-ob border border-ob-border px-2.5 py-1.5 text-[13px] text-ob-muted">
                  직접 고르기
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(colorOverride) ? colorOverride : '#a98844'}
                    onChange={(e) => setValue('colorOverride', e.target.value, { shouldValidate: true })}
                    className="h-6 w-8 cursor-pointer rounded border border-ob-border bg-ob-surface"
                  />
                </label>
                {colorOverride ? (
                  <button
                    type="button"
                    onClick={() => setValue('colorOverride', '', { shouldValidate: true })}
                    className="text-[13px] text-ob-muted underline hover:text-ob-ink"
                  >
                    지우기
                  </button>
                ) : null}
              </div>
            </div>

            {/* 보조색 (링크로만 노출) */}
            {showSecondary ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-ob-muted">보조색</span>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(secondaryColor) ? secondaryColor : '#f3ecdd'}
                  onChange={(e) => setValue('secondaryColor', e.target.value, { shouldValidate: true })}
                  className="h-7 w-10 cursor-pointer rounded border border-ob-border bg-ob-surface"
                />
                <button
                  type="button"
                  onClick={() => {
                    setValue('secondaryColor', '', { shouldValidate: true });
                    setShowSecondary(false);
                  }}
                  className="text-[13px] text-ob-muted underline hover:text-ob-ink"
                >
                  비우기
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSecondary(true)}
                className="text-[13px] text-ob-accent-strong underline"
              >
                보조색도 직접 고를게요
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* 적용될 색 미리보기 */}
      {applied.colorPreference ? (
        <div className="flex items-center gap-2.5 rounded-ob border border-ob-border bg-ob-bg px-4 py-3">
          <span className="text-[13px] text-ob-muted">적용될 색</span>
          <Swatch color={applied.colorPreference} />
          {applied.secondaryColor ? <Swatch color={applied.secondaryColor} /> : null}
          <span className="text-[13px] text-ob-muted">{applied.colorPreference}</span>
        </div>
      ) : (
        <p className="text-[13px] text-ob-muted">느낌을 하나 고르거나 대표 색을 직접 골라주세요.</p>
      )}
    </div>
  );
}
