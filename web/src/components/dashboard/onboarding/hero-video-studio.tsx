'use client';

/**
 * [motion 4단계 — V3] AI 영상 히어로 스튜디오 (Premium, 온보딩 성공화면).
 * fast 시안 2안 생성 → 고객이 픽 → 선택안을 draftConfig 히어로 background.video로 적용.
 * 실패·상한·킬스위치는 안내로 폴백(사이트는 ken-burns로 항상 완성). "둘 다 별로"면 재생성(상한 내).
 */
import { useState } from 'react';
import { Clapperboard, Check, RefreshCw, Sparkles, AlertTriangle } from 'lucide-react';
import {
  applyHeroVideoDraft,
  generateHeroVideoDrafts,
  type HeroVideoDraftDto,
} from '../api';
import { heroVideoPhotoHint } from '@/lib/onboarding/hero-video-process';
import { Button } from '../ui';

type Phase = 'idle' | 'generating' | 'ready' | 'applying' | 'applied' | 'error';

/** API에는 등록 무드 분류에 필요한 tone과 짧은 원격/경로 출처 표식만 보낸다. */
export function buildHeroVideoDraftBody(tone: readonly string[], heroPhotoUrl?: string) {
  const normalizedTone = tone
    .map((value) => value.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 2);
  const remoteOrPath = heroVideoPhotoHint(heroPhotoUrl);
  return {
    count: 2 as const,
    ...(normalizedTone.length ? { tone: normalizedTone } : {}),
    ...(remoteOrPath ? { heroPhotoUrl: remoteOrPath } : {}),
  };
}

export function HeroVideoStudio({
  siteId,
  tone,
  heroPhotoUrl,
}: {
  siteId: string;
  tone: readonly string[];
  heroPhotoUrl?: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [drafts, setDrafts] = useState<HeroVideoDraftDto[]>([]);
  const [error, setError] = useState('');

  async function generate() {
    setPhase('generating');
    setError('');
    try {
      const nextDrafts = await generateHeroVideoDrafts(
        siteId,
        buildHeroVideoDraftBody(tone, heroPhotoUrl),
      );
      setDrafts(nextDrafts);
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : '영상 시안 생성에 실패했습니다.');
      setPhase('error');
    }
  }

  async function pick(d: HeroVideoDraftDto) {
    setPhase('applying');
    try {
      await applyHeroVideoDraft(siteId, d);
      setPhase('applied');
    } catch (e) {
      setError(e instanceof Error ? e.message : '영상 적용에 실패했습니다.');
      setPhase('error');
    }
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-ob-accent-strong/30 bg-ob-accent-soft p-4 text-left">
      <div className="mb-1 flex items-center gap-1.5">
        <Clapperboard className="h-4 w-4 text-ob-accent-strong" />
        <span className="text-sm font-semibold text-ob-accent-strong">AI 영상 히어로</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-ob-accent-strong/80">Premium</span>
      </div>

      {phase === 'idle' && (
        <>
          <p className="text-xs leading-5 text-ob-muted">
            {heroPhotoUrl
              ? '올린 대표 사진의 피사체를 그대로 보존하고, 은은한 카메라·빛의 움직임만 더한 시안 2개를 만들어요.'
              : '대표 사진이 없어 선택한 무드에 맞춘 AI 공간·빛·질감 연출로 시안 2개를 만들어요. 특정 제품이나 시술 결과는 만들지 않아요.'}{' '}
            마음에 드는 시안을 고르면 바로 적용됩니다.
            (영상이 없어도 사이트는 이미 완성 상태예요 — 느린 줌 이미지로 표시됩니다.)
          </p>
          <Button className="mt-3" onClick={generate}>
            <Sparkles className="h-4 w-4" />
            영상 시안 만들기
          </Button>
        </>
      )}

      {phase === 'generating' && (
        <div className="flex items-center gap-2 py-3 text-xs text-ob-muted">
          <RefreshCw className="h-4 w-4 animate-spin text-ob-accent-strong" />
          영상을 만들고 있어요 — 1~2분 걸릴 수 있어요. 창을 닫지 말아 주세요.
        </div>
      )}

      {phase === 'ready' && (
        <>
          <p className="mb-2 text-xs text-ob-muted">두 시안 중 하나를 고르세요.</p>
          <div className="grid grid-cols-2 gap-2">
            {drafts.map((d, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-ob-border">
                <video
                  src={d.videoUrl}
                  poster={d.posterUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  className="aspect-video w-full bg-black object-cover"
                />
                <button
                  type="button"
                  onClick={() => pick(d)}
                  className="flex h-8 w-full items-center justify-center gap-1 bg-ob-accent text-[11px] font-semibold text-ob-ink transition-colors hover:bg-ob-accent-strong hover:text-white"
                >
                  <Check className="h-3.5 w-3.5" /> 이 영상 사용
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-2" onClick={generate}>
            <RefreshCw className="h-4 w-4" />
            둘 다 별로예요 — 다시 생성
          </Button>
        </>
      )}

      {phase === 'applying' && (
        <div className="flex items-center gap-2 py-3 text-xs text-ob-muted">
          <RefreshCw className="h-4 w-4 animate-spin text-ob-accent-strong" /> 적용 중…
        </div>
      )}

      {phase === 'applied' && (
        <div className="flex items-center gap-2 py-2 text-xs text-ob-success">
          <Check className="h-4 w-4" /> 영상 히어로가 적용됐어요. 에디터·발행에서 확인하세요.
        </div>
      )}

      {phase === 'error' && (
        <>
          <p className="flex items-start gap-1.5 py-1 text-xs leading-5 text-ob-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ob-danger" />
            {error} 사이트는 그대로 완성 상태(느린 줌 이미지)이니 걱정 마세요.
          </p>
          <Button variant="secondary" className="mt-2" onClick={generate}>
            <RefreshCw className="h-4 w-4" /> 다시 시도
          </Button>
        </>
      )}
    </div>
  );
}
