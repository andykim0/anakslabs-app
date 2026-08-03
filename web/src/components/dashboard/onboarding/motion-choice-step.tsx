'use client';

/**
 * 모션 선택은 세 축을 섞지 않는다.
 * 1) 가벼운 기본 모션은 자동, 2) 페이지 시그니처는 실제 renderer로 체험,
 * 3) AI 영상은 지원 시그니처에서만 별도 애드온 의사를 기록한다.
 */
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Expand, Film, Gauge, ImageIcon, MonitorPlay, Smartphone } from 'lucide-react';
import type { DesignCandidate, SitePurposeId, SurveyInput, Tier } from '@/lib/types/domain';
import type { ProductionMotionSignatureId } from '@/lib/types/site';
import { hasVideoAddon } from '@/lib/services/entitlements';
import {
  MOTION_SIGNATURES,
  isProductionMotionSignatureId,
  motionContextFromSurvey,
  motionSignaturesForContext,
  type MotionSignatureSpec,
} from '@/lib/motion/signatures';
import { buildMotionSignaturePreviewConfig } from '@/lib/motion/preview-config';
import { trackMotionUpsellFunnelEvent } from '@/lib/analytics/motion-upsell-funnel';
import type { HeroVideoMotionId } from '@/lib/motion/hero-video-motions';
import type { MotionChoiceDto } from '../api';
import { SitePreview } from '../site-preview';
import { Button, Card, cn } from '../ui';
import { HeroMotionUpsellPreview } from './hero-motion-upsell-preview';

const MotionImmersivePreview = dynamic(
  () => import('./motion-immersive-preview').then((module) => module.MotionImmersivePreview),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[120] grid place-items-center bg-[#07162f]/95 text-sm font-semibold text-white" role="status">
        Preparing an interactive example…
      </div>
    ),
  },
);

/** 기존 W2 호출자를 깨지 않으면서 새 signature 선택을 같은 DTO에 저장한다. */
export function motionChoiceForVideoPreference(
  wantsVideo: boolean,
  activeConceptId: string,
  heroMotionId?: HeroVideoMotionId,
  signatureId?: ProductionMotionSignatureId,
): MotionChoiceDto {
  return wantsVideo
    ? {
        heroTechnique: 'video-hero',
        intensity: 'normal',
        videoConceptId: activeConceptId,
        ...(heroMotionId ? { heroMotionId } : {}),
        ...(signatureId ? { signatureId } : {}),
      }
    : {
        heroTechnique: 'ken-burns',
        intensity: 'subtle',
        ...(signatureId ? { signatureId } : {}),
      };
}

/** 새 업셀은 모션 예시가 기본이다. 돌아온 사용자의 명시적 선택은 그대로 복원한다. */
export function initialVideoPreference(
  supportsVideo: boolean,
  videoRequired: boolean,
  initial?: MotionChoiceDto,
): boolean {
  if (!supportsVideo) return false;
  if (videoRequired) return true;
  if (initial) return initial.videoAddon === true || initial.heroTechnique === 'video-hero';
  return true;
}

function mediaRequirement(spec: MotionSignatureSpec): string {
  switch (spec.mediaCapability) {
    case 'none': return "Works as content without separate images";
    case 'image': return "need actual image";
    case 'image-or-video': return "Operates by image, video selectable";
    case 'video-required': return "Can be published only if there is an AI video website";
    case 'verified-customer-images-only': return "Only 2 photos of the same actual case with confirmed ownership";
  }
}

function compactPreviewHeight(spec: MotionSignatureSpec): number {
  return spec.target === 'page' ? 210 : 180;
}

export function MotionChoiceStep({
  tier,
  survey,
  candidate,
  heroImageUrl,
  heroPhotoUrl,
  initial,
  onBack,
  onComplete,
}: {
  tier: Tier;
  purposeId: SitePurposeId;
  templateId: string;
  survey: SurveyInput;
  /** 고객이 바로 앞 단계에서 고른 팔레트·타이포를 production preview에 그대로 사용한다. */
  candidate: DesignCandidate;
  heroImageUrl: string;
  heroPhotoUrl?: string;
  initial?: MotionChoiceDto;
  onBack: () => void;
  onComplete: (choice: MotionChoiceDto) => void;
}) {
  const ownsAddon = hasVideoAddon(tier);
  // 결제 전에도 애드온 결과를 체험할 수 있지만 이 context는 화면 projection에만 사용한다.
  const demoContext = useMemo(
    () => motionContextFromSurvey(survey, 'premium', { theme: candidate.theme }),
    [candidate.theme, survey],
  );
  const previewOptions = useMemo(() => {
    const promoted = motionSignaturesForContext(demoContext, { includeCandidates: false });
    return promoted.flatMap((spec) => {
      if (!isProductionMotionSignatureId(spec.id) || spec.id === 'before-after-scrub' || spec.status !== 'active') return [];
      const preview = buildMotionSignaturePreviewConfig(
        survey,
        candidate,
        heroImageUrl,
        spec.id,
        tier,
      );
      return preview.contentFit ? [{ spec: { ...spec, id: spec.id }, preview }] : [];
    });
  }, [candidate, demoContext, heroImageUrl, survey, tier]);

  const initialId = initial?.signatureId;
  const recommendedId = candidate.recommendedMotionSignatureId;
  const defaultId = previewOptions.some(({ spec }) => spec.id === initialId)
    ? initialId
    : previewOptions.some(({ spec }) => spec.id === recommendedId)
      ? recommendedId
      : previewOptions[0]?.spec.id;
  const [signatureId, setSignatureId] = useState<ProductionMotionSignatureId | undefined>(defaultId);
  const [previewingSignatureId, setPreviewingSignatureId] = useState<ProductionMotionSignatureId>();
  const selected = previewOptions.find(({ spec }) => spec.id === signatureId);
  const immersive = previewOptions.find(({ spec }) => spec.id === previewingSignatureId);
  const videoRequired = selected?.spec.mediaCapability === 'video-required';
  const supportsVideo = selected?.spec.mediaCapability === 'video-required' || selected?.spec.mediaCapability === 'image-or-video';
  const [wantsVideo, setWantsVideo] = useState(() => initialVideoPreference(supportsVideo, videoRequired, initial));

  const chooseSignature = (id: ProductionMotionSignatureId) => {
    const next = MOTION_SIGNATURES[id];
    setSignatureId(id);
    if (next.mediaCapability === 'video-required') setWantsVideo(true);
    if (next.mediaCapability === 'none' || next.mediaCapability === 'image' || next.mediaCapability === 'verified-customer-images-only') {
      setWantsVideo(false);
    }
  };

  const submit = () => {
    if (!signatureId) {
      onComplete({ heroTechnique: 'ken-burns', intensity: 'subtle' });
      return;
    }
    const video = Boolean(supportsVideo && wantsVideo);
    const submittedSignatureId = videoRequired && !video ? undefined : signatureId;
    const legacyMotionId: HeroVideoMotionId | undefined = submittedSignatureId === 'scrollytelling-manifesto'
      ? 'scrollytelling-manifesto'
      : submittedSignatureId === 'cinematic-scrub'
        ? 'cinematic-scrub'
        : undefined;
    onComplete(motionChoiceForVideoPreference(video, 'space-mood', legacyMotionId, submittedSignatureId));
  };

  const closeImmersive = useCallback(() => setPreviewingSignatureId(undefined), []);

  const chooseVideoPreference = (next: boolean) => {
    setWantsVideo(next);
    if (!selected) return;
    trackMotionUpsellFunnelEvent({
      action: next ? 'addon_select' : 'addon_decline',
      signatureId: selected.spec.id,
      addonOwned: ownsAddon,
      videoRequired,
    });
  };

  return (
    <Card className="space-y-6 border-ob-border bg-ob-surface p-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ob-border bg-ob-bg px-2.5 py-1 text-[11px] font-semibold text-ob-muted">
          <Gauge className="h-3.5 w-3.5" /> Basic motion included
        </span>
        <h2 className="mt-3 text-xl font-semibold text-ob-ink">Choose a signature motion</h2>
        <p className="mt-1 text-sm leading-6 text-ob-muted">
          Buttons and text receive subtle motion automatically. Here you can choose one signature treatment for the site.
        </p>
      </div>

      {previewOptions.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {previewOptions.map(({ spec, preview }, index) => {
            const active = signatureId === spec.id;
            return (
              <article
                key={spec.id}
                className={cn(
                  'overflow-hidden rounded-ob border bg-ob-surface text-left transition-colors',
                  active ? 'border-ob-accent-strong ring-1 ring-ob-accent' : 'border-ob-border hover:border-ob-muted',
                )}
              >
                <button
                  type="button"
                  onClick={() => setPreviewingSignatureId(spec.id as ProductionMotionSignatureId)}
                  className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ob-accent-strong"
                  aria-label={`Open ${spec.label} full-screen example`}
                >
                <div className="pointer-events-none relative bg-ob-bg">
                  <SitePreview
                    config={preview.config}
                    mode="desktop"
                    maxHeight={compactPreviewHeight(spec)}
                    previewAsAddon={spec.tier === 'premium'}
                  />
                  <span className="absolute top-2 left-2 z-[70] rounded-full border border-white/25 bg-black/65 px-2 py-1 text-[9px] font-semibold text-white">
                    Example · Actual renderer teaser · Click to experience
                  </span>
                </div>
                <span className="block space-y-2 p-3.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ob-ink">{spec.label}</span>
                    {index === 0 ? <span className="text-[10px] font-semibold text-ob-accent-strong">Recommended</span> : null}
                  </span>
                  <span className="block text-xs leading-5 text-ob-muted">{spec.description}</span>
                  <span className="block text-[11px] leading-4 text-ob-muted">
                    Mobile: {spec.mobileFallback}
                  </span>
                  <span className="block text-[11px] font-medium text-ob-ink">{mediaRequirement(spec)}</span>
                </span>
                </button>
                <div className="flex items-center justify-between gap-2 border-t border-ob-border px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={() => setPreviewingSignatureId(spec.id as ProductionMotionSignatureId)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-ob-accent-strong hover:underline"
                  >
                    <Expand className="h-3.5 w-3.5" /> Open preview
                  </button>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseSignature(spec.id as ProductionMotionSignatureId)}
                    className={cn('rounded-full px-3 py-1.5 text-[11px] font-semibold', active ? 'bg-ob-accent-strong text-white' : 'border border-ob-border text-ob-ink hover:border-ob-muted')}
                  >
                    {active ? 'Selected' : 'Choose this motion'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-ob border border-ob-border bg-ob-bg p-5">
          <p className="text-sm font-semibold text-ob-ink">Basic motion is the strongest fit for the available content.</p>
          <p className="mt-1 text-xs leading-5 text-ob-muted">
            We do not duplicate or invent missing cards, photos, or process steps. Additional signatures become available when the source content supports them.
          </p>
        </div>
      )}

      {selected ? (
        <div className="space-y-3 rounded-ob border border-ob-accent bg-ob-accent-soft p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ob-ink">
                <MonitorPlay className="h-4 w-4 text-ob-accent-strong" /> {selected.spec.label} scroll preview
              </h3>
              <p className="mt-1 text-xs leading-5 text-ob-muted">
                This uses the same scene contract and runtime as the published version, with your selected colors, fonts, and content.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-ob-surface px-2.5 py-1 text-[10px] font-semibold text-ob-ink">
              <Smartphone className="h-3 w-3" /> Mobile uses a vertical fallback
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPreviewingSignatureId(selected.spec.id as ProductionMotionSignatureId)}
            className="flex w-full items-center justify-between gap-4 rounded-ob border border-ob-border bg-ob-surface p-4 text-left transition-colors hover:border-ob-accent-strong"
          >
            <span>
              <span className="block text-sm font-semibold text-ob-ink">Experience the scroll behavior full screen</span>
              <span className="mt-1 block text-xs leading-5 text-ob-muted">
                Review entry, transitions, and completion using the actual renderer.
              </span>
            </span>
            <Expand className="h-5 w-5 shrink-0 text-ob-accent-strong" />
          </button>
          {selected.preview.usesRepresentativeMedia ? (
            <p className="text-[10px] leading-4 text-ob-muted">Representative media demonstrates motion only; it is not your final asset.</p>
          ) : null}
        </div>
      ) : null}

      {selected && supportsVideo ? (
        <div className="space-y-3 border-t border-ob-border pt-5">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-ob-ink">See how the selected image moves</h3>
            <p className="mt-1 text-xs leading-5 text-ob-muted">
              This is a preview. After final design approval, one video generation may use the approved source image.
            </p>
          </div>
          <HeroMotionUpsellPreview
            heroImageUrl={heroImageUrl}
            businessName={survey.businessName}
            signatureId={selected.spec.id}
            addonOwned={ownsAddon}
            videoRequired={videoRequired}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ob-ink">Use this treatment on the homepage?</h3>
              <p className="mt-1 text-xs leading-5 text-ob-muted">
                A motion signature is a layout experience; AI video is separate media. Selecting this option does not create media or grant rights.
              </p>
            </div>
            <span className="rounded-full border border-ob-accent bg-ob-accent-soft px-2.5 py-1 text-[10px] font-semibold text-ob-accent-strong">
              Included · One generation after final design approval
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={!wantsVideo}
              onClick={() => chooseVideoPreference(false)}
              className={cn('rounded-ob border p-4 text-left', !wantsVideo ? 'border-ob-accent-strong bg-ob-accent-soft' : 'border-ob-border')}
            >
              <ImageIcon className="h-5 w-5 text-ob-accent-strong" />
              <span className="mt-2 block text-sm font-semibold text-ob-ink">Keep the approved image</span>
              <span className="mt-1 block text-xs leading-5 text-ob-muted">Image + basic motion · Included. Uses the approved image with subtle movement.</span>
            </button>
            <button
              type="button"
              aria-pressed={wantsVideo}
              onClick={() => chooseVideoPreference(true)}
              className={cn('rounded-ob border p-4 text-left', wantsVideo ? 'border-ob-accent-strong bg-ob-accent-soft' : 'border-ob-border')}
            >
              <Film className="h-5 w-5 text-ob-accent-strong" />
              <span className="mt-2 block text-sm font-semibold text-ob-ink">AI hero video · Included</span>
              <span className="mt-1 block text-xs leading-5 text-ob-muted">
                {heroPhotoUrl ? 'Preserves the subject of the approved image while adding motion.' : 'Uses the approved mood, light, and space without inventing a product.'}
              </span>
            </button>
          </div>
          <p className="text-[11px] leading-5 text-ob-muted">
            This preview is not the final Anaks Labs AI video. Generation starts once, only after administrator approval and all cost-cap and kill-switch checks pass.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-ob-border pt-5">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" />Back</Button>
        <Button size="lg" onClick={submit}>
          {signatureId ? <><Check className="h-4 w-4" />Continue with this motion</> : <>Continue with basic motion<ArrowRight className="h-4 w-4" /></>}
        </Button>
      </div>

      {immersive ? (
        <MotionImmersivePreview
          config={immersive.preview.config}
          spec={immersive.spec}
          previewAsAddon={immersive.spec.tier === 'premium'}
          usesRepresentativeMedia={immersive.preview.usesRepresentativeMedia}
          selected={signatureId === immersive.spec.id}
          onClose={closeImmersive}
          onConfirm={() => {
            chooseSignature(immersive.spec.id as ProductionMotionSignatureId);
            closeImmersive();
          }}
        />
      ) : null}
    </Card>
  );
}
