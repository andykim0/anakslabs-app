'use client';

/**
 * AI 편집 패널.
 *  - 크레딧 잔액 표시 (GET /api/credits)
 *  - 액션: 텍스트 재생성 1cr / 이미지 생성 1cr / 영상 생성 3cr(Basic은 업셀) / AI 섹션 추가 2cr
 *  - POST /api/edit-requests → 201 { editRequest, balance }
 *    · 402 UPSELL_REQUIRED → 영상 애드온 안내(크레딧 1회 우회 없음)
 *    · 409 INSUFFICIENT_CREDITS → 크레딧 구매 유도 모달
 *    · 502 AI_GENERATION_FAILED → 자동 환불 안내 토스트
 *  - 성공: "QA 검수 후 반영됩니다" 토스트 + aiOutput [바로 적용] (초안 캔버스 즉시 반영)
 */
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { EditRequest, EditType } from '@/lib/types/domain';
import type { CanvasElement } from '@/lib/types/site';
import { CREDIT_COSTS } from '@/lib/credits/constants';
import { findElementLocation, useEditorStore, activeSections} from '@/stores/editor';
import { Modal } from '@/components/dashboard/modal';
import { useToast } from '@/components/dashboard/toast';
import { Button, cn } from '@/components/dashboard/ui';
import { createEditRequest, EditorApiError, getCredits, type CreateEditRequestInput } from './api';

const ACTIONS: { type: EditType; label: string; desc: string }[] = [
  { type: 'text', label: '텍스트 재생성', desc: '카피/문구를 AI가 다시 씁니다' },
  { type: 'image', label: '이미지 생성', desc: '설명으로 이미지를 만듭니다' },
  { type: 'video', label: '영상 생성', desc: 'Premium 전용 · 8초 클립' },
  { type: 'structure', label: 'AI 섹션 추가', desc: '새 섹션 구성을 제안합니다' },
];

interface AiOutput {
  text?: string;
  url?: string;
  poster?: string;
}

/** aiOutput을 캔버스 초안에 즉시 반영 — 선택 요소 우선, 없으면 새 요소/섹션 추가 */
function applyAiOutputToCanvas(editRequest: EditRequest): boolean {
  const out = (editRequest.aiOutput ?? {}) as AiOutput;
  const store = () => useEditorStore.getState();

  const ensureSectionId = (): string => {
    const s = store();
    if (s.selectedSectionId && activeSections(s.config).some((sec) => sec.id === s.selectedSectionId)) {
      return s.selectedSectionId;
    }
    return activeSections(s.config)[0]?.id ?? s.addSection('custom');
  };

  const applyToSelectedOrNew = (
    kind: 'text' | 'image' | 'video',
    patch: Partial<CanvasElement>,
  ): boolean => {
    const s = store();
    const loc = findElementLocation(s.config, s.selectedElementId);
    if (loc && loc.element.kind === kind) {
      s.updateElement(loc.element.id, patch);
      return true;
    }
    const sectionId = ensureSectionId();
    const newId = store().addElement(sectionId, kind);
    if (!newId) return false;
    store().updateElement(newId, patch);
    return true;
  };

  switch (editRequest.type) {
    case 'text':
      if (!out.text) return false;
      return applyToSelectedOrNew('text', { text: out.text });
    case 'image':
      if (!out.url) return false;
      return applyToSelectedOrNew('image', { src: out.url });
    case 'video':
      if (!out.url) return false;
      return applyToSelectedOrNew('video', { src: out.url, poster: out.poster });
    case 'structure': {
      if (!out.text) return false;
      const sectionId = store().addSection('custom');
      store().updateSection(sectionId, { name: 'AI 제안 섹션' });
      const newId = store().addElement(sectionId, 'text');
      if (newId) {
        store().updateElement(newId, { text: out.text });
        store().updateElementFrame(newId, { x: 160, y: 120, w: 1120, h: 320 });
      }
      return true;
    }
    default:
      return false;
  }
}

export function AiPanel({ siteId }: { siteId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState<EditType>('text');
  const [prompt, setPrompt] = useState('');
  const [upsellRequest, setUpsellRequest] = useState<CreateEditRequestInput | null>(null);
  const [shortage, setShortage] = useState<{ balance: number; required: number } | null>(null);
  const [result, setResult] = useState<EditRequest | null>(null);
  const [applied, setApplied] = useState(false);

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
      setApplied(false);
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
    mutation.mutate({ siteId, type, requestedContent: content });
  };

  const handleApply = () => {
    if (!result) return;
    const ok = applyAiOutputToCanvas(result);
    if (ok) {
      setApplied(true);
      toast('success', '캔버스 초안에 적용했습니다. 발행 전까지 라이브에는 반영되지 않습니다.');
    } else {
      toast('error', '적용할 수 있는 AI 결과물이 없습니다.');
    }
  };

  const resultOutput = (result?.aiOutput ?? {}) as AiOutput;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 잔액 */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-200">
          <Wand2 className="h-3.5 w-3.5 text-[#d9b878]" /> AI 편집
        </span>
        <Link
          href="/dashboard/credits"
          className="flex items-center gap-1 rounded-full border border-[#4a3a22] bg-[#2a2117] px-2.5 py-1 text-[11px] font-semibold text-[#d9b878] transition-colors hover:border-[#6a5432]"
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
                  ? 'border-[#c8a96a] bg-[#2a2117]/70'
                  : 'border-neutral-800 hover:border-neutral-600',
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn('text-xs font-medium', type === a.type ? 'text-neutral-50' : 'text-neutral-300')}>
                  {a.label}
                </span>
                <span className="rounded bg-neutral-800 px-1 py-0.5 text-[10px] tabular-nums text-[#d9b878]">
                  {CREDIT_COSTS[a.type]}cr
                </span>
              </span>
              <span className="mt-0.5 block text-[10px] leading-4 text-neutral-500">{a.desc}</span>
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
          className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs leading-5 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-sky-600"
        />

        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#c8a96a] text-xs font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {mutation.isPending ? 'AI 생성 중…' : `요청하기 (크레딧 ${cost}개 사용)`}
        </button>

        <p className="text-[10px] leading-4 text-neutral-600">
          요청은 AI 생성 후 QA 검수를 거쳐 반영됩니다. 생성 실패 시 크레딧은 자동 환불됩니다.
        </p>

        {/* 결과 카드 */}
        {result ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300">AI 생성 결과</span>
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
              <p className="mb-2 max-h-36 overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-neutral-200">
                {resultOutput.text}
              </p>
            ) : null}

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleApply}
                disabled={applied}
                className="h-8 flex-1 rounded-md bg-sky-700 text-xs font-medium text-white transition-colors hover:bg-sky-600 disabled:opacity-50"
              >
                {applied ? '적용됨' : '바로 적용'}
              </button>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="h-8 rounded-md border border-neutral-700 px-3 text-xs text-neutral-300 transition-colors hover:border-neutral-500"
              >
                닫기
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-neutral-600">
              바로 적용 시 선택한 요소에 반영되며, 선택이 없으면 새 요소로 추가됩니다.
            </p>
          </div>
        ) : null}
      </div>

      {/* 영상 애드온 안내 (미보유 × 영상) */}
      <Modal
        open={upsellRequest !== null}
        onClose={() => setUpsellRequest(null)}
        title="영상 애드온이 필요합니다"
        footer={
          <>
            <Link
              href="/dashboard/billing"
              className="inline-flex h-10 items-center rounded-lg border border-neutral-700 bg-neutral-900 px-4 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
            >
              영상 애드온 상담
            </Link>
            <Button variant="secondary" onClick={() => setUpsellRequest(null)}>
              닫기
            </Button>
          </>
        }
      >
        영상 편집은 영상 애드온이 승인된 사이트에서만 사용할 수 있습니다. 일반 크레딧으로 애드온 권한을
        우회하지 않습니다.
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
              className="inline-flex h-10 items-center rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              크레딧 구매하기
            </Link>
          </>
        }
      >
        {shortage ? (
          <p>
            이 요청에는 크레딧 <b className="text-neutral-50">{shortage.required}개</b>가 필요하지만, 현재{' '}
            <b className="text-neutral-50">{shortage.balance}개</b> 보유 중입니다. 크레딧을 구매한 뒤 다시
            시도해 주세요.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
