'use client';

/**
 * 편집 요청 제출 폼 —
 * 유형 4종(비용 표시) · 사이트 선택 · 내용.
 * 불변식: Basic 티어 + 영상 → 서버가 402 UPSELL_REQUIRED로 차감 전 업셀 안내를 강제하고,
 * 이 폼은 그 응답(error.message/creditCost/options)을 모달로 노출한다 (에디터와 동일 문구 규칙:
 * 문구의 원본은 서버 응답 message).
 * 잔액 부족은 409 INSUFFICIENT_CREDITS(error.balance/required) 모달.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Coins, ImagePlus, LayoutList, Send, Type } from 'lucide-react';
import type { EditType, Tier } from '@/lib/types/domain';
import { CREDIT_COSTS } from '@/lib/credits/constants';
import { hasVideoAddon } from '@/lib/services/entitlements';
import {
  createEditRequest,
  insufficientInfo,
  isInsufficientCredits,
  isUpsellRequired,
  listSites,
  upsellInfo,
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
  { value: 'text', icon: <Type className="h-4 w-4" />, hint: '문구·카피 수정' },
  { value: 'image', icon: <ImagePlus className="h-4 w-4" />, hint: 'AI 이미지 생성·교체' },
  { value: 'video', icon: <Clapperboard className="h-4 w-4" />, hint: '영상 클립 (Premium)' },
  { value: 'structure', icon: <LayoutList className="h-4 w-4" />, hint: '섹션 추가·재배치' },
];

interface UpsellState {
  message: string;
  creditCost: number;
  options: { action: string; label: string }[];
  values: FormValues;
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

  const mutation = useMutation({
    mutationFn: createEditRequest,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['edit-requests'] });
      setUpsell(null);
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
        const info = upsellInfo(err as ApiError);
        setUpsell({
          message: (err as ApiError).message,
          creditCost: info.creditCost,
          options: info.options,
          values: variables as FormValues,
        });
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
                      onClick={() => setValue('type', meta.value, { shouldValidate: true })}
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
                        {isVideoOnBasic ? 'Premium 전용 — 제출 시 안내' : meta.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 내용 */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium text-neutral-200">요청 내용</span>
                {errors.requestedContent ? (
                  <span className="text-xs text-red-400">{errors.requestedContent.message}</span>
                ) : null}
              </div>
              <textarea
                {...register('requestedContent')}
                rows={3}
                placeholder="예: 히어로 문구를 '여섯 가지 요리, 하나의 불'로 바꿔주세요"
                className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[#c8a96a]"
              />
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

      {/* 402 업셀 모달 — Basic 티어의 영상 요청, 차감 전 안내 (불변식) */}
      <Modal
        open={upsell !== null}
        onClose={() => setUpsell(null)}
        title="영상 편집은 Premium 전용입니다"
        footer={
          upsell ? (
            <>
              <Link
                href="/dashboard/settings"
                className="inline-flex h-10 items-center rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
                onClick={() => setUpsell(null)}
              >
                Premium 업그레이드 상담
              </Link>
              <Button
                loading={mutation.isPending}
                onClick={() => mutation.mutate({ ...upsell.values, confirmUpsell: true })}
              >
                크레딧 {upsell.creditCost}개 사용하고 진행
              </Button>
            </>
          ) : null
        }
      >
        {upsell ? (
          <>
            <p>{upsell.message}</p>
            <p className="mt-3 rounded-lg bg-neutral-800/60 px-3 py-2 text-xs leading-5 text-neutral-400">
              1회 진행: 크레딧 {upsell.creditCost}개 차감 · Premium 업그레이드: 영상 편집 상시 이용 + 동적
              기능 포함
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
