'use client';

import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ImagePlus, X } from 'lucide-react';
import type { SurveyInput } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import { Button, Card, cn } from '../ui';

// ---------- 스키마 ----------

const SECTION_VALUES = [
  'hero',
  'about',
  'menu',
  'gallery',
  'testimonials',
  'pricing',
  'contact',
  'cta',
] as const;

const surveySchema = z.object({
  businessName: z.string().min(1, '상호명을 입력해주세요.').max(60, '상호명은 60자 이내로 입력해주세요.'),
  industry: z.string().min(1, '업종을 선택하거나 입력해주세요.'),
  purpose: z.string().min(1, '사이트의 목적을 선택하거나 입력해주세요.'),
  tone: z.string().min(1, '원하는 분위기를 선택하거나 입력해주세요.'),
  colorPreference: z.string().min(1, '선호 컬러를 선택하거나 입력해주세요.'),
  referenceImageUrls: z.array(z.string()).max(6, '레퍼런스 이미지는 최대 6장까지 선택할 수 있습니다.'),
  sections: z.array(z.enum(SECTION_VALUES)).min(1, '섹션을 1개 이상 선택해주세요.'),
  extraNotes: z.string().max(500, '추가 요청사항은 500자 이내로 입력해주세요.').optional(),
});

type SurveyForm = z.infer<typeof surveySchema>;

// ---------- 선택지 ----------

const INDUSTRY_CHIPS = ['카페·베이커리', '레스토랑', '뷰티·살롱', '피트니스', '병원·의원', '학원·교육', '부동산', '포트폴리오'];
const PURPOSE_CHIPS = ['예약 유도', '브랜드 소개', '상품 판매', '문의 유치', '포트폴리오 공개'];
const TONE_CHIPS = ['고급스러운', '미니멀', '친근한', '대담한', '차분한', '러스틱', '모던'];

const COLOR_PRESETS: { label: string; colors: [string, string] }[] = [
  { label: '딥 차콜 & 골드', colors: ['#0f0e0c', '#b08d57'] },
  { label: '아이보리 & 에스프레소', colors: ['#f5f1e8', '#2b2118'] },
  { label: '포레스트 그린', colors: ['#1f3a2e', '#d8cfc0'] },
  { label: '미드나잇 네이비', colors: ['#10243e', '#c8d4e3'] },
  { label: '테라코타 & 샌드', colors: ['#b1502e', '#e8dcc8'] },
  { label: '모노크롬', colors: ['#111111', '#f2f2f2'] },
];

const SECTION_OPTIONS: { value: SectionType & (typeof SECTION_VALUES)[number]; label: string; hint: string }[] = [
  { value: 'hero', label: '히어로', hint: '첫 화면 비주얼' },
  { value: 'about', label: '소개', hint: '브랜드 스토리' },
  { value: 'menu', label: '메뉴·서비스', hint: '상품/서비스 목록' },
  { value: 'gallery', label: '갤러리', hint: '사진 모음' },
  { value: 'testimonials', label: '후기', hint: '고객 리뷰' },
  { value: 'pricing', label: '가격', hint: '요금 안내' },
  { value: 'contact', label: '연락처', hint: '오시는 길·문의' },
  { value: 'cta', label: '마무리 CTA', hint: '행동 유도' },
];

const DEFAULT_SECTIONS: (typeof SECTION_VALUES)[number][] = ['hero', 'about', 'menu', 'gallery', 'contact'];

const SAMPLE_REFS: { url: string; label: string }[] = [
  { url: '/mock/refs/dark-luxury.svg', label: '다크 럭셔리' },
  { url: '/mock/refs/ivory-editorial.svg', label: '아이보리 에디토리얼' },
  { url: '/mock/refs/forest-organic.svg', label: '포레스트 오가닉' },
  { url: '/mock/refs/3d-gradient.svg', label: '3D 그라디언트' },
  { url: '/mock/refs/bold-contrast.svg', label: '볼드 콘트라스트' },
  { url: '/mock/refs/pastel-soft.svg', label: '파스텔 소프트' },
];

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

const inputClass =
  'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors focus:border-[#c8a96a]';

// ---------- 본체 ----------

export function SurveyStep({
  defaultBusinessName,
  initialValues,
  onComplete,
}: {
  defaultBusinessName?: string;
  initialValues: SurveyInput | null;
  onComplete: (values: SurveyInput) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          ...initialValues,
          sections: initialValues.sections.filter((s): s is (typeof SECTION_VALUES)[number] =>
            (SECTION_VALUES as readonly string[]).includes(s),
          ),
        }
      : {
          businessName: defaultBusinessName ? `${defaultBusinessName}의 브랜드` : '',
          industry: '',
          purpose: '',
          tone: '',
          colorPreference: '',
          referenceImageUrls: [],
          sections: DEFAULT_SECTIONS,
          extraNotes: '',
        },
  });

  const industry = watch('industry');
  const purpose = watch('purpose');
  const tone = watch('tone');
  const colorPreference = watch('colorPreference');
  const referenceImageUrls = watch('referenceImageUrls');
  const sections = watch('sections');

  const setField = (name: keyof SurveyForm, value: string) =>
    setValue(name, value, { shouldValidate: true });

  const toggleSection = (value: (typeof SECTION_VALUES)[number]) => {
    const next = sections.includes(value) ? sections.filter((s) => s !== value) : [...sections, value];
    setValue('sections', next, { shouldValidate: true });
  };

  const toggleReference = (url: string) => {
    const next = referenceImageUrls.includes(url)
      ? referenceImageUrls.filter((u) => u !== url)
      : [...referenceImageUrls, url].slice(0, 6);
    setValue('referenceImageUrls', next, { shouldValidate: true });
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // 업로드 인프라 전 단계 — 브라우저 미리보기 URL을 그대로 배열에 담아 전달(mock 규약)
    const urls = Array.from(files).map((f) => URL.createObjectURL(f));
    const next = [...referenceImageUrls, ...urls].slice(0, 6);
    setValue('referenceImageUrls', next, { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onSubmit = handleSubmit((values) => {
    onComplete({
      ...values,
      extraNotes: values.extraNotes?.trim() ? values.extraNotes.trim() : undefined,
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="space-y-7 p-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-50">웹사이트 방향을 알려주세요</h2>
          <p className="mt-1 text-sm text-neutral-500">
            답변을 바탕으로 AI가 디자인 후보 3안을 제안합니다. 5분이면 충분해요.
          </p>
        </div>

        {/* 상호명 */}
        <div>
          <FieldLabel error={errors.businessName?.message}>상호명</FieldLabel>
          <input {...register('businessName')} placeholder="예: 소소한 화로" className={inputClass} />
        </div>

        {/* 업종 */}
        <div>
          <FieldLabel error={errors.industry?.message}>업종</FieldLabel>
          <div className="mb-2 flex flex-wrap gap-2">
            {INDUSTRY_CHIPS.map((chip) => (
              <Chip key={chip} selected={industry === chip} onClick={() => setField('industry', chip)}>
                {chip}
              </Chip>
            ))}
          </div>
          <input {...register('industry')} placeholder="직접 입력" className={inputClass} />
        </div>

        {/* 목적 */}
        <div>
          <FieldLabel error={errors.purpose?.message}>사이트 목적</FieldLabel>
          <div className="mb-2 flex flex-wrap gap-2">
            {PURPOSE_CHIPS.map((chip) => (
              <Chip key={chip} selected={purpose === chip} onClick={() => setField('purpose', chip)}>
                {chip}
              </Chip>
            ))}
          </div>
          <input {...register('purpose')} placeholder="직접 입력" className={inputClass} />
        </div>

        {/* 톤 */}
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
                      <span
                        key={c}
                        className="h-4 w-4 rounded-full border border-neutral-950"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                  {preset.label}
                </button>
              );
            })}
          </div>
          <input
            {...register('colorPreference')}
            placeholder="직접 입력 (예: 버건디 + 크림, #7a2e2e)"
            className={inputClass}
          />
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
                  {/* 고객 콘텐츠 이미지는 plain img 사용 규약 */}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
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

        {/* 섹션 구성 */}
        <div>
          <FieldLabel error={errors.sections?.message}>섹션 구성</FieldLabel>
          <p className="mb-2 text-xs text-neutral-500">추천 구성 5개가 기본 선택되어 있어요. 자유롭게 조정하세요.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SECTION_OPTIONS.map((opt) => {
              const selected = sections.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleSection(opt.value)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-[#c8a96a] bg-[#2a2117]'
                      : 'border-neutral-700 hover:border-neutral-500',
                  )}
                >
                  <span className={cn('block text-xs font-medium', selected ? 'text-[#d9b878]' : 'text-neutral-300')}>
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-neutral-500">{opt.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 추가 요청 */}
        <div>
          <FieldLabel error={errors.extraNotes?.message}>
            추가 요청사항 <span className="font-normal text-neutral-500">(선택)</span>
          </FieldLabel>
          <textarea
            {...register('extraNotes')}
            rows={3}
            placeholder="예: 예약 버튼을 눈에 띄게, 인스타그램 링크 포함"
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
    </form>
  );
}
