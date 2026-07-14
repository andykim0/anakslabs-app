'use client';

/**
 * [W2/W3] 고른 히어로 사진을 대표 CSS 모션으로 보여준 뒤 영상 애드온과 연출을 고른다.
 * 이 단계는 대표 예시일 뿐 고객의 최종 Veo 영상이 아니다. AI/API 호출 없이 CSS만 사용한다.
 * 아니오는 ken-burns 기본 모션으로 바로 진행하고, 예는 등록된 영상 연출 선택으로 이어진다.
 */
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Film, ImageIcon } from 'lucide-react';
import type { SitePurposeId, Tier } from '@/lib/types/domain';
import { hasVideoAddon, VIDEO_ADDON_PRICE_KRW } from '@/lib/services/entitlements';
import { videoConceptsForGroup } from '@/lib/motion/video-concepts';
import {
  HERO_VIDEO_MOTION_IDS,
  HERO_VIDEO_MOTIONS,
  isHeroVideoMotionId,
  type HeroVideoMotionId,
} from '@/lib/motion/hero-video-motions';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import type { MotionChoiceDto } from '../api';
import { Button, Card, cn } from '../ui';

/** W2 대표 미리보기. mcs- 프리픽스로 렌더러 런타임과 격리한다. */
const PREVIEW_CSS = `
@keyframes mcs-preview-camera {
  0% { transform: scale(1.02) translate3d(-0.6%, 0.3%, 0); }
  50% { transform: scale(1.075) translate3d(0.7%, -0.7%, 0); }
  100% { transform: scale(1.035) translate3d(0.2%, 0.4%, 0); }
}
@keyframes mcs-preview-light {
  0%, 15% { transform: translate3d(-120%, 0, 0); opacity: 0; }
  38% { opacity: .32; }
  65%, 100% { transform: translate3d(140%, 0, 0); opacity: 0; }
}
@keyframes hvm-scrub {
  0% { transform: scale(1.02) translate3d(-2%, 0, 0); }
  50% { transform: scale(1.09) translate3d(1%, -1%, 0); }
  100% { transform: scale(1.04) translate3d(0, 0, 0); }
}
@keyframes hvm-boomerang {
  from { transform: scale(1.06) translate3d(-2.5%, 0, 0); }
  to { transform: scale(1.06) translate3d(2.5%, -1%, 0); }
}
@keyframes hvm-zoom {
  from { transform: scale(1.01); }
  to { transform: scale(1.13); }
}
@keyframes hvm-parallax {
  from { transform: scale(1.08) translate3d(-1.5%, 1.5%, 0); }
  to { transform: scale(1.08) translate3d(1.5%, -1.5%, 0); }
}
@keyframes hvm-depth-orbit {
  from { transform: translate3d(-8%, 5%, 0); }
  to { transform: translate3d(9%, -6%, 0); }
}
.mcs-preview-image {
  animation: mcs-preview-camera 8s cubic-bezier(.4, 0, .2, 1) infinite alternate;
  will-change: transform;
}
.mcs-preview-light {
  animation: mcs-preview-light 6.5s ease-in-out infinite;
}
.hvm-preview-scrub { animation: hvm-scrub 5.5s cubic-bezier(.45, 0, .2, 1) infinite alternate; }
.hvm-preview-boomerang { animation: hvm-boomerang 3.8s ease-in-out infinite alternate; }
.hvm-preview-zoom { animation: hvm-zoom 7s ease-in-out infinite alternate; }
.hvm-preview-parallax { animation: hvm-parallax 6s ease-in-out infinite alternate; }
.hvm-depth-orbit { animation: hvm-depth-orbit 4.5s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) {
  .mcs-preview-image, .mcs-preview-light,
  .hvm-preview-scrub, .hvm-preview-boomerang, .hvm-preview-zoom,
  .hvm-preview-parallax, .hvm-depth-orbit { animation: none; transform: none; }
  .mcs-preview-light { display: none; }
}
`;

function HeroMotionDemo({
  motionId,
  heroImageUrl,
}: {
  motionId: HeroVideoMotionId;
  heroImageUrl: string;
}) {
  const motion = HERO_VIDEO_MOTIONS[motionId];
  return (
    <div className="relative aspect-video overflow-hidden bg-ob-bg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroImageUrl}
        alt=""
        className={cn('h-full w-full object-cover will-change-transform', motion.previewClass)}
      />
      {motionId === 'cinematic-scrub' ? (
        <span className="absolute inset-x-3 bottom-3 h-0.5 overflow-hidden rounded bg-white/35">
          <span className="block h-full w-2/3 bg-white/90" />
        </span>
      ) : null}
      {motionId === 'parallax-depth' ? (
        <span
          aria-hidden="true"
          className="hvm-depth-orbit absolute top-3 right-4 h-12 w-12 rounded-full border border-white/40 bg-white/15 blur-[1px]"
        />
      ) : null}
      <span className="absolute bottom-2 left-2 rounded-full border border-white/25 bg-black/55 px-2 py-0.5 text-[9px] font-semibold text-white">
        대표 예시
      </span>
    </div>
  );
}

/** W2 스킵과 W3 연출 선택을 영상 요청 경로로 접는 순수 계약. */
export function motionChoiceForVideoPreference(
  wantsVideo: boolean,
  activeConceptId: string,
  heroMotionId?: HeroVideoMotionId,
): MotionChoiceDto {
  return wantsVideo
    ? {
        heroTechnique: 'video-hero',
        intensity: 'normal',
        videoConceptId: activeConceptId,
        ...(heroMotionId ? { heroMotionId } : {}),
      }
    : { heroTechnique: 'ken-burns', intensity: 'subtle' };
}

export function MotionChoiceStep({
  tier,
  purposeId,
  heroImageUrl,
  heroPhotoUrl,
  initial,
  onBack,
  onComplete,
}: {
  tier: Tier;
  purposeId: SitePurposeId;
  /** W1에서 고른 최종 히어로 소스. 업로드·AI 무드 모두 동일하게 미리보기한다. */
  heroImageUrl: string;
  /** 고객이 직접 올린 실제 히어로 사진. 있으면 영상은 원본 보존 모션만 사용한다. */
  heroPhotoUrl?: string;
  /** 뒤로 왔다가 다시 진입 시 이전 선택 복원. */
  initial?: MotionChoiceDto;
  onBack: () => void;
  onComplete: (choice: MotionChoiceDto) => void;
}) {
  const ownsAddon = hasVideoAddon(tier);
  const addonPrice = `+₩${VIDEO_ADDON_PRICE_KRW.toLocaleString('ko-KR')}`;
  const concepts = videoConceptsForGroup(findPurpose(purposeId)?.group ?? 'serve');
  const [wantsVideo, setWantsVideo] = useState(initial?.heroTechnique === 'video-hero');
  const activeConceptId =
    initial?.videoConceptId && concepts.some((concept) => concept.id === initial.videoConceptId)
      ? initial.videoConceptId
      : concepts[0].id;
  const [heroMotionId, setHeroMotionId] = useState<HeroVideoMotionId>(() =>
    isHeroVideoMotionId(initial?.heroMotionId) ? initial.heroMotionId : HERO_VIDEO_MOTION_IDS[0],
  );

  const submit = () => {
    onComplete(motionChoiceForVideoPreference(wantsVideo, activeConceptId, heroMotionId));
  };

  return (
    <Card className="space-y-5 border-ob-border bg-ob-surface p-6">
      <style>{PREVIEW_CSS}</style>

      <div>
        <h2 className="text-lg font-semibold text-ob-ink">이 사진이 움직이면 어떤 느낌일까요?</h2>
        <p className="mt-1 text-sm leading-6 text-ob-muted">
          고른 사진에 대표 모션을 얹어 느낌만 미리 보여드려요.
        </p>
      </div>

      <div className="overflow-hidden rounded-ob border border-ob-border bg-ob-bg">
        <div className="relative aspect-video overflow-hidden bg-ob-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImageUrl}
            alt="선택한 히어로 사진 모션 예시"
            className="mcs-preview-image h-full w-full object-cover"
          />
          <span
            aria-hidden="true"
            className="mcs-preview-light absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-14deg] bg-gradient-to-r from-transparent via-white/50 to-transparent blur-xl"
          />
          <span className="absolute top-3 left-3 rounded-full border border-white/30 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            이런 느낌으로 움직여요 · 대표 예시
          </span>
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-12 pb-4 text-xs leading-5 text-white">
            예시 움직임이에요. 결제하시면 이 사진으로 실제 영상을 만들어드려요.
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ob-ink">영상 배경으로 만들까요?</h3>
            <p className="mt-0.5 text-xs leading-5 text-ob-muted">
              {ownsAddon
                ? '승인된 영상 애드온으로 사이트 생성 후 실제 영상을 만들 수 있어요.'
                : `원하실 때만 추가하는 ${addonPrice} 애드온이에요.`}
            </p>
          </div>
          <span className="rounded-full border border-ob-accent bg-ob-accent-soft px-2.5 py-1 text-[10px] font-semibold text-ob-accent-strong">
            {ownsAddon ? '애드온 승인됨' : addonPrice}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={!wantsVideo}
            onClick={() => setWantsVideo(false)}
            className={cn(
              'rounded-ob border p-4 text-left transition-all',
              !wantsVideo
                ? 'border-ob-accent-strong bg-ob-accent-soft ring-1 ring-ob-accent'
                : 'border-ob-border hover:border-ob-muted',
            )}
          >
            <ImageIcon className="h-5 w-5 text-ob-accent-strong" />
            <span className="mt-2 block text-sm font-semibold text-ob-ink">아니오, 사진으로 할게요</span>
            <span className="mt-1 block text-xs leading-5 text-ob-muted">
              정지 사진에 잔잔한 켄번스·리빌 효과만 적용해요. 영상 생성은 없어요.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={wantsVideo}
            onClick={() => setWantsVideo(true)}
            className={cn(
              'rounded-ob border p-4 text-left transition-all',
              wantsVideo
                ? 'border-ob-accent-strong bg-ob-accent-soft ring-1 ring-ob-accent'
                : 'border-ob-border hover:border-ob-muted',
            )}
          >
            <Film className="h-5 w-5 text-ob-accent-strong" />
            <span className="mt-2 block text-sm font-semibold text-ob-ink">
              {ownsAddon ? '예, 영상으로 만들게요' : `예, 영상으로 만들게요 (${addonPrice})`}
            </span>
            <span className="mt-1 block text-xs leading-5 text-ob-muted">
              다음에서 원하는 연출을 고릅니다. 실제 Veo 생성은 애드온 승인 후에만 진행돼요.
            </span>
          </button>
        </div>
      </div>

      {wantsVideo ? (
        <div className="space-y-3 border-t border-ob-border pt-5">
          <div className="flex items-center gap-3 rounded-ob border border-ob-accent bg-ob-accent-soft p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImageUrl}
              alt="영상 소스로 선택한 히어로 사진"
              className="h-14 w-20 shrink-0 rounded-ob border border-ob-border bg-ob-surface object-cover"
            />
            {heroPhotoUrl ? (
              <p className="text-xs leading-5 text-ob-ink">
                <span className="font-semibold">이 대표 사진을 그대로 살려요.</span>{' '}
                피사체는 바꾸지 않고 은은한 카메라와 빛의 움직임만 더합니다.
              </p>
            ) : (
              <p className="text-xs leading-5 text-ob-ink">
                <span className="font-semibold">선택한 무드에 맞춘 AI 공간·빛 연출</span>로 만들어요.
                특정 메뉴·제품·시술 결과를 지어내지 않고 분위기와 질감만 움직입니다.
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ob-ink">원하는 영상 연출을 하나 골라주세요</h3>
            <p className="mt-1 text-xs leading-5 text-ob-muted">
              아래는 선택한 사진으로 보여드리는 CSS 대표 예시예요. 고객님의 최종 영상 미리보기가 아닙니다.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {HERO_VIDEO_MOTION_IDS.map((motionId) => {
              const motion = HERO_VIDEO_MOTIONS[motionId];
              const selected = heroMotionId === motionId;
              return (
                <button
                  key={motionId}
                  type="button"
                  onClick={() => setHeroMotionId(motionId)}
                  aria-pressed={selected}
                  className={cn(
                    'overflow-hidden rounded-ob border bg-ob-surface text-left transition-all',
                    selected
                      ? 'border-ob-accent-strong ring-1 ring-ob-accent'
                      : 'border-ob-border hover:border-ob-muted',
                  )}
                >
                  <HeroMotionDemo motionId={motionId} heroImageUrl={heroImageUrl} />
                  <span className="block p-3">
                    <span className="block text-xs font-semibold text-ob-ink">{motion.label}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-ob-muted">{motion.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-ob border border-ob-border bg-ob-bg px-4 py-3 text-xs leading-5 text-ob-muted">
          선택한 히어로 사진을 그대로 쓰고, 완성 페이지에는 가벼운 기본 모션만 더합니다.
        </div>
      )}

      <div className="flex items-center justify-between border-t border-ob-border pt-5">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          이전
        </Button>
        <Button size="lg" onClick={submit}>
          {wantsVideo ? '이 방향으로 계속' : '영상 없이 계속'}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
