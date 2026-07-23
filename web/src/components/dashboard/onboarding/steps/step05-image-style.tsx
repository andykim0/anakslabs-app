'use client';

/**
 * S5 이미지 방향 — asset-policy v2의 네 방향만 신규 선택에 노출한다.
 * legacy imageStyle은 저장 호환을 위해 호스트가 projection으로 유지하지만 이 UI의 선택 축은 아니다.
 */
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ImagePlus, LockKeyhole } from 'lucide-react';
import type { CandidateStyle } from '@/lib/types/domain';
import { IMAGE_STYLE_OPTIONS, defaultImageStyle } from '@/lib/onboarding/image-style';
import {
  IMAGE_DIRECTION_OPTIONS,
  REFERENTIAL_IMAGE_POLICY_COPY,
  REAL_PHOTO_REQUIRED_GUIDANCE,
  canSelectRealPhoto,
  imageDirectionToLegacyCandidateStyle,
  recommendedImageDirection,
  type ImageDirectionId,
} from '@/lib/assets/image-directions';
import { cn } from '../../ui';
import {
  STYLE_SAMPLE_SRC,
  StepIntro,
  StyleThumb,
  type SurveyForm,
  useSurveyUx,
} from './shared';

function LegacyStyleSample({ style }: { style: CandidateStyle }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <StyleThumb style={style} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={STYLE_SAMPLE_SRC[style]}
      alt=""
      aria-hidden="true"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function LegacyImageStyle() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const industry = watch('industry');
  const recommended = defaultImageStyle(industry);
  const effective = (watch('imageStyle') as CandidateStyle | undefined) ?? recommended;

  return (
    <div className="space-y-6">
      <StepIntro>
        사이트의 전체 분위기를 정해요. {REFERENTIAL_IMAGE_POLICY_COPY.suppliedVisuals}
      </StepIntro>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {IMAGE_STYLE_OPTIONS.map((option) => {
          const selected = effective === option.id;
          const isRecommended = option.id === recommended;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setValue('imageStyle', option.id, { shouldValidate: true })}
              aria-pressed={selected}
              className={cn(
                'flex flex-col overflow-hidden rounded-ob border text-left transition-colors',
                selected
                  ? 'border-ob-accent-strong ring-1 ring-ob-accent'
                  : 'border-ob-border hover:border-ob-muted',
              )}
            >
              <div className="relative aspect-[8/5] w-full bg-ob-bg">
                <LegacyStyleSample style={option.id} />
                {isRecommended ? (
                  <span className="absolute top-2 left-2 rounded-full bg-ob-accent-strong px-2 py-0.5 text-[11px] font-semibold text-white">
                    추천
                  </span>
                ) : null}
              </div>
              <div className="p-3">
                <p className={cn(
                  'text-[15px] font-semibold',
                  selected ? 'text-ob-accent-strong' : 'text-ob-ink',
                )}>
                  {option.label}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ob-muted">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DirectionSample({
  direction,
  realPhotoUrl,
}: {
  direction: ImageDirectionId;
  realPhotoUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (direction === 'abstract_editorial') {
    return (
      <div
        aria-hidden="true"
        className="h-full w-full bg-[radial-gradient(circle_at_28%_30%,rgba(35,105,255,.72),transparent_25%),radial-gradient(circle_at_72%_62%,rgba(35,211,192,.55),transparent_30%),linear-gradient(135deg,#f5f8ff,#dfe8ff_48%,#f8fbff)]"
      >
        <span className="absolute inset-[18%] rounded-[42%_58%_64%_36%/40%_35%_65%_60%] border border-white/80 bg-white/30 shadow-[0_18px_45px_rgba(35,105,255,.16)] backdrop-blur-sm" />
      </div>
    );
  }

  const legacyStyle = imageDirectionToLegacyCandidateStyle(direction);
  const src = direction === 'real_photo' && realPhotoUrl
    ? realPhotoUrl
    : STYLE_SAMPLE_SRC[legacyStyle];
  if (failed) {
    return <div aria-hidden="true" className="h-full w-full bg-ob-accent-soft" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={direction === 'real_photo' && realPhotoUrl ? '업로드한 실제 사진 미리보기' : ''}
      aria-hidden={direction !== 'real_photo' || !realPhotoUrl}
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function Step05ImageStyle({
  assetPolicyV2Ready,
}: {
  /** Server-derived ASSIGN readiness; form values cannot activate policy. */
  assetPolicyV2Ready: boolean;
}) {
  return assetPolicyV2Ready ? <V2ImageStyle /> : <LegacyImageStyle />;
}

function V2ImageStyle() {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { goTo } = useSurveyUx();
  const industry = watch('industry');
  const tone = watch('tone') ?? [];
  const heroPhotoAssetRef = watch('heroPhotoAssetRef');
  const heroPhotoUrl = watch('heroPhotoUrl');
  const storePhotoAssetRefs = watch('storePhotoAssetRefs') ?? [];
  const storePhotoUrls = watch('storePhotoUrls') ?? [];
  const contentItems = watch('contentItems') ?? [];
  const generalAssetAttestationId = watch('generalAssetAttestationId');
  const personPhotoAssetIds = watch('personPhotoAssetIds') ?? [];
  const nonPersonPhotoAssetIds = watch('nonPersonPhotoAssetIds') ?? [];
  const recommended = recommendedImageDirection({ industry, tone });
  const selected = watch('imageDirectionId') ?? recommended;
  const realPhotoEligible = canSelectRealPhoto({
    heroPhotoAssetRef,
    heroPhotoUrl,
    storePhotoUrls,
    storePhotoAssetRefs,
    contentItems,
    generalAssetAttestationId,
    personPhotoAssetIds,
    nonPersonPhotoAssetIds,
  });
  const realPhotoPreview = heroPhotoAssetRef?.url ?? storePhotoAssetRefs[0]?.url;
  const blockedSelection = selected === 'real_photo' && !realPhotoEligible;

  const choose = (direction: ImageDirectionId) => {
    if (direction === 'real_photo' && !realPhotoEligible) return;
    setValue('imageDirectionId', direction, { shouldDirty: true, shouldValidate: true });
    // Compatibility projection only. New generation must consume imageDirectionId.
    setValue('imageStyle', imageDirectionToLegacyCandidateStyle(direction), {
      shouldDirty: true,
      shouldValidate: false,
    });
  };

  return (
    <div className="space-y-6">
      <StepIntro>
        사장님이 올린 실제 사진을 그대로 보여줄지, 다보임이 준비하는 명백히 예술적인 방향을 사용할지 정해요.
        업로드가 없어도 실제 사업·제품·사람을 지어내지 않고 완주할 수 있어요.
      </StepIntro>

      <fieldset aria-describedby="image-direction-policy">
        <legend className="sr-only">사이트 이미지 방향</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {IMAGE_DIRECTION_OPTIONS.map((option) => {
            const isRealPhoto = option.id === 'real_photo';
            const disabled = isRealPhoto && !realPhotoEligible;
            const isSelected = selected === option.id;
            const isRecommended = option.id === recommended;
            return (
              <label
                key={option.id}
                aria-disabled={disabled}
                className={cn(
                  'relative flex min-h-full flex-col overflow-hidden rounded-ob border text-left transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ob-accent focus-within:ring-offset-2',
                  isSelected
                    ? 'border-ob-accent-strong ring-1 ring-ob-accent'
                    : 'border-ob-border hover:border-ob-muted',
                  disabled && 'cursor-not-allowed opacity-65 hover:border-ob-border',
                  !disabled && 'cursor-pointer',
                )}
              >
                <input
                  type="radio"
                  name="image-direction"
                  value={option.id}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => choose(option.id)}
                  aria-describedby={disabled ? 'image-direction-policy' : undefined}
                  className="sr-only"
                />
                <div className="relative aspect-[8/5] w-full overflow-hidden bg-ob-bg">
                  <DirectionSample direction={option.id} realPhotoUrl={realPhotoPreview} />
                  {isRecommended ? (
                    <span className="absolute top-2 left-2 rounded-full bg-ob-accent-strong px-2 py-0.5 text-[11px] font-semibold text-white">
                      추천
                    </span>
                  ) : null}
                  {disabled ? (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-ob-ink/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                      실제 사진 필요
                    </span>
                  ) : null}
                </div>
                <span className="flex flex-1 flex-col p-3.5">
                  <span
                    className={cn(
                      'text-[15px] font-semibold',
                      isSelected ? 'text-ob-accent-strong' : 'text-ob-ink',
                    )}
                  >
                    {option.label}
                  </span>
                  <span className="mt-1 text-[13px] leading-relaxed text-ob-muted">
                    {option.description}
                  </span>
                  <span className="mt-2 text-[12px] leading-relaxed text-ob-muted">
                    {option.detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!realPhotoEligible || blockedSelection ? (
        <div
          id="image-direction-policy"
          role={blockedSelection ? 'alert' : 'note'}
          className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-[13px] leading-6 text-ob-ink"
        >
          <p>
            {REAL_PHOTO_REQUIRED_GUIDANCE}
          </p>
          <button
            type="button"
            onClick={() => goTo(4)}
            className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-ob border border-ob-accent px-3 font-semibold text-ob-accent-strong transition-colors hover:bg-ob-accent-soft"
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            사진 올리고 확인하기
          </button>
        </div>
      ) : (
        <p id="image-direction-policy" className="text-[13px] leading-5 text-ob-muted">
          확인된 직접 업로드 사진만 실사 방향에 사용합니다. URL이나 가져온 이미지는 자동으로 실제 사진이 되지 않아요.
        </p>
      )}
    </div>
  );
}
