'use client';

/**
 * S8 확인 — 전 입력 요약 카드(스텝별 편집 링크) + 추가 요청(선택) → "생성 시작"(호스트 onComplete).
 */
import { useFormContext } from 'react-hook-form';
import { Pencil } from 'lucide-react';
import type {
  CandidateStyle,
  PresenceKind,
  SiteGoalId,
  SitePurposeId,
} from '@/lib/types/domain';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import {
  IMAGE_DIRECTIONS,
  REFERENTIAL_IMAGE_POLICY_COPY,
  canSelectRealPhoto,
  legacyCandidateStyleToImageDirection,
} from '@/lib/assets/image-directions';
import { IMAGE_STYLE_OPTIONS, defaultImageStyle } from '@/lib/onboarding/image-style';
import { REFERENCE_SAMPLES } from '@/lib/design/reference-samples';
import { SITE_GOALS } from '@/lib/onboarding/site-goal';
import { cn } from '../../ui';
import { Field, StepIntro, deriveColors, obInput, useSurveyUx, type SurveyForm } from './shared';

const KIND_LABEL: Record<PresenceKind, string> = {
  website: "Website",
  naver_blog: "Legacy Naver Blog",
  instagram: "Instagram",
  naver_place: "Legacy Naver Place",
  other: "Other",
};

function Row({
  title,
  step,
  goTo,
  children,
}: {
  title: string;
  step: number;
  goTo: (s: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ob-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] text-ob-muted">{title}</p>
        <div className="mt-0.5 text-[15px] text-ob-ink">{children}</div>
      </div>
      <button
        type="button"
        onClick={() => goTo(step)}
        className="inline-flex shrink-0 items-center gap-1 text-[13px] text-ob-accent-strong hover:underline"
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>
    </div>
  );
}

function Empty() {
  return <span className="text-ob-muted">Not provided</span>;
}

export function Step08Review() {
  const { watch, register } = useFormContext<SurveyForm>();
  const { goTo, assetPolicyV2Ready } = useSurveyUx();
  const v = watch();

  const purpose = v.purposeId ? findPurpose(v.purposeId as SitePurposeId) : undefined;
  const legacyImageStyle = (v.imageStyle as CandidateStyle | undefined)
    ?? defaultImageStyle(v.industry);
  const legacyImageStyleLabel = IMAGE_STYLE_OPTIONS.find(
    (option) => option.id === legacyImageStyle,
  )?.label ?? legacyImageStyle;
  const realPhotoEligible = canSelectRealPhoto(v);
  const imageDirection = v.imageDirectionId
    ?? legacyCandidateStyleToImageDirection(v.imageStyle, realPhotoEligible);
  const imageDirectionLabel = IMAGE_DIRECTIONS[imageDirection].label;
  const goalLabel = v.siteGoal ? SITE_GOALS[v.siteGoal as SiteGoalId]?.label : undefined;
  const moodLabels = (v.moodIds ?? [])
    .map((id) => REFERENCE_SAMPLES.find((s) => s.id === id)?.label)
    .filter(Boolean) as string[];
  const applied = deriveColors(v);

  return (
    <div className="space-y-6">
      <StepIntro>If correct, click Start Creation below. Each item can be edited at any time.</StepIntro>

      <div className="rounded-ob border border-ob-border bg-ob-surface px-4">
        <Row title="Purpose and specialty" step={2} goTo={goTo}>
          {purpose?.label ?? <Empty />}
          {v.industry ? ` · ${v.industry}` : ''}
        </Row>
        <Row title="Clinic name" step={2} goTo={goTo}>
          {v.businessName || <Empty />}
          {v.region ? <span className="text-ob-muted"> · {v.region}</span> : null}
        </Row>
        <Row title="Short introduction" step={2} goTo={goTo}>
          {v.tagline || <span className="text-ob-muted">No input</span>}
        </Row>
        <Row title="Existing sources" step={1} goTo={goTo}>
          {v.existingPresence.length ? (
            v.existingPresence.map((p) => KIND_LABEL[p.kind]).join(' · ')
          ) : (
            <Empty />
          )}
        </Row>
        <Row title="Source text" step={5} goTo={goTo}>
          {v.providedContent?.trim() ? (
            <span className="line-clamp-2 text-ob-muted">{v.providedContent.trim()}</span>
          ) : (
            <span className="text-ob-muted">No additional input</span>
          )}
        </Row>
        <Row title="Representative real photos" step={6} goTo={goTo}>
          {!assetPolicyV2Ready ? (
            v.heroPhotoUrl
              ? "1 photo · available for the hero"
              : <span className="text-ob-muted">{REFERENTIAL_IMAGE_POLICY_COPY.suppliedVisualsShort}</span>
          ) : v.heroPhotoUrl ? (
            v.heroPhotoAssetRef
              ? "1 photo · verified direct upload"
              : <span className="text-ob-muted">1 photo · URL image (not direct-upload evidence)</span>
          ) : <span className="text-ob-muted">{REFERENTIAL_IMAGE_POLICY_COPY.suppliedVisualsShort}</span>}
        </Row>
        <Row title="Clinic, service, and team photos" step={6} goTo={goTo}>
          {!assetPolicyV2Ready
            ? (v.storePhotoUrls.length ? `${v.storePhotoUrls.length} images` : <Empty />)
            : v.storePhotoUrls.length
            ? `${v.storePhotoUrls.length} photos · ${v.storePhotoAssetRefs.length} verified direct uploads`
            : <Empty />}
        </Row>
        {assetPolicyV2Ready && v.importedPhotoAssetRefs.length ? (
          <Row title="Photos imported from external sources" step={1} goTo={goTo}>
            <span className="text-ob-muted">{v.importedPhotoAssetRefs.length} photos · usage rights must be confirmed in the photo step</span>
          </Row>
        ) : null}
        {assetPolicyV2Ready ? (
          <Row title="Photo usage confirmation" step={6} goTo={goTo}>
            {v.generalAssetAttestationId ? "Confirmed" : <span className="text-ob-muted">Not confirmed</span>}
          </Row>
        ) : null}
        {assetPolicyV2Ready && v.personPhotoAssetIds.length ? (
          <Row title="Portrait consent" step={6} goTo={goTo}>
            {v.personPhotoAssetIds.length} asset-level confirmation{v.personPhotoAssetIds.length === 1 ? '' : 's'}
          </Row>
        ) : null}
        {assetPolicyV2Ready && v.nonPersonPhotoAssetIds.length ? (
          <Row title="Photos without identifiable people" step={6} goTo={goTo}>
            {v.nonPersonPhotoAssetIds.length} photos
          </Row>
        ) : null}
        <Row title={assetPolicyV2Ready ? "Image direction" : "Image style"} step={7} goTo={goTo}>
          {assetPolicyV2Ready ? imageDirectionLabel : legacyImageStyleLabel}
        </Row>
        <Row title="Mood and color" step={8} goTo={goTo}>
          <span className="inline-flex items-center gap-2">
            {applied.colorPreference ? (
              <span
                className="inline-block h-4 w-4 rounded-full border border-black/10"
                style={{ backgroundColor: applied.colorPreference }}
              />
            ) : null}
            {moodLabels.length ? moodLabels.join(', ') : applied.colorPreference || <Empty />}
          </span>
        </Row>
        <Row title="Patient audience" step={3} goTo={goTo}>
          {v.targetCustomer || <Empty />}
        </Row>
        <Row title="What Visitors Are Looking For" step={3} goTo={goTo}>
          {v.visitorNeed || <Empty />}
        </Row>
        <Row title="Value proposition" step={3} goTo={goTo}>
          {v.valueProposition || <Empty />}
        </Row>
        <Row title="Visitor goal" step={3} goTo={goTo}>
          {goalLabel ?? <Empty />}
        </Row>
        <Row title="Sourced Trust Factor" step={5} goTo={goTo}>
          {v.proofItems.length
            ? `${v.proofItems.filter((proof) => proof.content.trim()).length} sourced items`
            : v.highlights.length ? v.highlights.join(', ') : <Empty />}
        </Row>
        <Row title="Mood (tone)" step={3} goTo={goTo}>
          {v.tone.length ? v.tone.join(', ') : <Empty />}
        </Row>
      </div>

      <Field
        label={
          <>
            Additional Requests <span className="font-normal text-ob-muted">(select)</span>
          </>
        }
      >
        <textarea
          {...register('extraNotes')}
          rows={3}
          placeholder="Example: Main menu at the top, reservation button prominently"
          className={cn(obInput, 'resize-none')}
        />
      </Field>
    </div>
  );
}
