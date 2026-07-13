'use client';

/**
 * [Q7] 온보딩 2단계 — "움직임 고르기": 첫 화면(히어로) 모션 선택.
 * 선택지는 레지스트리(heroChoicesForTier)에 열거된 id뿐 — 자유 텍스트 없음.
 * 카드 안 미니 데모는 이 파일 로컬 keyframes(순수 CSS)로 무한 반복 — 렌더러 런타임 import 없음(비용 0).
 * 서버 sanitize가 미등록·티어 초과를 강등하므로 UI는 티어별 노출만 정확하면 된다.
 * 영상 컨셉 화면은 생성 트리거가 아니다(Veo 미호출) — 선택된 conceptId만 전달.
 */
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import type { SitePurposeId, Tier } from '@/lib/types/domain';
import { ALL_HERO_CHOICES } from '@/lib/motion/hero-choice';
import { hasVideoAddon, VIDEO_ADDON_PRICE_KRW } from '@/lib/services/entitlements';
import { videoConceptsForGroup } from '@/lib/motion/video-concepts';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import type { MotionChoiceDto } from '../api';
import { Button, Card, cn } from '../ui';

/**
 * 라이브 미니 데모 CSS — 전부 이 스텝 로컬(mcs- 프리픽스, 전역 충돌 방지).
 * prefers-reduced-motion: reduce 에서는 모든 데모 정지(정적 표시).
 */
const DEMO_CSS = `
@keyframes mcs-kenburns {
  from { transform: scale(1); }
  to { transform: scale(1.08); }
}
@keyframes mcs-mask {
  0% { clip-path: inset(0 100% 0 0); }
  60% { clip-path: inset(0 0 0 0); }
  100% { clip-path: inset(0 0 0 0); }
}
@keyframes mcs-pan {
  from { background-position: 0% 50%; }
  to { background-position: 100% 50%; }
}
.mcs-demo-kenburns {
  background: linear-gradient(135deg, var(--color-ob-accent-soft) 0%, var(--color-ob-accent) 55%, var(--color-ob-accent-strong) 100%);
  animation: mcs-kenburns 6s ease-in-out infinite alternate;
}
.mcs-demo-mask {
  background: linear-gradient(135deg, var(--color-ob-accent) 0%, var(--color-ob-accent-strong) 100%);
  animation: mcs-mask 2.5s ease-in-out infinite;
}
.mcs-demo-pan {
  background: linear-gradient(100deg, var(--color-ob-accent-soft) 0%, var(--color-ob-accent) 40%, var(--color-ob-accent-strong) 70%, var(--color-ob-accent) 100%);
  background-size: 220% 100%;
  animation: mcs-pan 7s ease-in-out infinite alternate;
}
@media (prefers-reduced-motion: reduce) {
  .mcs-demo-kenburns, .mcs-demo-mask, .mcs-demo-pan { animation: none; }
  .mcs-demo-mask { clip-path: none; }
}
`;

/** 히어로 선택지 카드 안 라이브 데모 — 정적 썸네일 없이 실제 움직임을 그대로 반복 */
function MotionDemo({ id }: { id: string }) {
  if (id === 'ken-burns') {
    return (
      <div className="h-full w-full overflow-hidden">
        <div className="mcs-demo-kenburns h-full w-full" />
      </div>
    );
  }
  if (id === 'mask-reveal') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ob-bg p-3">
        <div className="mcs-demo-mask h-full w-full rounded-md" />
      </div>
    );
  }
  if (id === 'video-hero') {
    return (
      <div className="relative h-full w-full">
        <div className="mcs-demo-pan h-full w-full" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-ob-accent-strong shadow-sm">
            <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
          </span>
        </span>
      </div>
    );
  }
  // none(및 미지 id 폴백) — 정적 박스 + 미니 라벨
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ob-bg to-ob-accent-soft">
      <span className="rounded-full border border-ob-border bg-ob-surface px-2.5 py-1 text-[10px] text-ob-muted">
        움직임 없음
      </span>
    </div>
  );
}

const INTENSITY_OPTIONS = [
  { value: 'subtle', label: '잔잔하게', hint: '움직임을 아주 은은하게만 써요' },
  { value: 'normal', label: '보통', hint: '기본 추천 — 자연스러운 정도로 움직여요' },
] as const;

/** 영상 컨셉 카드용 이모지 (레지스트리 id → 이모지, 미지 id는 🎬) */
const CONCEPT_EMOJI: Record<string, string> = {
  'space-mood': '🕯️',
  'signature-closeup': '🍽️',
  'street-time': '🌆',
  'product-closeup': '📦',
  'unboxing-detail': '🤲',
  'lifestyle-cut': '☕',
  'people-at-work': '💼',
  'office-mood': '🏢',
  'city-flow': '🌃',
  'learning-moment': '📖',
  'hands-craft': '✍️',
  'community-space': '🤝',
};

export function MotionChoiceStep({
  tier,
  purposeId,
  initial,
  onBack,
  onComplete,
}: {
  tier: Tier;
  purposeId: SitePurposeId;
  /** 뒤로 왔다가 다시 진입 시 이전 선택 복원 */
  initial?: MotionChoiceDto;
  onBack: () => void;
  onComplete: (choice: MotionChoiceDto) => void;
}) {
  // [U2] 영상 애드온을 누구에게나 노출(단일 제품 + 유료 애드온). 능력 게이팅은 서버(sanitize·생성)가 담당.
  const choices = ALL_HERO_CHOICES;
  const ownsAddon = hasVideoAddon(tier);
  const addonPrice = `+₩${VIDEO_ADDON_PRICE_KRW.toLocaleString('ko-KR')}`;
  // [H3] 두 묶음으로 분리 — ① 기본 움직임(무료 스크롤 효과) vs ② 영상 배경(AI 영상 애드온)
  const basicChoices = choices.filter((c) => c.id !== 'video-hero');
  const videoChoice = choices.find((c) => c.id === 'video-hero');
  const concepts = videoConceptsForGroup(findPurpose(purposeId)?.group ?? 'serve');

  const [hero, setHero] = useState<string>(() =>
    initial?.heroTechnique && choices.some((c) => c.id === initial.heroTechnique)
      ? initial.heroTechnique
      : choices[0].id,
  );
  const [intensity, setIntensity] = useState<'subtle' | 'normal'>(initial?.intensity ?? 'normal');
  const [conceptId, setConceptId] = useState<string | undefined>(initial?.videoConceptId);

  // [U2] 영상 방향 선택은 애드온 보유와 무관하게 노출(요청 표식만 남김 — 실제 Veo는 애드온 승인 후).
  const showConcepts = hero === 'video-hero';
  // 복원값이 현 목적 그룹에 없으면 첫 컨셉으로 폴백 — "다음"이 항상 완결된 선택을 반환
  const activeConceptId =
    conceptId && concepts.some((c) => c.id === conceptId) ? conceptId : concepts[0].id;

  const submit = () => {
    onComplete({
      heroTechnique: hero,
      intensity,
      videoConceptId: showConcepts ? activeConceptId : undefined,
    });
  };

  // [H3] 선택 카드 렌더 — 기본/영상 두 묶음이 공유. 영상 카드는 데모에 '영상 예시' 라벨(스크롤 효과와 구분).
  const renderHeroChoice = (choice: (typeof ALL_HERO_CHOICES)[number]) => {
    const selected = hero === choice.id;
    const isVideo = choice.id === 'video-hero';
    return (
      <button
        key={choice.id}
        type="button"
        onClick={() => setHero(choice.id)}
        aria-pressed={selected}
        className={cn(
          'overflow-hidden rounded-ob border bg-ob-surface text-left transition-all',
          selected ? 'border-ob-accent-strong ring-1 ring-ob-accent' : 'border-ob-border hover:border-ob-muted',
        )}
      >
        <div className="relative h-24 overflow-hidden">
          <MotionDemo id={choice.id} />
          {isVideo ? (
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
              영상 예시
            </span>
          ) : null}
          {selected ? (
            <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ob-accent-strong text-xs font-bold text-white">
              ✓
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className={cn('text-sm font-semibold', selected ? 'text-ob-accent-strong' : 'text-ob-ink')}>
              {choice.label}
            </p>
            {isVideo ? (
              <span className="shrink-0 rounded-full border border-ob-accent bg-ob-accent-soft px-2 py-0.5 text-[10px] font-semibold text-ob-accent-strong">
                {ownsAddon ? '애드온 포함' : addonPrice}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-ob-muted">{choice.description}</p>
        </div>
      </button>
    );
  };

  return (
    <Card className="space-y-5 border-ob-border bg-ob-surface p-6">
      <style>{DEMO_CSS}</style>

      <div>
        <h2 className="text-lg font-semibold text-ob-ink">첫 화면이 어떻게 움직이면 좋을까요?</h2>
        <p className="mt-1 text-sm text-ob-muted">이 선택은 사이트의 첫인상(메인 화면 움직임)에 쓰여요.</p>
      </div>

      {/* [H3] ① 기본 움직임(무료 포함) — 스크롤 CSS 효과. 카드 안에서 실제 움직임이 반복 재생 */}
      <div className="space-y-2.5">
        <div>
          <h3 className="text-sm font-semibold text-ob-ink">
            기본 움직임 <span className="font-normal text-ob-muted">· 무료 포함</span>
          </h3>
          <p className="text-xs leading-5 text-ob-muted">스크롤할 때 사진·글이 부드럽게 나타나는 효과예요.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {basicChoices.map((choice) => renderHeroChoice(choice))}
        </div>
      </div>

      {/* [H3] ② 영상 배경(애드온) — 사진 대신 짧은 AI 영상(Veo). 스크롤 효과와 다른 실제 영상 */}
      {videoChoice ? (
        <div className="space-y-2.5 border-t border-ob-border pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ob-ink">영상 배경</h3>
            <span className="rounded-full border border-ob-accent bg-ob-accent-soft px-2 py-0.5 text-[10px] font-semibold text-ob-accent-strong">
              {ownsAddon ? '애드온 포함' : `애드온 ${addonPrice}`}
            </span>
          </div>
          <p className="text-xs leading-5 text-ob-muted">
            사진 대신 짧은 <span className="font-semibold text-ob-ink">AI 영상</span>이 배경으로 흐릅니다(Veo로 제작).
            스크롤 효과가 아니라 실제로 움직이는 영상이에요.{ownsAddon ? '' : ' 원하실 때만 — 결제 후 제작에 반영돼요.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">{renderHeroChoice(videoChoice)}</div>
        </div>
      ) : null}

      {/* 움직임 세기 */}
      <div>
        <span className="mb-1.5 block text-[11px] text-ob-muted">움직임 세기</span>
        <div className="grid grid-cols-2 gap-2">
          {INTENSITY_OPTIONS.map((o) => {
            const selected = intensity === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setIntensity(o.value)}
                aria-pressed={selected}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-ob-accent-strong bg-ob-accent-soft' : 'border-ob-border hover:border-ob-muted',
                )}
              >
                <span className={cn('block text-xs font-medium', selected ? 'text-ob-accent-strong' : 'text-ob-ink')}>
                  {o.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-ob-muted">{o.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Premium × 영상 히어로 — 영상 컨셉 (여기서 영상을 만들지는 않음) */}
      {showConcepts ? (
        <div className="space-y-3 border-t border-ob-border pt-5">
          <div>
            <h3 className="text-sm font-semibold text-ob-ink">메인 화면에 어떤 영상이 흐르면 좋을까요?</h3>
            <p className="mt-1 text-xs leading-5 text-ob-muted">
              {ownsAddon
                ? '영상은 사이트 생성 후 스튜디오에서 만들어요 — 지금은 방향만 골라두면 돼요.'
                : '영상은 애드온 결제 후 제작에 반영돼요 — 지금은 방향만 골라두면 됩니다. 그 전까지는 정적 히어로로 보여드려요.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {concepts.map((c) => {
              const selected = activeConceptId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setConceptId(c.id)}
                  aria-pressed={selected}
                  className={cn(
                    'rounded-ob border p-4 text-left transition-all',
                    selected
                      ? 'border-ob-accent-strong bg-ob-accent-soft ring-1 ring-ob-accent'
                      : 'border-ob-border hover:border-ob-muted',
                  )}
                >
                  <span className="text-xl" aria-hidden>
                    {CONCEPT_EMOJI[c.id] ?? '🎬'}
                  </span>
                  <span className={cn('mt-2 block text-xs font-semibold', selected ? 'text-ob-accent-strong' : 'text-ob-ink')}>
                    {c.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-ob-muted">{c.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-ob-border pt-5">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          이전
        </Button>
        <Button size="lg" onClick={submit}>
          다음
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
