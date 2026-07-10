'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ChevronDown, ChevronUp, ImagePlus, Loader2, Lock, Sparkles, X } from 'lucide-react';
import type { SectionPlanItem, SitePurposeId, SurveyInput } from '@/lib/types/domain';
import { PURPOSES, findPurpose, type PurposeGroup } from '@/lib/data/purpose-taxonomy';
import { SITE_TEMPLATES, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
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
  conceptMode: z.enum(['real', 'fictional']).optional(),
  logoUrl: z.string().optional(),
  industry: z.string().min(1, '업종을 선택하거나 입력해주세요.'),
  tone: z.string().min(1, '원하는 분위기를 선택하거나 입력해주세요.'),
  colorPreference: z.string().min(1, '선호 컬러를 선택하거나 입력해주세요.'),
  referenceImageUrls: z.array(z.string()).max(6, '레퍼런스 이미지는 최대 6장까지 선택할 수 있습니다.'),
  contentMode: z.enum(['ai', 'provided']).optional(),
  providedContent: z.string().max(5000, '제공 내용은 5000자 이내로 입력해주세요.').optional(),
  reservationMode: z.enum(['external_link', 'cta']).optional(),
  reservationUrl: z.string().max(500).optional(),
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

const COLOR_PRESETS: { label: string; colors: [string, string] }[] = [
  { label: '딥 차콜 & 골드', colors: ['#0f0e0c', '#b08d57'] },
  { label: '아이보리 & 에스프레소', colors: ['#f5f1e8', '#2b2118'] },
  { label: '포레스트 그린', colors: ['#1f3a2e', '#d8cfc0'] },
  { label: '미드나잇 네이비', colors: ['#10243e', '#c8d4e3'] },
  { label: '테라코타 & 샌드', colors: ['#b1502e', '#e8dcc8'] },
  { label: '모노크롬', colors: ['#111111', '#f2f2f2'] },
];

const SAMPLE_REFS: { url: string; label: string }[] = [
  { url: '/mock/refs/dark-luxury.svg', label: '다크 럭셔리' },
  { url: '/mock/refs/ivory-editorial.svg', label: '아이보리 에디토리얼' },
  { url: '/mock/refs/forest-organic.svg', label: '포레스트 오가닉' },
  { url: '/mock/refs/3d-gradient.svg', label: '3D 그라디언트' },
  { url: '/mock/refs/bold-contrast.svg', label: '볼드 콘트라스트' },
  { url: '/mock/refs/pastel-soft.svg', label: '파스텔 소프트' },
];

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
  const { toast } = useToast();
  const [logoUploading, setLogoUploading] = useState(false);

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
          conceptMode: initialValues.conceptMode ?? 'real',
          logoUrl: initialValues.logoUrl ?? '',
          industry: initialValues.industry,
          tone: initialValues.tone,
          colorPreference: initialValues.colorPreference,
          referenceImageUrls: initialValues.referenceImageUrls,
          contentMode: initialValues.contentMode ?? 'ai',
          providedContent: initialValues.providedContent ?? '',
          reservationMode: initialValues.reservationMode,
          reservationUrl: initialValues.reservationUrl ?? '',
          extraNotes: initialValues.extraNotes ?? '',
        }
      : {
          purposeId: undefined,
          businessName: '',
          tagline: '',
          conceptMode: 'real',
          logoUrl: '',
          industry: '',
          tone: '',
          colorPreference: '',
          referenceImageUrls: [],
          contentMode: 'ai',
          providedContent: '',
          reservationMode: undefined,
          reservationUrl: '',
          extraNotes: '',
        },
  });

  const purposeId = watch('purposeId') as SitePurposeId | undefined;
  const industry = watch('industry');
  const tone = watch('tone');
  const colorPreference = watch('colorPreference');
  const referenceImageUrls = watch('referenceImageUrls');
  const conceptMode = watch('conceptMode');
  const contentMode = watch('contentMode');
  const reservationMode = watch('reservationMode');
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
        survey: {
          businessName: watch('businessName') ?? '',
          industry: watch('industry') ?? '',
          purpose: selectedPurpose?.label ?? '',
          tone: watch('tone') ?? '',
          colorPreference: watch('colorPreference') ?? '',
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
    try {
      const url = await uploadImage(file);
      setValue('logoUrl', url, { shouldValidate: true });
      toast('success', '로고를 업로드했어요. 히어로 섹션에 반영됩니다.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '로고 업로드에 실패했습니다.');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);

  const onSubmit = handleSubmit((values) => {
    const pid = values.purposeId as SitePurposeId;
    const purposeDef = findPurpose(pid);
    // 활성화된 행만, 현재 순서대로 sectionPlan 구성 (source 유지)
    const sectionPlan = planRows.filter((r) => r.enabled).map((r) => r.item);
    onComplete({
      purposeId: pid,
      purpose: purposeDef?.label ?? pid,
      businessName: values.businessName,
      industry: values.industry,
      tone: values.tone,
      colorPreference: values.colorPreference,
      referenceImageUrls: values.referenceImageUrls,
      sectionPlan,
      templateId,
      tagline: clean(values.tagline),
      conceptMode: values.conceptMode,
      logoUrl: clean(values.logoUrl),
      contentMode: values.contentMode,
      providedContent: values.contentMode === 'provided' ? clean(values.providedContent) : undefined,
      reservationMode: values.reservationMode,
      reservationUrl: values.reservationMode === 'external_link' ? clean(values.reservationUrl) : undefined,
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

        {/* 컨셉 모드 */}
        <div>
          <FieldLabel>컨셉</FieldLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ['real', '실제 정보로', '입력한 정보를 그대로 반영'],
                ['fictional', '가상 컨셉으로', 'AI가 그럴듯하게 창작'],
              ] as const
            ).map(([val, label, hint]) => (
              <button
                key={val}
                type="button"
                onClick={() => setValue('conceptMode', val, { shouldValidate: true })}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  conceptMode === val ? 'border-[#c8a96a] bg-[#2a2117]' : 'border-neutral-700 hover:border-neutral-500',
                )}
              >
                <span className={cn('block text-xs font-medium', conceptMode === val ? 'text-[#d9b878]' : 'text-neutral-300')}>
                  {label}
                </span>
                <span className="mt-0.5 block text-[10px] text-neutral-500">{hint}</span>
              </button>
            ))}
          </div>
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
                  onClick={() => setValue('logoUrl', '', { shouldValidate: true })}
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
          <p className="mt-1.5 text-[11px] text-neutral-600">PNG·JPG·WEBP·SVG, 5MB 이하. SVG는 안전하게 정리 후 저장됩니다.</p>
        </div>

        {/* ④ 톤 */}
        <div>
          <FieldLabel error={errors.tone?.message}>원하는 분위기(톤)</FieldLabel>
          <div className="mb-2 flex flex-wrap gap-2">
            {TONE_CHIPS.map((chip) => (
              <Chip key={chip} selected={tone === chip} onClick={() => setField('tone', chip)}>
                {chip}
              </Chip>
            ))}
          </div>
          <input {...register('tone')} placeholder="직접 입력 (예: 고급스럽지만 부담스럽지 않게)" className={inputClass} />
        </div>

        {/* 컬러 */}
        <div>
          <FieldLabel error={errors.colorPreference?.message}>선호 컬러</FieldLabel>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COLOR_PRESETS.map((preset) => {
              const value = `${preset.label} (${preset.colors[0]}, ${preset.colors[1]})`;
              const selected = colorPreference === value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setField('colorPreference', value)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                    selected
                      ? 'border-[#c8a96a] bg-[#2a2117] text-[#d9b878]'
                      : 'border-neutral-700 text-neutral-400 hover:border-neutral-500',
                  )}
                >
                  <span className="flex shrink-0 -space-x-1">
                    {preset.colors.map((c) => (
                      <span key={c} className="h-4 w-4 rounded-full border border-neutral-950" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  {preset.label}
                </button>
              );
            })}
          </div>
          <input {...register('colorPreference')} placeholder="직접 입력 (예: 버건디 + 크림, #7a2e2e)" className={inputClass} />
        </div>

        {/* 레퍼런스 이미지 */}
        <div>
          <FieldLabel error={errors.referenceImageUrls?.message}>
            레퍼런스 이미지 <span className="font-normal text-neutral-500">(선택 · 최대 6장)</span>
          </FieldLabel>
          <p className="mb-2 text-xs text-neutral-500">
            마음에 드는 무드의 샘플을 고르거나, 참고할 이미지를 직접 올려주세요.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SAMPLE_REFS.map((sample) => {
              const selected = referenceImageUrls.includes(sample.url);
              return (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => toggleReference(sample.url)}
                  className={cn(
                    'group relative overflow-hidden rounded-lg border transition-colors',
                    selected ? 'border-[#c8a96a]' : 'border-neutral-800 hover:border-neutral-600',
                  )}
                >
                  <img src={sample.url} alt={sample.label} className="aspect-[4/3] w-full object-cover" />
                  <span
                    className={cn(
                      'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-1.5 text-left text-[11px]',
                      selected ? 'text-[#d9b878]' : 'text-neutral-300',
                    )}
                  >
                    {sample.label}
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
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
            {referenceImageUrls
              .filter((url) => !SAMPLE_REFS.some((s) => s.url === url))
              .map((url) => (
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

        {/* 예약 방식 */}
        <div>
          <FieldLabel>예약 처리 <span className="font-normal text-neutral-500">(선택)</span></FieldLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ['external_link', '외부 예약 링크', '네이버예약·캐치테이블 등으로 연결'],
                ['cta', '단순 예약 문의 CTA', '전화·문의 버튼만'],
              ] as const
            ).map(([val, label, hint]) => (
              <button
                key={val}
                type="button"
                onClick={() => setValue('reservationMode', reservationMode === val ? undefined : val, { shouldValidate: true })}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  reservationMode === val ? 'border-[#c8a96a] bg-[#2a2117]' : 'border-neutral-700 hover:border-neutral-500',
                )}
              >
                <span className={cn('block text-xs font-medium', reservationMode === val ? 'text-[#d9b878]' : 'text-neutral-300')}>
                  {label}
                </span>
                <span className="mt-0.5 block text-[10px] text-neutral-500">{hint}</span>
              </button>
            ))}
          </div>
          {reservationMode === 'external_link' ? (
            <input {...register('reservationUrl')} placeholder="예: https://booking.naver.com/…" className={cn(inputClass, 'mt-2')} />
          ) : null}
        </div>

        {/* 콘텐츠 소스 */}
        <div>
          <FieldLabel>콘텐츠 소스</FieldLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ['ai', 'AI가 채워주세요', '그럴듯한 카피 자동 생성 (나중에 교체)'],
                ['provided', '실제 내용은 내가 제공', '플레이스홀더 최소화'],
              ] as const
            ).map(([val, label, hint]) => (
              <button
                key={val}
                type="button"
                onClick={() => setValue('contentMode', val, { shouldValidate: true })}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  contentMode === val ? 'border-[#c8a96a] bg-[#2a2117]' : 'border-neutral-700 hover:border-neutral-500',
                )}
              >
                <span className={cn('block text-xs font-medium', contentMode === val ? 'text-[#d9b878]' : 'text-neutral-300')}>
                  {label}
                </span>
                <span className="mt-0.5 block text-[10px] text-neutral-500">{hint}</span>
              </button>
            ))}
          </div>
          {contentMode === 'provided' ? (
            <textarea
              {...register('providedContent')}
              rows={4}
              placeholder="실제 소개 문구, 서비스, 가격 등을 자유롭게 붙여넣어 주세요. AI가 창작하지 않고 이 내용을 다듬어 사용합니다."
              className={cn(inputClass, 'mt-2 resize-none')}
            />
          ) : null}
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
