'use client';

/**
 * 편집 요청 제출 폼 —
 * 유형 4종(비용 표시) · 사이트 선택 · 내용.
 * 불변식: AI 영상 홈페이지 미보유 + 영상 → 서버가 402 UPSELL_REQUIRED로 차감 전 안내를 강제하며,
 * 일반 크레딧 1회 우회는 제공하지 않는다. 문구의 원본은 서버 응답 message다.
 * 잔액 부족은 409 INSUFFICIENT_CREDITS(error.balance/required) 모달.
 */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Coins, ImagePlus, Info, LayoutList, Send, Type } from 'lucide-react';
import type { EditType, Tier } from '@/lib/types/domain';
import { CREDIT_COSTS } from '@/lib/credits/constants';
import { hasVideoAddon } from '@/lib/services/entitlements';
import {
  createEditRequest,
  insufficientInfo,
  isInsufficientCredits,
  isUpsellRequired,
  listSites,
  type ApiError,
} from './api';
import { Modal } from './modal';
import { useToast } from './toast';
import { Badge, Button, Card, cn, EDIT_TYPE_LABELS, ErrorState, Skeleton } from './ui';

const formSchema = z.object({
  siteId: z.string().min(1, '사이트를 선택해 주세요.'),
  type: z.enum(['text', 'image', 'video', 'structure']),
  requestedContent: z
    .string()
    .min(5, '요청 내용을 5자 이상 입력해 주세요.')
    .max(4000, '요청 내용은 4000자 이내로 입력해 주세요.'),
});

type FormValues = z.infer<typeof formSchema>;

const TYPE_META: { value: EditType; icon: React.ReactNode; hint: string }[] = [
  { value: 'text', icon: <Type className="h-4 w-4" />, hint: '다보임 카피 수정 대행' },
  { value: 'image', icon: <ImagePlus className="h-4 w-4" />, hint: 'AI 이미지 새로 생성' },
  { value: 'video', icon: <Clapperboard className="h-4 w-4" />, hint: 'AI 영상 재생성' },
  { value: 'structure', icon: <LayoutList className="h-4 w-4" />, hint: 'AI 전체 섹션 재디자인' },
];

/**
 * 유형별 구조화 빠른선택 칩 — 다중 선택, 선택된 라벨이 "[라벨] [라벨] " 프리픽스로
 * requestedContent 앞에 결정적으로 조립된다(순서는 항상 이 배열 순서, 클릭 순서 무관).
 * freeform=true("직접 설명")는 사용자가 자유텍스트로 쓰겠다는 의사표시일 뿐 — "[직접 설명]"
 * 자체는 AI 프롬프트에 정보가 없어 조립 프리픽스에서 제외하고, 클릭 시 자유텍스트란에 포커스만 이동한다.
 */
interface QuickChip {
  key: string;
  label: string;
  freeform?: boolean;
}

export const TYPE_QUICK_CHIPS: Record<EditType, QuickChip[]> = {
  text: [
    { key: 'friendly', label: '더 친근하게' },
    { key: 'professional', label: '더 전문적으로' },
    { key: 'shorter', label: '더 짧게' },
    { key: 'detailed', label: '더 자세히' },
    { key: 'explain', label: '직접 설명', freeform: true },
  ],
  image: [
    { key: 'mood', label: '다른 분위기' },
    { key: 'brighter', label: '더 밝게' },
    { key: 'calmer', label: '더 차분하게' },
    { key: 'brand-color', label: '브랜드 색으로' },
    { key: 'regenerate', label: '다시 생성(크레딧)' },
  ],
  video: [
    { key: 'mood', label: '다른 분위기' },
    { key: 'shorter', label: '더 짧게' },
    { key: 'explain', label: '직접 설명', freeform: true },
  ],
  structure: [
    { key: 'add-section', label: '섹션 추가' },
    { key: 'remove-section', label: '섹션 빼기' },
    { key: 'reorder', label: '순서 바꾸기' },
    { key: 'spacing', label: '간격 넓게' },
  ],
};

/** "별로예요"처럼 모호한 자유텍스트 감지 — 강제 아님, 인라인 되물음 노출용 */
export const VAGUE_TEXT_PATTERN = /별로|이상|싫/;

/** 칩 라벨 + 자유텍스트를 requestedContent로 결정적 조립 (칩 배열 순서 고정, freeform 칩은 프리픽스 제외) */
export function assembleRequestedContent(chips: QuickChip[], selectedKeys: Set<string>, extraText: string): string {
  const prefix = chips
    .filter((chip) => !chip.freeform && selectedKeys.has(chip.key))
    .map((chip) => `[${chip.label}]`)
    .join(' ');
  const extra = extraText.trim();
  if (prefix && extra) return `${prefix} ${extra}`;
  return prefix || extra;
}

interface UpsellState {
  message: string;
}

interface InsufficientState {
  message: string;
  balance: number;
  required: number;
}

export function EditRequestForm({ tier }: { tier: Tier }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [upsell, setUpsell] = useState<UpsellState | null>(null);
  const [insufficient, setInsufficient] = useState<InsufficientState | null>(null);
  // 구조화 빠른선택 상태 — 타입별 칩 key. RHF 계약(requestedContent)은 그대로 두고
  // 이 로컬 상태 + 자유텍스트를 조립해 setValue로 밀어넣는다(계약 무변경, additive 레이어).
  const [selectedChipKeys, setSelectedChipKeys] = useState<Set<string>>(new Set());
  const [extraText, setExtraText] = useState('');
  const extraTextRef = useRef<HTMLTextAreaElement>(null);

  const sitesQuery = useQuery({ queryKey: ['sites'], queryFn: listSites });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { siteId: '', type: 'text', requestedContent: '' },
  });

  const selectedType = watch('type');
  const cost = CREDIT_COSTS[selectedType];

  const chipsForType = TYPE_QUICK_CHIPS[selectedType];
  const structuredSelectedCount = chipsForType.filter(
    (chip) => !chip.freeform && selectedChipKeys.has(chip.key),
  ).length;
  const freeformSelected = chipsForType.some((chip) => chip.freeform && selectedChipKeys.has(chip.key));
  const extraTrim = extraText.trim();
  // 모호 입력 되물음: 구조화 칩(및 "직접 설명" 의사표시) 없이 자유텍스트만 짧거나 모호할 때만 — 제출은 막지 않음
  const isVagueInput =
    structuredSelectedCount === 0 &&
    !freeformSelected &&
    extraTrim.length > 0 &&
    (extraTrim.length < 8 || VAGUE_TEXT_PATTERN.test(extraTrim));

  const assembledRequestedContent = useMemo(
    () => assembleRequestedContent(chipsForType, selectedChipKeys, extraText),
    [chipsForType, selectedChipKeys, extraText],
  );

  // requestedContent는 RHF 계약(zod min(5)/max(4000))을 그대로 쓰되, 화면에는 노출하지 않고
  // 칩+자유텍스트 조립 결과를 실시간으로 채워넣는다 — 서버는 여전히 requestedContent 하나만 받는다.
  useEffect(() => {
    setValue('requestedContent', assembledRequestedContent, { shouldValidate: false });
  }, [assembledRequestedContent, setValue]);

  function toggleChip(chip: QuickChip) {
    setSelectedChipKeys((prev) => {
      const next = new Set(prev);
      if (next.has(chip.key)) {
        next.delete(chip.key);
      } else {
        next.add(chip.key);
      }
      return next;
    });
    if (chip.freeform) extraTextRef.current?.focus();
  }

  const mutation = useMutation({
    mutationFn: createEditRequest,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['edit-requests'] });
      setUpsell(null);
      setSelectedChipKeys(new Set());
      setExtraText('');
      reset({ siteId: result.editRequest.siteId, type: 'text', requestedContent: '' });
      toast(
        'success',
        result.isInitialRevision
          ? `편집 요청이 접수됐어요 — 최초 무료 수정권으로 처리(크레딧 차감 없음, 잔액 ${result.balance}개)`
          : `편집 요청이 접수됐어요 — 크레딧 ${result.editRequest.creditCost}개 차감 (잔액 ${result.balance}개)`,
      );
    },
    onError: (err, variables) => {
      if (isUpsellRequired(err)) {
        void variables;
        setUpsell({ message: (err as ApiError).message });
        return;
      }
      if (isInsufficientCredits(err)) {
        const info = insufficientInfo(err as ApiError);
        setUpsell(null);
        setInsufficient({ message: (err as ApiError).message, ...info });
        return;
      }
      toast('error', err instanceof Error ? err.message : '편집 요청 제출에 실패했습니다.');
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  const sites = sitesQuery.data ?? [];

  return (
    <>
      <Card>
        {sitesQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-20" />
          </div>
        ) : sitesQuery.isError ? (
          <ErrorState message="사이트 목록을 불러오지 못했습니다." onRetry={() => sitesQuery.refetch()} />
        ) : sites.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">
            편집을 요청할 사이트가 없습니다.{' '}
            <Link href="/onboarding" className="text-[#c8a96a] hover:underline">
              먼저 사이트를 만들어 주세요.
            </Link>
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {/* 사이트 선택 */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium text-neutral-200">대상 사이트</span>
                {errors.siteId ? <span className="text-xs text-red-400">{errors.siteId.message}</span> : null}
              </div>
              <select
                {...register('siteId')}
                className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none transition-colors focus:border-[#c8a96a]"
              >
                <option value="">사이트 선택…</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                    {site.domain ? ` (${site.domain})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 유형 */}
            <div>
              <span className="mb-2 block text-sm font-medium text-neutral-200">편집 유형</span>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {TYPE_META.map((meta) => {
                  const selected = selectedType === meta.value;
                  const isVideoOnBasic = meta.value === 'video' && !hasVideoAddon(tier);
                  return (
                    <button
                      key={meta.value}
                      type="button"
                      onClick={() => {
                        setValue('type', meta.value, { shouldValidate: true });
                        // 칩 라벨은 타입별로 다르므로 타입 전환 시 선택 초기화(자유텍스트는 유지)
                        setSelectedChipKeys(new Set());
                      }}
                      className={cn(
                        'flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        selected ? 'border-[#c8a96a] bg-[#2a2117]' : 'border-neutral-700 hover:border-neutral-500',
                      )}
                    >
                      <span className="flex items-center justify-between">
                        <span className={cn('flex items-center gap-1.5 text-xs font-medium', selected ? 'text-[#d9b878]' : 'text-neutral-300')}>
                          {meta.icon}
                          {EDIT_TYPE_LABELS[meta.value].split('(')[0].split('·')[0].trim()}
                        </span>
                        <Badge tone={selected ? 'gold' : 'neutral'}>{CREDIT_COSTS[meta.value]}</Badge>
                      </span>
                      <span className="text-[10px] text-neutral-500">
                        {isVideoOnBasic ? 'AI 영상 홈페이지 전용 — 제출 시 안내' : meta.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 내용 — 구조화 빠른선택(우선) + 자유텍스트(보조) */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium text-neutral-200">요청 내용</span>
                {errors.requestedContent ? (
                  <span className="text-xs text-red-400">{errors.requestedContent.message}</span>
                ) : null}
              </div>

              {/* 구조화 빠른선택 칩 — 다중 선택, 선택 시 requestedContent 프리픽스로 결정적 조립 */}
              <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="구조화 빠른선택">
                {chipsForType.map((chip) => {
                  const selected = selectedChipKeys.has(chip.key);
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleChip(chip)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs transition-colors',
                        selected
                          ? 'border-[#c8a96a] bg-[#2a2117] text-[#d9b878]'
                          : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200',
                      )}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              <textarea
                ref={extraTextRef}
                value={extraText}
                onChange={(e) => setExtraText(e.target.value)}
                rows={3}
                placeholder="예: 히어로 문구를 '여섯 가지 요리, 하나의 불'로 바꿔주세요"
                aria-label="덧붙일 말 (선택)"
                className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[#c8a96a]"
              />
              <p className="mt-1.5 text-[11px] text-neutral-500">
                위 빠른선택으로 구체화하면 정확해요. 덧붙일 말은 선택이에요.
              </p>

              {/* 모호 입력 되물음 — 제출을 막지 않는 부드러운 인라인 안내 */}
              {isVagueInput ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#2a2117]/60 px-3 py-2 text-[11px] leading-5 text-[#d9b878]">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  조금만 더 알려주시면 정확해요 — 색? 배치? 글? 위에서 골라주셔도 돼요.
                </p>
              ) : null}
            </div>

            <p className="rounded-lg bg-neutral-800/40 px-3 py-2 text-[11px] leading-5 text-neutral-500">
              최초 발행 후 7일 이내 첫 편집 1건은 무료입니다 (영상 제외). 무료 대상이면 제출 시 크레딧이
              차감되지 않습니다.
            </p>

            <div className="flex items-center justify-between border-t border-neutral-800 pt-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
                <Coins className="h-3.5 w-3.5 text-[#d9b878]" />
                예상 차감: <span className="font-semibold text-[#d9b878]">{cost}개</span>
              </span>
              <Button type="submit" loading={mutation.isPending}>
                <Send className="h-4 w-4" />
                요청 제출
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* 402 AI 영상 홈페이지 모달 — 영상 요청의 차감 전 안내 (불변식) */}
      <Modal
        open={upsell !== null}
        onClose={() => setUpsell(null)}
        title="AI 영상 홈페이지가 필요합니다"
        footer={
          upsell ? (
            <>
              <Link
                href="/dashboard/settings"
                className="inline-flex h-10 items-center rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
                onClick={() => setUpsell(null)}
              >
                AI 영상 홈페이지 상담
              </Link>
              <Button variant="secondary" onClick={() => setUpsell(null)}>
                닫기
              </Button>
            </>
          ) : null
        }
      >
        {upsell ? (
          <>
            <p>{upsell.message}</p>
            <p className="mt-3 rounded-lg bg-neutral-800/60 px-3 py-2 text-xs leading-5 text-neutral-400">
              영상 생성 원가 보호를 위해 일반 크레딧으로 애드온 권한을 우회할 수 없습니다.
            </p>
          </>
        ) : null}
      </Modal>

      {/* 409 잔액 부족 모달 */}
      <Modal
        open={insufficient !== null}
        onClose={() => setInsufficient(null)}
        title="크레딧이 부족합니다"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInsufficient(null)}>
              닫기
            </Button>
            <a
              href="#packs"
              onClick={() => setInsufficient(null)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              <Coins className="h-4 w-4" />
              크레딧 구매하기
            </a>
          </>
        }
      >
        {insufficient ? (
          <>
            <p>{insufficient.message}</p>
            <div className="mt-3 flex gap-4 rounded-lg bg-neutral-800/60 px-3 py-2 text-xs text-neutral-400">
              <span>
                필요 <span className="font-semibold text-neutral-100">{insufficient.required}개</span>
              </span>
              <span>
                보유 <span className="font-semibold text-red-300">{insufficient.balance}개</span>
              </span>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
