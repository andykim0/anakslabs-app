'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ChevronDown, ChevronUp, ImagePlus, Loader2, Lock, Sparkles, X } from 'lucide-react';
import type { CandidateStyle, SectionPlanItem, SitePurposeId, SurveyInput } from '@/lib/types/domain';
import { PURPOSES, findPurpose, type PurposeGroup } from '@/lib/data/purpose-taxonomy';
import { defaultImageStyle, IMAGE_STYLE_OPTIONS } from '@/lib/onboarding/image-style';
import { normalizeTone } from '@/lib/onboarding/tone';
import { REFERENCE_SAMPLES, styleIdsForSamples } from '@/lib/design/reference-samples';
import { SITE_TEMPLATES, pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { suggestSection, uploadImage } from '../api';
import { useToast } from '../toast';
import { Button, Card, cn } from '../ui';

// ---------- 스키마 ----------

const PURPOSE_IDS = PURPOSES.map((p) => p.id) as [SitePurposeId, ...SitePurposeId[]];

const surveySchema = z.object({
  purposeId: z.enum(PURPOSE_IDS as unknown as [string, ...string[]], {
    message: '사이트의 목적을 선택해주세요.',
  }),
  businessName: z.string().min(1, '상호명을 입력해주세요.').max(60, '상호명은 60자 이내로 입력해주세요.'),
  tagline: z.string().max(80, '태그라인은 80자 이내로 입력해주세요.').optional(),
  logoUrl: z.string().optional(),
  industry: z.string().min(1, '업종을 선택하거나 입력해주세요.'),
  tone: z
    .array(z.string())
    .min(1, '분위기를 1개 이상 골라주세요')
    .max(2, '분위기는 최대 2개까지 선택할 수 있어요'),
  colorPreference: z.string().min(1, '메인 컬러를 골라주세요.'),
  secondaryColor: z.string().optional(),
  imageStyle: z.enum(['photo', '3d_render', 'illustration']).optional(),
  storePhotoUrls: z.array(z.string()).max(12, '가게 사진은 최대 12장까지 올릴 수 있어요.').optional(),
  referenceImageUrls: z.array(z.string()).max(6, '레퍼런스 이미지는 최대 6장까지 선택할 수 있습니다.'),
  // [F4] 콘텐츠 원문은 생성 품질의 원료라 유지(항상 선택 입력). contentMode 토글·예약은 제거(발행 후 설정).
  providedContent: z.string().max(5000, '제공 내용은 5000자 이내로 입력해주세요.').optional(),
  extraNotes: z.string().max(500, '추가 요청사항은 500자 이내로 입력해주세요.').optional(),
});

type SurveyForm = z.infer<typeof surveySchema>;

// ---------- 선택지 ----------

/** 목적 카드 4묶음 표시 순서 */
const GROUP_ORDER: { group: PurposeGroup; label: string; hint: string }[] = [
  { group: 'sell', label: '팔기', hint: '상품·서비스를 판매' },
  { group: 'serve', label: '손님 받기', hint: '예약·방문·문의를 받기' },
  { group: 'promote', label: '알리기', hint: '회사·작업·행사를 소개' },
  { group: 'content', label: '콘텐츠·멤버십', hint: '콘텐츠 발행·회원 운영' },
];

/** 리스트 하단 특수 구분선 아래에 배치할 목적 */
const SPECIAL_PURPOSE_IDS: SitePurposeId[] = ['event', 'one_page'];

const TONE_CHIPS = ['고급스러운', '미니멀', '친근한', '대담한', '차분한', '러스틱', '모던'];

/** [F3 #6] 메인/보조 컬러 스와치 — 대표 브랜드 색 팔레트(단일 선택). */
const BRAND_COLORS: { name: string; hex: string }[] = [
  { name: '네이비', hex: '#1f2a44' },
  { name: '에스프레소', hex: '#4b3621' },
  { name: '딥그린', hex: '#1f4d3a' },
  { name: '버건디', hex: '#6d2231' },
  { name: '차콜', hex: '#2b2b2b' },
  { name: '테라코타', hex: '#c05a3a' },
  { name: '머스타드', hex: '#c99a2e' },
  { name: '세이지', hex: '#6b7a4f' },
  { name: '코발트', hex: '#2d63f0' },
  { name: '틸', hex: '#157a72' },
  { name: '라벤더', hex: '#6f6bd6' },
  { name: '로즈', hex: '#c25b7a' },
  { name: '블랙', hex: '#111111' },
  { name: '아이보리', hex: '#ece6d8' },
  { name: '코랄', hex: '#ef6f53' },
  { name: '슬레이트', hex: '#445068' },
];

/**
 * [F3 #4] 로고 래스터(png/jpeg/webp)의 네 모서리가 모두 흰색근접(각 채널 > 240)이고
 * 불투명(알파 > 250)이면 true(흰 배경 감지). SVG/비래스터는 픽셀 샘플 불가라 대상 제외(false).
 * 순수 클라이언트 UX 경고용 — 발행 차단 아님.
 */
async function detectWhiteBg(file: File): Promise<boolean> {
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

/** 이미지 스타일 미니 예시 썸네일 (인라인 SVG — 외부 에셋 없음) */
function StyleThumb({ style }: { style: CandidateStyle }) {
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

// ---------- 섹션 계획표 로컬 상태 ----------

/** 계획표 한 행 — SectionPlanItem에 UI 전용 key/enabled를 덧입힌 래퍼 */
interface PlanRow {
  key: string;
  item: SectionPlanItem;
  enabled: boolean;
}

let rowKeySeq = 0;
const nextRowKey = () => `row-${rowKeySeq++}`;

function rowsFromPlan(plan: SectionPlanItem[]): PlanRow[] {
  return plan.map((item) => ({ key: nextRowKey(), item, enabled: true }));
}

/** 업종 오버라이드 템플릿인지 (industryMatch 보유) */
function isOverrideTemplate(templateId: string): boolean {
  const t = SITE_TEMPLATES.find((tpl) => tpl.id === templateId);
  return Boolean(t?.industryMatch && t.industryMatch.length > 0);
}

// ---------- 보조 컴포넌트 ----------

function FieldLabel({ children, error }: { children: React.ReactNode; error?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <span className="text-sm font-medium text-neutral-200">{children}</span>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

function Chip({
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
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs transition-colors',
        selected
          ? 'border-[#c8a96a] bg-[#2a2117] font-medium text-[#d9b878]'
          : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200',
      )}
    >
      {children}
    </button>
  );
}

function PurposeCard({
  def,
  selected,
  onSelect,
}: {
  def: (typeof PURPOSES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-full flex-col rounded-xl border p-4 text-left transition-colors',
        selected ? 'border-[#c8a96a] bg-[#2a2117]' : 'border-neutral-700 hover:border-neutral-500',
      )}
    >
      <span className={cn('text-sm font-semibold', selected ? 'text-[#d9b878]' : 'text-neutral-100')}>
        {def.label}
      </span>
      <span className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">
        {def.features.slice(0, 3).join(' · ')}
      </span>
    </button>
  );
}

const inputClass =
  'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors focus:border-[#c8a96a]';

const swatchClass = (selected: boolean) =>
  cn(
    'aspect-square rounded-lg border-2 transition-transform',
    selected ? 'scale-105 border-[#c8a96a]' : 'border-neutral-800 hover:border-neutral-600',
  );

// ---------- 본체 ----------

export function SurveyStep({
  defaultBusinessName: _defaultBusinessName,
  initialValues,
  onComplete,
}: {
  defaultBusinessName?: string;
  initialValues: SurveyInput | null;
  onComplete: (values: SurveyInput) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const storePhotoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoWhiteBg, setLogoWhiteBg] = useState(false);
  const [storePhotoUploading, setStorePhotoUploading] = useState(false);

  // [F3 #7] 무드보드 선택(styleId 매핑 대상) — referenceImageUrls와 별개 로컬 상태
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>(() =>
    REFERENCE_SAMPLES.filter((s) => (initialValues?.referenceStyleIds ?? []).includes(s.styleId)).map((s) => s.id),
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SurveyForm>({
    resolver: zodResolver(surveySchema),
    defaultValues: initialValues
      ? {
          purposeId: initialValues.purposeId,
          businessName: initialValues.businessName,
          tagline: initialValues.tagline ?? '',
          logoUrl: initialValues.logoUrl ?? '',
          industry: initialValues.industry,
          tone: normalizeTone(initialValues.tone),
          colorPreference: initialValues.colorPreference,
          secondaryColor: initialValues.secondaryColor ?? '',
          imageStyle: initialValues.imageStyle,
          storePhotoUrls: initialValues.storePhotoUrls ?? [],
          referenceImageUrls: initialValues.referenceImageUrls,
          providedContent: initialValues.providedContent ?? '',
          extraNotes: initialValues.extraNotes ?? '',
        }
      : {
          purposeId: undefined,
          businessName: '',
          tagline: '',
          logoUrl: '',
          industry: '',
          tone: [],
          colorPreference: '',
          secondaryColor: '',
          imageStyle: undefined,
          storePhotoUrls: [],
          referenceImageUrls: [],
          providedContent: '',
          extraNotes: '',
        },
  });

  const purposeId = watch('purposeId') as SitePurposeId | undefined;
  const industry = watch('industry');
  const tone = watch('tone');
  const colorPreference = watch('colorPreference');
  const secondaryColor = watch('secondaryColor');
  const imageStyle = watch('imageStyle');
  // 업종 기반 기본 이미지 스타일을 사전 선택 (사용자가 직접 고르기 전까지 업종 변경에 따라 갱신)
  const imageStyleTouched = useRef<boolean>(Boolean(initialValues?.imageStyle));
  useEffect(() => {
    if (!imageStyleTouched.current) setValue('imageStyle', defaultImageStyle(industry));
  }, [industry, setValue]);
  const referenceImageUrls = watch('referenceImageUrls');
  const storePhotoUrls = watch('storePhotoUrls') ?? [];
  const logoUrl = watch('logoUrl');

  // ----- 섹션 계획표 상태 -----
  const initialTemplate =
    initialValues && purposeId ? resolveTemplate(initialValues.purposeId, initialValues.industry) : null;
  const [templateId, setTemplateId] = useState<string>(
    initialValues?.templateId ?? initialTemplate?.id ?? '',
  );
  const [planRows, setPlanRows] = useState<PlanRow[]>(
    initialValues ? rowsFromPlan(initialValues.sectionPlan) : [],
  );
  // 초안 복원 시엔 사용자가 손댔을 수 있다고 보수적으로 간주(무음 덮어쓰기 방지)
  const [planTouched, setPlanTouched] = useState<boolean>(Boolean(initialValues));
  const [pendingTemplate, setPendingTemplate] = useState<ReturnType<typeof resolveTemplate> | null>(null);
  // "지금 구성 유지"로 확인 완료한 템플릿 id — 재프롬프트 억제
  const ackRef = useRef<string>(templateId);
  // [v3 Phase 2] AI 섹션 개입
  const [aiInput, setAiInput] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  // 목적·업종 변경 시 템플릿 재적용 (미수정이면 조용히, 수정했으면 확인 다이얼로그)
  useEffect(() => {
    if (!purposeId) return;
    const resolved = resolveTemplate(purposeId, industry ?? '');
    if (resolved.id === templateId || resolved.id === ackRef.current) return;
    if (!planTouched || planRows.length === 0) {
      setPlanRows(rowsFromPlan(planFromTemplate(resolved)));
      setTemplateId(resolved.id);
      setPlanTouched(false);
      ackRef.current = resolved.id;
    } else {
      setPendingTemplate(resolved);
    }
  }, [purposeId, industry, templateId, planTouched, planRows.length]);

  const applyPendingTemplate = () => {
    if (!pendingTemplate) return;
    setPlanRows(rowsFromPlan(planFromTemplate(pendingTemplate)));
    setTemplateId(pendingTemplate.id);
    setPlanTouched(false);
    ackRef.current = pendingTemplate.id;
    setPendingTemplate(null);
  };

  const keepCurrentPlan = () => {
    if (!pendingTemplate) return;
    ackRef.current = pendingTemplate.id; // 같은 결과엔 다시 묻지 않음
    setPendingTemplate(null);
  };

  const moveRow = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= planRows.length) return;
    const next = [...planRows];
    [next[index], next[target]] = [next[target], next[index]];
    setPlanRows(next);
    setPlanTouched(true);
  };

  const toggleRow = (key: string) => {
    setPlanRows((rows) =>
      rows.map((r) => (r.key === key && !r.item.required ? { ...r, enabled: !r.enabled } : r)),
    );
    setPlanTouched(true);
  };

  const removeRow = (key: string) => {
    setPlanRows((rows) => rows.filter((r) => r.key !== key));
    setPlanTouched(true);
  };

  const flashRow = (key: string) => {
    setHighlightKey(key);
    window.setTimeout(() => setHighlightKey((k) => (k === key ? null : k)), 2000);
  };

  // [v3 Phase 2] "찾는 섹션이 없나요?" → AI 판정 → 계획표에 source:'ai' 행 삽입 (중복이면 하이라이트)
  const handleSuggest = async () => {
    const name = aiInput.trim();
    if (!name || suggesting) return;
    setSuggesting(true);
    try {
      const res = await suggestSection({
        name,
        context: {
          businessName: watch('businessName') ?? '',
          industry: watch('industry') ?? '',
          purpose: selectedPurpose?.label ?? '',
          tone: (watch('tone') ?? []).join(', ') || undefined,
        },
      });
      // 중복 방지: 같은 type + (variant 없음) 이 이미 있으면 그 행 하이라이트
      const dup = planRows.find((r) => r.item.type === res.mappedType && !r.item.variant);
      if (dup) {
        flashRow(dup.key);
        toast('info', `이미 "${dup.item.name}" 섹션이 있어요. 그 섹션을 활용하세요.`);
      } else {
        const key = nextRowKey();
        const item: SectionPlanItem = {
          type: res.mappedType,
          name: res.name,
          brief: res.copySeed,
          source: 'ai',
        };
        setPlanRows((rows) => [...rows, { key, item, enabled: true }]);
        setPlanTouched(true);
        flashRow(key);
        toast('success', `"${res.name}" 섹션을 추가했어요.`);
      }
      setAiInput('');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '섹션 제안에 실패했습니다.');
    } finally {
      setSuggesting(false);
    }
  };

  const selectedPurpose = purposeId ? findPurpose(purposeId) : undefined;

  const industryChips = useMemo(() => selectedPurpose?.industries ?? [], [selectedPurpose]);

  const setField = (name: keyof SurveyForm, value: string) => setValue(name, value, { shouldValidate: true });

  // [F3 #5] 톤 다중 토글 (최대 2)
  const toggleTone = (chip: string) => {
    const cur = watch('tone') ?? [];
    if (cur.includes(chip)) {
      setValue('tone', cur.filter((t) => t !== chip), { shouldValidate: true });
    } else if (cur.length >= 2) {
      toast('info', '분위기는 최대 2개까지 선택할 수 있어요.');
    } else {
      setValue('tone', [...cur, chip], { shouldValidate: true });
    }
  };

  // [F3 #7] 무드보드 다중 토글
  const toggleSample = (id: string) =>
    setSelectedSampleIds((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));

  const toggleReference = (url: string) => {
    const next = referenceImageUrls.includes(url)
      ? referenceImageUrls.filter((u) => u !== url)
      : [...referenceImageUrls, url].slice(0, 6);
    setValue('referenceImageUrls', next, { shouldValidate: true });
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const urls = Array.from(files).map((f) => URL.createObjectURL(f));
    const next = [...referenceImageUrls, ...urls].slice(0, 6);
    setValue('referenceImageUrls', next, { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLogo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoWhiteBg(false);
    try {
      const url = await uploadImage(file);
      setValue('logoUrl', url, { shouldValidate: true });
      toast('success', '로고를 업로드했어요. 히어로 섹션에 반영됩니다.');
      // [F3 #4] 흰 배경 감지 (래스터만, 순수 UX 경고)
      void detectWhiteBg(file).then((white) => setLogoWhiteBg(white)).catch(() => {});
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '로고 업로드에 실패했습니다.');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  // [F3 #2a] 가게·메뉴 사진 다중 업로드 (로고와 동일 uploadImage 패턴)
  const handleStorePhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const current = watch('storePhotoUrls') ?? [];
    const remaining = 12 - current.length;
    if (remaining <= 0) {
      toast('info', '가게 사진은 최대 12장까지 올릴 수 있어요.');
      if (storePhotoInputRef.current) storePhotoInputRef.current.value = '';
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setStorePhotoUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of picked) {
        uploaded.push(await uploadImage(f));
      }
      setValue('storePhotoUrls', [...current, ...uploaded].slice(0, 12), { shouldValidate: true });
      if (uploaded.length) toast('success', `사진 ${uploaded.length}장을 올렸어요.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '사진 업로드에 실패했습니다.');
    } finally {
      setStorePhotoUploading(false);
      if (storePhotoInputRef.current) storePhotoInputRef.current.value = '';
    }
  };

  const removeStorePhoto = (url: string) => {
    const current = watch('storePhotoUrls') ?? [];
    setValue('storePhotoUrls', current.filter((u) => u !== url), { shouldValidate: true });
  };

  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);

  const onSubmit = handleSubmit((values) => {
    const pid = values.purposeId as SitePurposeId;
    const purposeDef = findPurpose(pid);
    // 활성화된 행만, 현재 순서대로 sectionPlan 구성 (source 유지)
    const sectionPlan = planRows.filter((r) => r.enabled).map((r) => r.item);
    // [F1] 페이지 메타(제목·내비) — 템플릿 페이지 분할에서 파생(빈 페이지는 생성 시 제외)
    const pagePlan = pagePlanFromTemplate(resolveTemplate(pid, values.industry));
    onComplete({
      purposeId: pid,
      purpose: purposeDef?.label ?? pid,
      businessName: values.businessName,
      industry: values.industry,
      tone: values.tone,
      colorPreference: values.colorPreference,
      secondaryColor: clean(values.secondaryColor),
      imageStyle: values.imageStyle ?? defaultImageStyle(values.industry),
      storePhotoUrls: values.storePhotoUrls && values.storePhotoUrls.length ? values.storePhotoUrls : undefined,
      referenceImageUrls: values.referenceImageUrls,
      referenceStyleIds: selectedSampleIds.length ? styleIdsForSamples(selectedSampleIds) : undefined,
      sectionPlan,
      pagePlan,
      templateId,
      tagline: clean(values.tagline),
      logoUrl: clean(values.logoUrl),
      providedContent: clean(values.providedContent),
      extraNotes: clean(values.extraNotes),
    });
  });

  const groupedPurposes = GROUP_ORDER.map((g) => ({
    ...g,
    items: PURPOSES.filter((p) => p.group === g.group && !SPECIAL_PURPOSE_IDS.includes(p.id)),
  }));
  const specialPurposes = PURPOSES.filter((p) => SPECIAL_PURPOSE_IDS.includes(p.id));

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="space-y-8 p-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-50">웹사이트 방향을 알려주세요</h2>
          <p className="mt-1 text-sm text-neutral-500">
            답변을 바탕으로 AI가 디자인 후보 3안을 제안합니다. 5분이면 충분해요.
          </p>
        </div>

        {/* ① 목적 */}
        <div>
          <FieldLabel error={errors.purposeId?.message as string | undefined}>
            어떤 사이트인가요?
          </FieldLabel>
          <div className="space-y-5">
            {groupedPurposes.map((g) =>
              g.items.length === 0 ? null : (
                <div key={g.group}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-neutral-300">{g.label}</span>
                    <span className="text-[11px] text-neutral-600">{g.hint}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.items.map((def) => (
                      <PurposeCard
                        key={def.id}
                        def={def}
                        selected={purposeId === def.id}
                        onSelect={() => setField('purposeId', def.id)}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}

            {/* 특수 목적 구분선 */}
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-[11px] font-medium text-neutral-600">특수 목적</span>
                <span className="h-px flex-1 bg-neutral-800" />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {specialPurposes.map((def) => (
                  <PurposeCard
                    key={def.id}
                    def={def}
                    selected={purposeId === def.id}
                    onSelect={() => setField('purposeId', def.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ② 업종 */}
        <div>
          <FieldLabel error={errors.industry?.message}>업종</FieldLabel>
          {selectedPurpose ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {industryChips.map((chip) => (
                <Chip key={chip} selected={industry === chip} onClick={() => setField('industry', chip)}>
                  {chip}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-xs text-neutral-600">먼저 목적을 선택하면 업종 예시가 나타납니다.</p>
          )}
          <input {...register('industry')} placeholder="직접 입력" className={inputClass} />
        </div>

        {/* ③ 상호명 */}
        <div>
          <FieldLabel error={errors.businessName?.message}>상호명</FieldLabel>
          <input
            {...register('businessName')}
            placeholder="예: 하루필라테스, 리버사이드 스튜디오"
            className={inputClass}
          />
        </div>

        {/* 태그라인 */}
        <div>
          <FieldLabel error={errors.tagline?.message}>
            태그라인 <span className="font-normal text-neutral-500">(선택)</span>
          </FieldLabel>
          <input {...register('tagline')} placeholder="예: 매일의 균형을 만드는 시간" className={inputClass} />
        </div>

        {/* 로고 업로드 */}
        <div>
          <FieldLabel>
            로고 / 브랜드 자산 <span className="font-normal text-neutral-500">(선택 · 없으면 텍스트 로고)</span>
          </FieldLabel>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <span className="relative">
                <img src={logoUrl} alt="업로드한 로고" className="h-14 w-14 rounded-lg border border-neutral-700 bg-neutral-900 object-contain p-1" />
                <button
                  type="button"
                  onClick={() => {
                    setValue('logoUrl', '', { shouldValidate: true });
                    setLogoWhiteBg(false);
                  }}
                  aria-label="로고 제거"
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-neutral-200 transition-colors hover:bg-red-800"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoUploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-700 px-3 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-50"
            >
              {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {logoUrl ? '로고 교체' : '로고 업로드'}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => handleLogo(e.target.files)}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-600">
            PNG·JPG·WEBP·SVG, 5MB 이하. 배경이 투명한 PNG를 권장합니다. SVG는 안전하게 정리 후 저장됩니다.
          </p>
          {logoWhiteBg ? (
            <p className="mt-1.5 text-[11px] text-amber-400">흰 배경이 감지됐어요 — 투명 PNG로 올리면 더 깔끔해요.</p>
          ) : null}
        </div>

        {/* ④ 톤 (최대 2개) */}
        <div>
          <FieldLabel error={errors.tone?.message as string | undefined}>
            원하는 분위기(톤) <span className="font-normal text-neutral-500">(최대 2개)</span>
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {TONE_CHIPS.map((chip) => (
              <Chip key={chip} selected={(tone ?? []).includes(chip)} onClick={() => toggleTone(chip)}>
                {chip}
              </Chip>
            ))}
          </div>
        </div>

        {/* 컬러 (F3 #6) */}
        <div className="space-y-4">
          {/* ① 메인 컬러 */}
          <div>
            <FieldLabel error={errors.colorPreference?.message}>메인 컬러를 골라주세요</FieldLabel>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={`${c.name} (${c.hex})`}
                  aria-label={c.name}
                  onClick={() => setField('colorPreference', c.hex)}
                  className={swatchClass(colorPreference === c.hex)}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-neutral-500">목록에 없으면 직접 고르기</span>
              <input
                type="color"
                aria-label="메인 컬러 직접 선택"
                value={/^#[0-9a-fA-F]{6}$/.test(colorPreference) ? colorPreference : '#1f2a44'}
                onChange={(e) => setField('colorPreference', e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border border-neutral-700 bg-neutral-900"
              />
              {colorPreference ? <span className="text-[11px] text-neutral-400">{colorPreference}</span> : null}
            </div>
          </div>

          {/* ② 보조 컬러 (선택) */}
          <div>
            <FieldLabel>
              보조 컬러 <span className="font-normal text-neutral-500">(선택)</span>
            </FieldLabel>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={`${c.name} (${c.hex})`}
                  aria-label={c.name}
                  onClick={() => setValue('secondaryColor', c.hex, { shouldValidate: true })}
                  className={swatchClass(secondaryColor === c.hex)}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            {secondaryColor ? (
              <button
                type="button"
                onClick={() => setValue('secondaryColor', '', { shouldValidate: true })}
                className="mt-2 text-[11px] text-neutral-500 underline transition-colors hover:text-neutral-300"
              >
                보조 컬러 비우기
              </button>
            ) : null}
          </div>
        </div>

        {/* 이미지 스타일 */}
        <div>
          <FieldLabel>사이트 이미지를 어떤 느낌으로 만들까요?</FieldLabel>
          <p className="mb-2 text-xs text-neutral-500">
            선택한 스타일로 후보 3안이 모두 만들어지고, 각 안은 서로 다른 무드로 제안돼요.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {IMAGE_STYLE_OPTIONS.map((opt) => {
              const recommended = opt.id === defaultImageStyle(industry);
              const selected = (imageStyle ?? defaultImageStyle(industry)) === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    imageStyleTouched.current = true;
                    setField('imageStyle', opt.id);
                  }}
                  className={cn(
                    'flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
                    selected ? 'border-[#c8a96a] ring-1 ring-[#c8a96a]/50' : 'border-neutral-700 hover:border-neutral-500',
                  )}
                >
                  <div className="relative aspect-[8/5] w-full bg-neutral-900">
                    <StyleThumb style={opt.id} />
                    {recommended ? (
                      <span className="absolute top-1.5 left-1.5 rounded-full bg-[#c8a96a] px-1.5 py-0.5 text-[9px] font-semibold text-neutral-950">
                        추천
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2.5">
                    <p className={cn('text-xs font-semibold', selected ? 'text-[#d9b878]' : 'text-neutral-200')}>{opt.label}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-neutral-500">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 가게·메뉴 사진 (F3 #2a) */}
        <div>
          <FieldLabel error={errors.storePhotoUrls?.message}>
            가게·메뉴 사진이 있으면 올려주세요 <span className="font-normal text-neutral-500">(선택 · 최대 12장)</span>
          </FieldLabel>
          <p className="mb-2 text-xs text-neutral-500">
            실제 사진이 있으면 사이트 신뢰도가 크게 올라갑니다. 직접 촬영했거나 사용 권한이 있는 사진만 올려주세요.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {storePhotoUrls.map((url) => (
              <span key={url} className="relative">
                <img src={url} alt="가게 사진" className="h-16 w-20 rounded-md border border-neutral-700 object-cover" />
                <button
                  type="button"
                  onClick={() => removeStorePhoto(url)}
                  aria-label="사진 제거"
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-neutral-200 transition-colors hover:bg-red-800"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => storePhotoInputRef.current?.click()}
              disabled={storePhotoUploading || storePhotoUrls.length >= 12}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-700 px-3 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {storePhotoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              사진 업로드
            </button>
            <input
              ref={storePhotoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleStorePhotos(e.target.files)}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-600">최대 12장 · 5MB 이하 · PNG·JPG·WEBP</p>
        </div>

        {/* 무드보드 레퍼런스 (F3 #7) */}
        <div>
          <FieldLabel>
            마음에 드는 느낌을 골라주세요 <span className="font-normal text-neutral-500">(복수 선택 가능)</span>
          </FieldLabel>
          <p className="mb-2 text-xs text-neutral-500">고른 느낌이 디자인 후보 스타일 선택에 반영돼요.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REFERENCE_SAMPLES.map((sample) => {
              const selected = selectedSampleIds.includes(sample.id);
              return (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => toggleSample(sample.id)}
                  className={cn(
                    'group relative flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
                    selected ? 'border-[#c8a96a] ring-1 ring-[#c8a96a]/50' : 'border-neutral-800 hover:border-neutral-600',
                  )}
                >
                  <span
                    className="h-14 w-full"
                    style={{ backgroundImage: `linear-gradient(135deg, ${sample.swatch[0]}, ${sample.swatch[1]})` }}
                  />
                  <span className="p-2">
                    <span className={cn('block text-xs font-semibold', selected ? 'text-[#d9b878]' : 'text-neutral-200')}>
                      {sample.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-neutral-500">{sample.description}</span>
                  </span>
                  {selected ? (
                    <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#c8a96a] text-[10px] font-bold text-neutral-950">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* 레퍼런스 이미지 업로드 (기존 유지 — referenceImageUrls) */}
        <div>
          <FieldLabel error={errors.referenceImageUrls?.message}>
            레퍼런스 이미지 <span className="font-normal text-neutral-500">(선택 · 최대 6장)</span>
          </FieldLabel>
          <p className="mb-2 text-xs text-neutral-500">참고할 이미지가 있으면 직접 올려주세요.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={referenceImageUrls.length >= 6}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-700 px-3 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              이미지 업로드
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            {referenceImageUrls.map((url) => (
              <span key={url} className="relative">
                <img src={url} alt="업로드한 레퍼런스" className="h-12 w-16 rounded-md border border-neutral-700 object-cover" />
                <button
                  type="button"
                  onClick={() => toggleReference(url)}
                  aria-label="레퍼런스 제거"
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-neutral-200 transition-colors hover:bg-red-800"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* [F4] 콘텐츠 원문(선택) — 생성 품질의 '원료'라 설문에 유지. 예약 링크 등 '설정'은 발행 후 체크리스트로 이동 */}
        <div>
          <FieldLabel>실제 소개·메뉴 원문 <span className="font-normal text-neutral-500">(선택)</span></FieldLabel>
          <p className="mb-2 text-xs text-neutral-500">
            이미 준비된 소개 문구·메뉴·가격이 있으면 붙여넣어 주세요. AI가 창작하지 않고 이 내용을 다듬어 씁니다.
            없으면 비워두셔도 돼요 — AI가 초안을 채우고 나중에 교체할 수 있어요.
          </p>
          <textarea
            {...register('providedContent')}
            rows={4}
            placeholder="실제 소개 문구, 대표 메뉴·서비스, 가격 등을 자유롭게 붙여넣어 주세요."
            className={cn(inputClass, 'resize-none')}
          />
        </div>

        {/* ⑤ 섹션 계획표 */}
        <div>
          <FieldLabel>섹션 구성</FieldLabel>
          {!purposeId ? (
            <p className="text-xs text-neutral-600">목적을 선택하면 추천 구성이 나타납니다.</p>
          ) : (
            <>
              {isOverrideTemplate(templateId) ? (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#4a3a22] bg-[#2a2117] px-2.5 py-1 text-[11px] text-[#d9b878]">
                  {SITE_TEMPLATES.find((t) => t.id === templateId)?.label} 구성으로 추천했어요
                </div>
              ) : null}
              <p className="mb-2 text-xs text-neutral-500">
                순서와 포함 여부를 조정하세요. 히어로는 필수라 해제할 수 없어요.
              </p>
              <div className="overflow-hidden rounded-lg border border-neutral-800">
                {planRows.map((row, idx) => (
                  <div
                    key={row.key}
                    className={cn(
                      'flex items-center gap-3 border-b border-neutral-800 px-3 py-2.5 transition-colors last:border-b-0',
                      row.enabled ? '' : 'opacity-45',
                      row.key === highlightKey && 'bg-[#2a2117] ring-1 ring-inset ring-[#c8a96a]',
                    )}
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-medium text-neutral-500">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm text-neutral-100">{row.item.name}</span>
                        {row.item.source === 'ai' ? (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#2a2117] px-1.5 py-0.5 text-[9px] font-medium text-[#d9b878]">
                            <Sparkles className="h-2.5 w-2.5" />AI 추가
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-[11px] text-neutral-500">{row.item.brief}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveRow(idx, -1)}
                        disabled={idx === 0}
                        aria-label="위로 이동"
                        className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRow(idx, 1)}
                        disabled={idx === planRows.length - 1}
                        aria-label="아래로 이동"
                        className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {row.item.source === 'ai' ? (
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          aria-label={`${row.item.name} 삭제`}
                          className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-red-950/50 hover:text-red-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {row.item.required ? (
                      <span
                        aria-label="필수 섹션"
                        className="flex h-5 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-500"
                      >
                        <Lock className="h-3 w-3" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.enabled}
                        aria-label={`${row.item.name} 포함`}
                        onClick={() => toggleRow(row.key)}
                        className={cn(
                          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                          row.enabled ? 'bg-[#c8a96a]' : 'bg-neutral-700',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-4 w-4 rounded-full bg-neutral-950 transition-transform',
                            row.enabled ? 'translate-x-4' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                    )}
                  </div>
                ))}
                {/* 비활성 고정 푸터 행 */}
                <div className="flex items-center gap-3 border-t border-neutral-800 bg-neutral-900/40 px-3 py-2.5 opacity-60">
                  <span className="w-5 shrink-0" />
                  <div className="min-w-0 flex-1 text-sm text-neutral-400">푸터 — 사업자 정보(자동)</div>
                  <Lock className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
                </div>
              </div>

              {/* [v3 Phase 2] AI 섹션 개입 */}
              <div className="mt-2.5">
                <label className="mb-1.5 block text-[11px] text-neutral-500">
                  찾는 섹션이 없나요? 원하는 걸 적으면 AI가 알맞은 위치에 추가해요.
                </label>
                <div className="flex gap-2">
                  <input
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSuggest();
                      }
                    }}
                    placeholder="예: 수강 후기 영상 모음, 오시는 길 상세, 브랜드 연혁"
                    maxLength={60}
                    className={cn(inputClass, 'flex-1')}
                  />
                  <Button type="button" variant="secondary" onClick={() => void handleSuggest()} loading={suggesting} disabled={!aiInput.trim()}>
                    <Sparkles className="h-4 w-4" />
                    추가
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 추가 요청 */}
        <div>
          <FieldLabel error={errors.extraNotes?.message}>
            추가 요청사항 <span className="font-normal text-neutral-500">(선택)</span>
          </FieldLabel>
          <textarea
            {...register('extraNotes')}
            rows={3}
            placeholder="예: 대표 프로젝트를 최상단에, 상담 신청을 눈에 띄게"
            className={cn(inputClass, 'resize-none')}
          />
        </div>

        <div className="flex justify-end border-t border-neutral-800 pt-5">
          <Button type="submit" size="lg">
            디자인 후보 받기
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* 업종 변경 → 추천 구성 재적용 확인 다이얼로그 */}
      {pendingTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5">
            <h3 className="text-sm font-semibold text-neutral-100">추천 구성이 바뀌었어요</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
              선택하신 업종에는 <span className="text-[#d9b878]">{pendingTemplate.label}</span> 구성이 더 잘 맞아요.
              지금 편집한 구성을 유지할까요, 추천 구성으로 바꿀까요?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={keepCurrentPlan}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition-colors hover:border-neutral-500"
              >
                지금 구성 유지
              </button>
              <button
                type="button"
                onClick={applyPendingTemplate}
                className="rounded-lg border border-[#c8a96a] bg-[#2a2117] px-3 py-2 text-xs font-medium text-[#d9b878] transition-colors hover:bg-[#33281a]"
              >
                추천 구성 적용
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
