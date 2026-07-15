'use client';

/**
 * 모션 선택은 세 축을 섞지 않는다.
 * 1) 가벼운 기본 모션은 자동, 2) 페이지 시그니처는 실제 renderer로 체험,
 * 3) AI 영상은 지원 시그니처에서만 별도 애드온 의사를 기록한다.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Film, Gauge, ImageIcon, MonitorPlay, Smartphone } from 'lucide-react';
import type { DesignCandidate, SitePurposeId, SurveyInput, Tier } from '@/lib/types/domain';
import type { ProductionMotionSignatureId } from '@/lib/types/site';
import { hasVideoAddon } from '@/lib/services/entitlements';
import { PRICING } from '@/lib/pricing';
import {
  MOTION_SIGNATURES,
  isProductionMotionSignatureId,
  motionContextFromSurvey,
  motionSignaturesForContext,
  type MotionSignatureSpec,
} from '@/lib/motion/signatures';
import { buildMotionSignaturePreviewConfig } from '@/lib/motion/preview-config';
import type { HeroVideoMotionId } from '@/lib/motion/hero-video-motions';
import type { MotionChoiceDto } from '../api';
import { SitePreview } from '../site-preview';
import { Button, Card, cn } from '../ui';

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

function mediaRequirement(spec: MotionSignatureSpec): string {
  switch (spec.mediaCapability) {
    case 'none': return '별도 이미지 없이 콘텐츠로 작동';
    case 'image': return '실제 이미지가 필요';
    case 'image-or-video': return '이미지로 작동 · 영상 선택 가능';
    case 'video-required': return 'AI 영상 홈페이지가 있어야 발행 가능';
    case 'verified-customer-images-only': return '소유권이 확인된 같은 실제 사례 사진 2장만';
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
  const defaultId = previewOptions.some(({ spec }) => spec.id === initialId)
    ? initialId
    : previewOptions[0]?.spec.id;
  const [signatureId, setSignatureId] = useState<ProductionMotionSignatureId | undefined>(defaultId);
  const selected = previewOptions.find(({ spec }) => spec.id === signatureId);
  const videoRequired = selected?.spec.mediaCapability === 'video-required';
  const supportsVideo = selected?.spec.mediaCapability === 'video-required' || selected?.spec.mediaCapability === 'image-or-video';
  const [wantsVideo, setWantsVideo] = useState(videoRequired || initial?.videoAddon === true || initial?.heroTechnique === 'video-hero');
  const addonPrice = `+₩${PRICING.videoHeroAddon.toLocaleString('ko-KR')}`;

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
    const video = Boolean(supportsVideo && (videoRequired || wantsVideo));
    const legacyMotionId: HeroVideoMotionId | undefined = signatureId === 'scrollytelling-manifesto'
      ? 'scrollytelling-manifesto'
      : signatureId === 'cinematic-scrub'
        ? 'cinematic-scrub'
        : undefined;
    onComplete(motionChoiceForVideoPreference(video, 'space-mood', legacyMotionId, signatureId));
  };

  return (
    <Card className="space-y-6 border-ob-border bg-ob-surface p-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ob-border bg-ob-bg px-2.5 py-1 text-[11px] font-semibold text-ob-muted">
          <Gauge className="h-3.5 w-3.5" /> 기본 모션 자동 적용
        </span>
        <h2 className="mt-3 text-xl font-semibold text-ob-ink">페이지의 대표 움직임을 골라주세요</h2>
        <p className="mt-1 text-sm leading-6 text-ob-muted">
          버튼·문단의 가벼운 리빌은 자동으로 맞춥니다. 여기서는 사이트 전체에서 딱 한 번 쓰는 대표 연출만 정해요.
        </p>
      </div>

      {previewOptions.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {previewOptions.map(({ spec, preview }, index) => {
            const active = signatureId === spec.id;
            return (
              <button
                key={spec.id}
                type="button"
                aria-pressed={active}
                onClick={() => chooseSignature(spec.id as ProductionMotionSignatureId)}
                className={cn(
                  'overflow-hidden rounded-ob border bg-ob-surface text-left transition-colors',
                  active ? 'border-ob-accent-strong ring-1 ring-ob-accent' : 'border-ob-border hover:border-ob-muted',
                )}
              >
                <div className="pointer-events-none relative bg-ob-bg">
                  <SitePreview
                    config={preview.config}
                    mode="desktop"
                    maxHeight={compactPreviewHeight(spec)}
                    motion
                    previewAsAddon={spec.tier === 'premium'}
                  />
                  <span className="absolute top-2 left-2 z-[70] rounded-full border border-white/25 bg-black/65 px-2 py-1 text-[9px] font-semibold text-white">
                    실제 렌더러 티저
                  </span>
                </div>
                <span className="block space-y-2 p-3.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ob-ink">{spec.label}</span>
                    {index === 0 ? <span className="text-[10px] font-semibold text-ob-accent-strong">추천</span> : null}
                  </span>
                  <span className="block text-xs leading-5 text-ob-muted">{spec.description}</span>
                  <span className="block text-[11px] leading-4 text-ob-muted">
                    모바일: {spec.mobileFallback}
                  </span>
                  <span className="block text-[11px] font-medium text-ob-ink">{mediaRequirement(spec)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-ob border border-ob-border bg-ob-bg p-5">
          <p className="text-sm font-semibold text-ob-ink">현재 콘텐츠에는 기본 모션이 가장 완성도가 높아요</p>
          <p className="mt-1 text-xs leading-5 text-ob-muted">
            부족한 카드·사진·과정을 임의로 복제하지 않습니다. 콘텐츠를 더 넣으면 그에 맞는 시그니처가 열려요.
          </p>
        </div>
      )}

      {selected ? (
        <div className="space-y-3 rounded-ob border border-ob-accent bg-ob-accent-soft p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ob-ink">
                <MonitorPlay className="h-4 w-4 text-ob-accent-strong" /> {selected.spec.label} 실제 스크롤 체험
              </h3>
              <p className="mt-1 text-xs leading-5 text-ob-muted">
                선택하신 색·글꼴·콘텐츠와 발행본의 동일한 scene 계약·런타임을 사용합니다. 안쪽을 직접 스크롤해 보세요.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-ob-surface px-2.5 py-1 text-[10px] font-semibold text-ob-ink">
              <Smartphone className="h-3 w-3" /> 모바일은 세로형으로 자동 전환
            </span>
          </div>
          <div className="relative overflow-hidden rounded-ob border border-ob-border bg-ob-surface">
            <SitePreview
              config={selected.preview.config}
              mode="desktop"
              maxHeight={520}
              scroll
              motion
              previewAsAddon={selected.spec.tier === 'premium'}
            />
            {selected.preview.usesRepresentativeMedia ? (
              <span className="pointer-events-none absolute right-2 bottom-2 z-[70] rounded-full border border-white/25 bg-black/70 px-2.5 py-1 text-[9px] font-semibold text-white">
                움직임 설명용 다보임 대표 영상 · 고객 최종 자산 아님
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {selected && supportsVideo ? (
        <div className="space-y-3 border-t border-ob-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ob-ink">AI 영상 홈페이지를 더할까요?</h3>
              <p className="mt-1 text-xs leading-5 text-ob-muted">
                시그니처는 스크롤·레이아웃 경험이고, AI 영상은 별도 미디어예요. 선택만으로 생성되거나 권한이 부여되지 않습니다.
              </p>
            </div>
            <span className="rounded-full border border-ob-accent bg-ob-accent-soft px-2.5 py-1 text-[10px] font-semibold text-ob-accent-strong">
              {ownsAddon ? '승인됨' : addonPrice}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={videoRequired}
              aria-pressed={!wantsVideo}
              onClick={() => setWantsVideo(false)}
              className={cn('rounded-ob border p-4 text-left', !wantsVideo ? 'border-ob-accent-strong bg-ob-accent-soft' : 'border-ob-border', videoRequired && 'cursor-not-allowed opacity-55')}
            >
              <ImageIcon className="h-5 w-5 text-ob-accent-strong" />
              <span className="mt-2 block text-sm font-semibold text-ob-ink">이미지 + 기본 모션</span>
              <span className="mt-1 block text-xs leading-5 text-ob-muted">포함·무료. 직접 올린 이미지와 가벼운 모션으로 완성해요.</span>
            </button>
            <button
              type="button"
              aria-pressed={wantsVideo}
              onClick={() => setWantsVideo(true)}
              className={cn('rounded-ob border p-4 text-left', wantsVideo ? 'border-ob-accent-strong bg-ob-accent-soft' : 'border-ob-border')}
            >
              <Film className="h-5 w-5 text-ob-accent-strong" />
              <span className="mt-2 block text-sm font-semibold text-ob-ink">AI 영상 홈페이지 {ownsAddon ? '' : addonPrice}</span>
              <span className="mt-1 block text-xs leading-5 text-ob-muted">
                {heroPhotoUrl ? '대표 사진의 피사체를 그대로 보존해 움직입니다.' : '제품을 지어내지 않고 선택한 무드·빛·공간을 움직입니다.'}
              </span>
            </button>
          </div>
          <p className="text-[11px] leading-5 text-ob-muted">
            예시는 최종 Veo 영상이 아닙니다. 실제 생성은 결제·관리자 승인·비용 상한·킬스위치 검사를 모두 통과한 뒤에만 시작됩니다.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-ob-border pt-5">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" />이전</Button>
        <Button size="lg" onClick={submit}>
          {signatureId ? <><Check className="h-4 w-4" />이 움직임으로 계속</> : <>기본 모션으로 계속<ArrowRight className="h-4 w-4" /></>}
        </Button>
      </div>
    </Card>
  );
}
