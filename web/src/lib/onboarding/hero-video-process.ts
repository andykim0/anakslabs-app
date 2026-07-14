/**
 * [W4] 사이트 process 후 승인된 영상 애드온만 기존 hero-video API를 호출한다.
 * 실패는 사이트 생성 실패로 올리지 않고 정지 히어로 폴백으로 접는다.
 */
import type { Tier } from '@/lib/types/domain';
import type { HeroImageChoice, SiteConfig } from '@/lib/types/site';
import { hasVideoAddon } from '@/lib/services/entitlements';

export interface ProcessHeroVideoDraft {
  videoUrl: string;
  posterUrl: string;
  prompt: string;
  model: string;
}

export type HeroVideoProcessResult =
  | { status: 'skipped'; reason: 'not-requested' | 'not-approved' }
  | { status: 'applied' }
  | { status: 'fallback'; reason: 'generation-failed'; message: string };

export interface HeroVideoProcessDependencies {
  generateDrafts: (
    siteId: string,
    input: { count: number; tone: readonly string[]; heroPhotoUrl?: string },
  ) => Promise<ProcessHeroVideoDraft[]>;
  applyDraft: (siteId: string, draft: ProcessHeroVideoDraft) => Promise<void>;
}

export interface HeroVideoResumePlan {
  requested: boolean;
  applied: boolean;
  canResume: boolean;
  heroImageChoice?: HeroImageChoice;
  heroPhotoUrl?: string;
}

/** 관리자 승인 뒤 다시 들어온 사이트 상세 화면이 기존 요청을 안전하게 이어갈 수 있는지 판정한다. */
export function heroVideoResumePlan(config: SiteConfig | null | undefined): HeroVideoResumePlan {
  const hero = config?.pages
    .find((page) => page.slug === '')
    ?.sections.find((section) => section.type === 'hero' && !section.hidden);
  const requested = config?.motion?.videoAddon === true || config?.motion?.videoRequested === true;
  const applied = Boolean(hero?.background.video?.src && hero.background.video.poster);
  const heroImageChoice = config?.motion?.heroImageChoice;
  const heroPhotoUrl = heroImageChoice === 'upload' ? hero?.background.image?.src : undefined;
  return {
    requested,
    applied,
    canResume: requested && !applied && Boolean(hero?.background.image?.src),
    ...(heroImageChoice ? { heroImageChoice } : {}),
    ...(heroPhotoUrl ? { heroPhotoUrl } : {}),
  };
}

/** 출처 판정용 힌트는 API 계약에 맞는 짧은 원격/루트 경로만 보낸다. data/blob은 실제 hero src가 판정한다. */
export function heroVideoPhotoHint(heroPhotoUrl?: string): string | undefined {
  const photo = heroPhotoUrl?.trim();
  return photo && photo.length <= 2048 && (/^https?:\/\//i.test(photo) || /^\/(?!\/)/.test(photo))
    ? photo
    : undefined;
}

export async function processApprovedHeroVideo(
  input: {
    siteId: string;
    tier: Tier;
    videoAddon: boolean;
    heroImageChoice?: HeroImageChoice;
    heroPhotoUrl?: string;
    tone: readonly string[];
  },
  dependencies: HeroVideoProcessDependencies,
): Promise<HeroVideoProcessResult> {
  if (!input.videoAddon) return { status: 'skipped', reason: 'not-requested' };
  if (!hasVideoAddon(input.tier)) return { status: 'skipped', reason: 'not-approved' };

  try {
    const photoHint = input.heroImageChoice === 'upload'
      ? heroVideoPhotoHint(input.heroPhotoUrl)
      : undefined;
    const drafts = await dependencies.generateDrafts(input.siteId, {
      count: 1,
      tone: input.tone,
      ...(photoHint ? { heroPhotoUrl: photoHint } : {}),
    });
    const draft = drafts[0];
    if (!draft) throw new Error('영상 시안이 반환되지 않았습니다.');
    await dependencies.applyDraft(input.siteId, draft);
    return { status: 'applied' };
  } catch (error) {
    return {
      status: 'fallback',
      reason: 'generation-failed',
      message: error instanceof Error ? error.message : '영상 생성에 실패했습니다.',
    };
  }
}
