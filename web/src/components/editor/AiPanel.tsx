'use client';

/**
 * AI 편집 패널.
 *  - 크레딧 잔액 표시 (GET /api/credits)
 *  - 액션: Anaks Labs 카피 수정 / AI 이미지 생성 / AI 영상 재생성 / AI 전체 섹션 재디자인
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
  { type: 'text', label: "Anaks Labs copy editing service", desc: "We will create and review the requested text." },
  { type: 'image', label: "Create a new AI image", desc: "Create a new image with description" },
  { type: 'video', label: "AI video regeneration", desc: "AI video homepage only · 8 second clip" },
  { type: 'structure', label: "AI entire section redesign", desc: "I suggest again organizing the entire section" },
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
      toast('success', "Your edit request has been received. It will be reflected after QA inspection.");
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
      toast('error', "Your request failed. Please try again later.");
    },
  });

  const cost = CREDIT_COSTS[type];
  const balance = creditsQuery.data?.balance;

  const submit = () => {
    const content = prompt.trim();
    if (!content) {
      toast('info', "Please enter your request.");
      return;
    }
    const state = useEditorStore.getState();
    const pageId = state.selectedPageId || state.config.pages[0]?.id;
    const sectionId = state.selectedSectionId ?? activeSections(state.config)[0]?.id;
    if (!pageId || !sectionId) {
      toast('error', "Please first select the page and section you want to edit.");
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
      <div className="flex items-center justify-between border-b border-[#DFE1E6] px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#232C52]">
          <Wand2 className="h-3.5 w-3.5 text-[#2D63F0]" /> AI Editing
        </span>
        <Link
          href="/dashboard/credits"
          className="flex items-center gap-1 rounded-full border border-[#9DB7EB] bg-[#EAEFFE] px-2.5 py-1 text-[11px] font-semibold text-[#2D63F0] transition-colors hover:border-[#7EA2EA]"
          title="Credit Management"
        >
          <Coins className="h-3 w-3" />
          {creditsQuery.isPending ? '…' : creditsQuery.isError ? '—' : `${balance} items`}
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
                  ? 'border-[#2D63F0] bg-[#EAEFFE]/70'
                  : 'border-[#DFE1E6] hover:border-[#AEBACC]',
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn('text-xs font-medium', type === a.type ? 'text-[#141A3A]' : 'text-[#344054]')}>
                  {a.label}
                </span>
                <span className="rounded bg-[#E8EDF5] px-1 py-0.5 text-[10px] tabular-nums text-[#2D63F0]">
                  {CREDIT_COSTS[a.type]}cr
                </span>
              </span>
              <span className="mt-0.5 block text-[10px] leading-4 text-[#6a7286]">{a.desc}</span>
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
              ? "Example) Please rewrite the hero text in a more restrained tone."
              : type === 'image'
                ? "Example) Ribs on charcoal, dark background, cinematic lighting"
                : type === 'video'
                  ? "Example) Close-up of a brazier with flames rising, 8 second loop"
                  : "Example) Please add a section introducing the 4 signature menu items."
          }
          className="w-full resize-y rounded-lg border border-[#D9DAE0] bg-white px-3 py-2 text-xs leading-5 text-[#141A3A] outline-none transition-colors placeholder:text-[#6a7286] focus:border-sky-600"
        />

        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#2D63F0] text-xs font-semibold text-white transition-colors hover:bg-[#2F6BFF] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {mutation.isPending ? "Creating AI..." : `Request (Credit${cost}dog use)`}
        </button>

        <p className="text-[10px] leading-4 text-[#6a7286]">
          Requests are reflected after AI creation and QA inspection. If creation fails, credits will be automatically refunded.
        </p>

        {/* 결과 카드 */}
        {result ? (
          <div className="rounded-lg border border-[#DFE1E6] bg-white/90 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#344054]">AI generated results</span>
              <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] text-amber-300">Waiting for QA inspection</span>
            </div>

            {result.type === 'image' && resultOutput.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultOutput.url} alt="AI generated images" className="mb-2 w-full rounded-md" />
            ) : null}
            {result.type === 'video' && resultOutput.url ? (
              <video src={resultOutput.url} poster={resultOutput.poster} controls muted playsInline className="mb-2 w-full rounded-md" />
            ) : null}
            {resultOutput.text ? (
              <p className="mb-2 max-h-36 overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-[#232C52]">
                {resultOutput.text}
              </p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="h-8 rounded-md border border-[#D9DAE0] px-3 text-xs text-[#344054] transition-colors hover:border-[#AEBACC]"
              >
                Close
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-[#6a7286]">
              Once the review is complete, the server reflects it in both the draft and published version. Your live site will not change until you are done.
            </p>
          </div>
        ) : null}
      </div>

      {/* AI 영상 홈페이지 안내 (미보유 × 영상) */}
      <Modal
        open={upsellRequest !== null}
        onClose={() => setUpsellRequest(null)}
        title="I need an AI video homepage"
        footer={
          <>
            <Link
              href="/dashboard/billing"
              className="inline-flex h-10 items-center rounded-lg border border-[#D9DAE0] bg-white px-4 text-sm text-[#232C52] transition-colors hover:border-[#AEBACC]"
            >
              AI video website consultation
            </Link>
            <Button variant="secondary" onClick={() => setUpsellRequest(null)}>
              Close
            </Button>
          </>
        }
      >
        AI video regeneration can only be used on sites with approved AI video homepages. with regular credit
        Does not bypass access rights.
      </Modal>

      {/* 크레딧 부족 모달 */}
      <Modal
        open={shortage !== null}
        onClose={() => setShortage(null)}
        title="I'm running out of credits"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShortage(null)}>
              Close
            </Button>
            <Link
              href="/dashboard/credits"
              className="inline-flex h-10 items-center rounded-lg bg-[#2D63F0] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2F6BFF]"
            >
              Buy Credits
            </Link>
          </>
        }
      >
        {shortage ? (
          <p>
            Credit to this request <b className="text-[#141A3A]">{shortage.required} items</b>is needed, but currently{' '}
            <b className="text-[#141A3A]">{shortage.balance} items</b> I have it in stock. After purchasing credits,
            Please try it.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
