'use client';

/**
 * AI 편집 패널.
 *  - 크레딧 잔액 표시 (GET /api/credits)
 *  - 액션: 다보임 카피 수정 / AI 이미지 생성 / AI 영상 재생성 / AI 전체 섹션 재디자인
 *  - POST /api/edit-requests → 201 { editRequest, balance }
 *    · 402 UPSELL_REQUIRED → AI 영상 홈페이지 안내(크레딧 우회 없음)
 *    · 409 INSUFFICIENT_CREDITS → 크레딧 구매 유도 모달
 *    · 502 AI_GENERATION_FAILED → 자동 환불 안내 토스트
 *  - 성공: "QA 검수 후 반영됩니다" 토스트 + aiOutput [바로 적용] (초안 캔버스 즉시 반영)
 */
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { EditRequest, EditType } from '@/lib/types/domain';
import { CREDIT_COSTS } from '@/lib/credits/constants';
import { useEditorStore, activeSections } from '@/stores/editor';
import { Modal } from '@/components/dashboard/modal';
import { useToast } from '@/components/dashboard/toast';
import { Button, cn } from '@/components/dashboard/ui';
import { createEditRequest, EditorApiError, getCredits, type CreateEditRequestInput } from './api';

const ACTIONS: { type: EditType; label: string; desc: string }[] = [
  { type: 'text', label: '다보임 카피 수정 대행', desc: '요청한 문구를 만들고 검수해 드립니다' },
  { type: 'image', label: 'AI 이미지 새로 생성', desc: '설명으로 새 이미지를 만듭니다' },
  { type: 'video', label: 'AI 영상 재생성', desc: 'AI 영상 홈페이지 전용 · 8초 클립' },
  { type: 'structure', label: 'AI 전체 섹션 재디자인', desc: '섹션 전체 구성을 다시 제안합니다' },
];

interface AiOutput {
  text?: string;
  url?: string;
  poster?: string;
}

export function AiPanel({ siteId }: { siteId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState<EditType>('text');
  const [prompt, setPrompt] = useState('');
  const [upsellRequest, setUpsellRequest] = useState<CreateEditRequestInput | null>(null);
  const [shortage, setShortage] = useState<{ balance: number; required: number } | null>(null);
  const [result, setResult] = useState<EditRequest | null>(null);

  // 인스펙터의 "AI로 생성" 버튼(aiIntent) → 액션 프리셀렉트 (렌더 중 상태 조정 패턴)
  const aiIntent = useEditorStore((s) => s.aiIntent);
  const [lastIntent, setLastIntent] = useState(aiIntent);
  if (aiIntent !== lastIntent) {
    setLastIntent(aiIntent);
    if (aiIntent) setType(aiIntent);
  }
  const selectType = (t: EditType) => {
    if (aiIntent) useEditorStore.getState().setAiIntent(null);
    setType(t);
  };

  const creditsQuery = useQuery({ queryKey: ['credits'], queryFn: getCredits });

  const mutation = useMutation({
    mutationFn: (input: CreateEditRequestInput) => createEditRequest(input),
    onSuccess: ({ editRequest }) => {
      void queryClient.invalidateQueries({ queryKey: ['credits'] });
      setResult(editRequest);
      setUpsellRequest(null);
      setPrompt('');
      toast('success', '편집 요청이 접수되었습니다. QA 검수 후 반영됩니다.');
    },
    onError: (err, variables) => {
      if (err instanceof EditorApiError) {
        if (err.code === 'UPSELL_REQUIRED') {
          setUpsellRequest(variables);
          return;
        }
        if (err.code === 'INSUFFICIENT_CREDITS') {
          setUpsellRequest(null);
          setShortage({
            balance: typeof err.extra.balance === 'number' ? err.extra.balance : 0,
            required: typeof err.extra.required === 'number' ? err.extra.required : CREDIT_COSTS[variables.type],
          });
          void queryClient.invalidateQueries({ queryKey: ['credits'] });
          return;
        }
        toast('error', err.message);
        return;
      }
      toast('error', '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    },
  });

  const cost = CREDIT_COSTS[type];
  const balance = creditsQuery.data?.balance;

  const submit = () => {
    const content = prompt.trim();
    if (!content) {
      toast('info', '요청 내용을 입력해 주세요.');
      return;
    }
    const state = useEditorStore.getState();
    const pageId = state.selectedPageId || state.config.pages[0]?.id;
    const sectionId = state.selectedSectionId ?? activeSections(state.config)[0]?.id;
    if (!pageId || !sectionId) {
      toast('error', '수정할 페이지와 섹션을 먼저 선택해 주세요.');
      return;
    }
    mutation.mutate({
      siteId,
      type,
      requestedContent: content,
      target: {
        pageId,
        sectionId,
        ...(state.selectedElementId ? { elementId: state.selectedElementId } : {}),
      },
    });
  };

  const resultOutput = (result?.aiOutput ?? {}) as AiOutput;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 잔액 */}
      <div className="flex items-center justify-between border-b border-[#DCE4F0] px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#26354D]">
          <Wand2 className="h-3.5 w-3.5 text-[#174DDA]" /> AI 편집
        </span>
        <Link
          href="/dashboard/credits"
          className="flex items-center gap-1 rounded-full border border-[#9DB7EB] bg-[#EDF4FF] px-2.5 py-1 text-[11px] font-semibold text-[#174DDA] transition-colors hover:border-[#7EA2EA]"
          title="크레딧 관리"
        >
          <Coins className="h-3 w-3" />
          {creditsQuery.isPending ? '…' : creditsQuery.isError ? '—' : `${balance}개`}
        </Link>
      </div>

      <div className="space-y-3 px-4 py-4">
        {/* 액션 선택 */}
        <div className="grid grid-cols-2 gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a.type}
              type="button"
              onClick={() => selectType(a.type)}
              className={cn(
                'rounded-lg border px-2.5 py-2 text-left transition-colors',
                type === a.type
                  ? 'border-[#174DDA] bg-[#EDF4FF]/70'
                  : 'border-[#DCE4F0] hover:border-[#AEBACC]',
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn('text-xs font-medium', type === a.type ? 'text-[#0B1736]' : 'text-[#344054]')}>
                  {a.label}
                </span>
                <span className="rounded bg-[#E8EDF5] px-1 py-0.5 text-[10px] tabular-nums text-[#174DDA]">
                  {CREDIT_COSTS[a.type]}cr
                </span>
              </span>
              <span className="mt-0.5 block text-[10px] leading-4 text-[#667085]">{a.desc}</span>
            </button>
          ))}
        </div>

        {/* 요청 내용 */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder={
            type === 'text'
              ? '예) 히어로 문구를 더 절제된 톤으로 다시 써 주세요'
              : type === 'image'
                ? '예) 숯불 위 갈비, 어두운 배경, 시네마틱 조명'
                : type === 'video'
                  ? '예) 불꽃이 피어오르는 화로 클로즈업, 8초 루프'
                  : '예) 시그니처 메뉴 4개를 소개하는 섹션을 추가해 주세요'
          }
          className="w-full resize-y rounded-lg border border-[#CAD5E5] bg-white px-3 py-2 text-xs leading-5 text-[#0B1736] outline-none transition-colors placeholder:text-[#667085] focus:border-sky-600"
        />

        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#174DDA] text-xs font-semibold text-white transition-colors hover:bg-[#245FE5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {mutation.isPending ? 'AI 생성 중…' : `요청하기 (크레딧 ${cost}개 사용)`}
        </button>

        <p className="text-[10px] leading-4 text-[#667085]">
          요청은 AI 생성 후 QA 검수를 거쳐 반영됩니다. 생성 실패 시 크레딧은 자동 환불됩니다.
        </p>

        {/* 결과 카드 */}
        {result ? (
          <div className="rounded-lg border border-[#DCE4F0] bg-white/90 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#344054]">AI 생성 결과</span>
              <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] text-amber-300">QA 검수 대기</span>
            </div>

            {result.type === 'image' && resultOutput.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultOutput.url} alt="AI 생성 이미지" className="mb-2 w-full rounded-md" />
            ) : null}
            {result.type === 'video' && resultOutput.url ? (
              <video src={resultOutput.url} poster={resultOutput.poster} controls muted playsInline className="mb-2 w-full rounded-md" />
            ) : null}
            {resultOutput.text ? (
              <p className="mb-2 max-h-36 overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-[#26354D]">
                {resultOutput.text}
              </p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="h-8 rounded-md border border-[#CAD5E5] px-3 text-xs text-[#344054] transition-colors hover:border-[#AEBACC]"
              >
                닫기
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-[#667085]">
              검수가 끝나면 서버가 초안과 발행본에 함께 반영합니다. 완료 전에는 라이브 사이트가 바뀌지 않습니다.
            </p>
          </div>
        ) : null}
      </div>

      {/* AI 영상 홈페이지 안내 (미보유 × 영상) */}
      <Modal
        open={upsellRequest !== null}
        onClose={() => setUpsellRequest(null)}
        title="AI 영상 홈페이지가 필요합니다"
        footer={
          <>
            <Link
              href="/dashboard/billing"
              className="inline-flex h-10 items-center rounded-lg border border-[#CAD5E5] bg-white px-4 text-sm text-[#26354D] transition-colors hover:border-[#AEBACC]"
            >
              AI 영상 홈페이지 상담
            </Link>
            <Button variant="secondary" onClick={() => setUpsellRequest(null)}>
              닫기
            </Button>
          </>
        }
      >
        AI 영상 재생성은 AI 영상 홈페이지가 승인된 사이트에서만 사용할 수 있습니다. 일반 크레딧으로
        이용 권한을 우회하지 않습니다.
      </Modal>

      {/* 크레딧 부족 모달 */}
      <Modal
        open={shortage !== null}
        onClose={() => setShortage(null)}
        title="크레딧이 부족합니다"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShortage(null)}>
              닫기
            </Button>
            <Link
              href="/dashboard/credits"
              className="inline-flex h-10 items-center rounded-lg bg-[#174DDA] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#245FE5]"
            >
              크레딧 구매하기
            </Link>
          </>
        }
      >
        {shortage ? (
          <p>
            이 요청에는 크레딧 <b className="text-[#0B1736]">{shortage.required}개</b>가 필요하지만, 현재{' '}
            <b className="text-[#0B1736]">{shortage.balance}개</b> 보유 중입니다. 크레딧을 구매한 뒤 다시
            시도해 주세요.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
