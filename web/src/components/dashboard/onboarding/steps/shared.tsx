'use client';

/**
 * [survey v4] 8스텝 서브위저드 공용 계약·프리미티브 (라이트 테마).
 * survey-step.tsx(호스트)와 step01~08이 공유한다. 폼 상태 스키마·타입, 색/무드 파생,
 * initialValues→폼 기본값 매핑, 라이트 토큰 UI 조각, 스텝 전환 페이드를 모은다.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { z } from 'zod';
import { Check } from 'lucide-react';
import type { CandidateStyle, SiteGoalId, SurveyInput } from '@/lib/types/domain';
import { REFERENCE_SAMPLES } from '@/lib/design/reference-samples';
import { normalizeTone } from '@/lib/onboarding/tone';
import { regionOf } from '@/lib/onboarding/region';
import { cn } from '../../ui';

// ---------- 폼 스키마 (RHF 전용 — 내부 필드 포함. 서버 계약은 호스트 onComplete에서 조립) ----------

const PRESENCE_KINDS = ['website', 'instagram', 'naver_place', 'other'] as const;

export const surveyFormSchema = z.object({
  purposeId: z.string().min(1, '어떤 곳인지 하나 골라주세요.'),
  businessName: z
    .string()
    .min(1, '상호명을 입력해주세요.')
    .max(60, '상호명은 60자 이내로 입력해주세요.'),
  /** [UI 전용] 지역 — SurveyInput에 필드가 없어 onComplete에서 extraNotes로 접어 넣음 */
  region: z.string().max(60).optional(),
  tagline: z.string().max(80, '한 줄 소개는 80자 이내로 입력해주세요.').optional(),
  industry: z.string().min(1, '업종을 고르거나 입력해주세요.').max(100),
  existingPresence: z.array(z.object({ kind: z.enum(PRESENCE_KINDS), url: z.string() })).max(3),
  providedContent: z.string().max(5000, '5000자 이내로 입력해주세요.').optional(),
  storePhotoUrls: z.array(z.string()).max(12),
  /** [v4.5] 로고 URL(선택). 없으면 상호명 글자 로고 폴백 */
  logoUrl: z.string().optional(),
  imageStyle: z.enum(['photo', '3d_render', 'illustration']).optional(),
  /** [UI 전용] 고른 무드 샘플 id (최대 2, 첫 번째 = 팔레트 시드) */
  moodIds: z.array(z.string()).max(2),
  /** [UI 전용] 대표색 직접 지정(hex). 있으면 colorPreference를 덮어씀 */
  colorOverride: z.string(),
  /** [UI 전용] 보조색 직접 지정(hex). 없으면 시드에서 파생 */
  secondaryColor: z.string(),
  siteGoal: z.enum(['call', 'reserve', 'directions', 'kakao_inquiry', 'purchase', 'trust']).optional(),
  highlights: z.array(z.string().max(40)).max(3),
  tone: z
    .array(z.string())
    .min(1, '분위기를 1개 이상 골라주세요.')
    .max(2, '분위기는 최대 2개까지 선택할 수 있어요.'),
  extraNotes: z.string().max(500, '추가 요청은 500자 이내로 입력해주세요.').optional(),
});

export type SurveyForm = z.infer<typeof surveyFormSchema>;

/** 각 스텝을 떠날 때 검증할 필수 필드 (나머지는 선택·수동 검증) */
export const STEP_REQUIRED_FIELDS: Record<number, (keyof SurveyForm)[]> = {
  1: ['purposeId', 'businessName', 'industry'],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
  7: ['tone'],
  8: [],
};

// ---------- 색/무드 파생 (순수) ----------

/** 무드 첫 선택 + 직접색 → 최종 colorPreference/secondaryColor */
export function deriveColors(
  form: Pick<SurveyForm, 'moodIds' | 'colorOverride' | 'secondaryColor'>,
): { colorPreference: string; secondaryColor?: string } {
  const firstMood = form.moodIds.length
    ? REFERENCE_SAMPLES.find((s) => s.id === form.moodIds[0])
    : undefined;
  const seed = firstMood?.paletteSeed;
  const colorPreference = (form.colorOverride || '').trim() || seed?.primary || '';
  const manualSecondary = (form.secondaryColor || '').trim();
  const secondaryColor = manualSecondary || seed?.secondary || undefined;
  return { colorPreference, secondaryColor };
}

// ---------- initialValues → 폼 기본값 ----------

export function toFormDefaults(initial: SurveyInput | null, defaultBusinessName?: string): SurveyForm {
  if (!initial) {
    return {
      purposeId: '',
      businessName: defaultBusinessName ?? '',
      region: '',
      tagline: '',
      industry: '',
      existingPresence: [],
      providedContent: '',
      storePhotoUrls: [],
      logoUrl: '',
      imageStyle: undefined,
      moodIds: [],
      colorOverride: '',
      secondaryColor: '',
      siteGoal: undefined,
      highlights: [],
      tone: [],
      extraNotes: '',
    };
  }
  const moodIds = REFERENCE_SAMPLES.filter((s) =>
    (initial.referenceStyleIds ?? []).includes(s.styleId),
  ).map((s) => s.id);
  const firstSeed = moodIds.length
    ? REFERENCE_SAMPLES.find((s) => s.id === moodIds[0])?.paletteSeed
    : undefined;
  // colorPreference가 시드 primary와 다르면 사용자가 직접 지정한 것으로 복원
  const colorOverride =
    initial.colorPreference && (!firstSeed || initial.colorPreference !== firstSeed.primary)
      ? initial.colorPreference
      : '';
  return {
    purposeId: initial.purposeId,
    businessName: initial.businessName,
    region: regionOf(initial) ?? '',
    tagline: initial.tagline ?? '',
    industry: initial.industry,
    existingPresence: (initial.existingPresence ?? []).map((p) => ({ kind: p.kind, url: p.url })),
    providedContent: initial.providedContent ?? '',
    storePhotoUrls: initial.storePhotoUrls ?? [],
    logoUrl: initial.logoUrl ?? '',
    imageStyle: initial.imageStyle,
    moodIds,
    colorOverride,
    secondaryColor: initial.secondaryColor ?? '',
    siteGoal: initial.siteGoal as SiteGoalId | undefined,
    highlights: initial.highlights ?? [],
    tone: normalizeTone(initial.tone),
    extraNotes: initial.extraNotes ?? '',
  };
}

/**
 * [v4.5] 로고 래스터(png/jpeg/webp)의 네 모서리가 모두 흰색근접(각 채널 > 240·알파 > 250)이면
 * true(흰 배경 감지). SVG/비래스터는 대상 제외. 순수 클라이언트 UX 경고 — 발행 차단 아님.
 */
export async function detectWhiteBg(file: File): Promise<boolean> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return false;
  try {
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width;
    const h = bitmap.height;
    if (!w || !h) {
      bitmap.close();
      return false;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return false;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const corners: [number, number][] = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ];
    for (const [x, y] of corners) {
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      if (!(r > 240 && g > 240 && b > 240 && a > 250)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ---------- 이미지 스타일 샘플 파일 매핑 ----------

export const STYLE_SAMPLE_SRC: Record<CandidateStyle, string> = {
  photo: '/onboarding/style-samples/photo.webp',
  '3d_render': '/onboarding/style-samples/3d-render.webp',
  illustration: '/onboarding/style-samples/illustration.webp',
};

/** 이미지 스타일 미니 예시 썸네일 (인라인 SVG — 실제 에셋 없을 때 폴백) */
export function StyleThumb({ style }: { style: CandidateStyle }) {
  const common = 'h-full w-full';
  if (style === '3d_render') {
    return (
      <svg viewBox="0 0 64 40" className={common} aria-hidden>
        <rect width="64" height="40" fill="#eceef4" />
        <path d="M32 8 48 17 32 26 16 17Z" fill="#a9b6d6" />
        <path d="M16 17 32 26 32 39 16 30Z" fill="#7f8fbd" />
        <path d="M48 17 32 26 32 39 48 30Z" fill="#5f6fa3" />
      </svg>
    );
  }
  if (style === 'illustration') {
    return (
      <svg viewBox="0 0 64 40" className={common} aria-hidden>
        <rect width="64" height="40" fill="#fbf1e2" />
        <circle cx="22" cy="21" r="9" fill="#e8a06a" />
        <path d="M38 31 48 12 58 31Z" fill="#7fae86" />
        <rect x="29" y="25" width="11" height="6" rx="1" fill="#d98b8b" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 40" className={common} aria-hidden>
      <rect width="64" height="40" fill="#dbe6f0" />
      <circle cx="47" cy="12" r="6" fill="#f3c979" />
      <path d="M0 40 18 24 30 31 46 18 64 33 64 40Z" fill="#8ea7c4" />
      <path d="M0 40 24 30 40 36 64 27 64 40Z" fill="#6f8bab" />
    </svg>
  );
}

// ---------- 스텝 간 UX 컨텍스트 (편집 이동·가져오기 배지) ----------

export interface SurveyUx {
  /** 특정 스텝으로 이동 (S8 편집 링크) */
  goTo: (step: number) => void;
  /** S2 가져오기로 S3 원문이 프리필됐는지 */
  importedBadge: boolean;
  setImportedBadge: (v: boolean) => void;
}

const SurveyUxContext = createContext<SurveyUx | null>(null);
export const SurveyUxProvider = SurveyUxContext.Provider;

export function useSurveyUx(): SurveyUx {
  const ctx = useContext(SurveyUxContext);
  if (!ctx) throw new Error('useSurveyUx는 SurveyUxProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}

// ---------- 라이트 테마 프리미티브 ----------

/** 스텝 상단 "이 정보는 ○○에 쓰여요" 회색 한 줄 */
export function StepIntro({ children }: { children: React.ReactNode }) {
  return <p className="mb-5 text-sm leading-relaxed text-ob-muted">{children}</p>;
}

/** 필드 라벨 + 에러 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label className="text-[15px] font-medium text-ob-ink">{label}</label>
        {error ? <span className="text-xs text-ob-danger">{error}</span> : null}
      </div>
      {hint ? <p className="mb-2 text-[13px] leading-relaxed text-ob-muted">{hint}</p> : null}
      {children}
    </div>
  );
}

export const obInput =
  'w-full rounded-ob border border-ob-border bg-ob-surface px-3.5 py-2.5 text-[16px] text-ob-ink placeholder:text-ob-muted/70 outline-none transition-colors focus:border-ob-accent-strong focus:ring-1 focus:ring-ob-accent';

/** 라이트 칩 (단일/다중 토글 공용) */
export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-3.5 py-2 text-sm transition-colors',
        selected
          ? 'border-ob-accent-strong bg-ob-accent-soft font-medium text-ob-accent-strong'
          : 'border-ob-border bg-ob-surface text-ob-muted hover:border-ob-muted hover:text-ob-ink',
      )}
    >
      {children}
    </button>
  );
}

/** 선택형 카드 (목적/무드/스타일/목표 공용 컨테이너) */
export function SelectCard({
  selected,
  onClick,
  className,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        'relative flex flex-col rounded-ob border p-4 text-left transition-colors',
        selected
          ? 'border-ob-accent-strong bg-ob-accent-soft ring-1 ring-ob-accent'
          : 'border-ob-border bg-ob-surface hover:border-ob-muted',
        className,
      )}
    >
      {selected ? (
        <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-ob-accent-strong text-white">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      ) : null}
      {children}
    </button>
  );
}

/**
 * 스텝 전환 페이드 + 8px 상승 (CSS transition만, prefers-reduced-motion 존중).
 * key={step}로 리마운트되어 매 스텝 재생.
 */
export function StepFade({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    if (m) {
      setReduce(true);
      setShown(true);
      return;
    }
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div
      style={
        reduce
          ? undefined
          : {
              opacity: shown ? 1 : 0,
              transform: shown ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 180ms ease, transform 180ms ease',
            }
      }
    >
      {children}
    </div>
  );
}
