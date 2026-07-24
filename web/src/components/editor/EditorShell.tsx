'use client';

/**
 * PPT식 자유배치 에디터 루트 (클라이언트).
 * 대시보드 셸 위를 fixed 오버레이로 덮는 풀스크린 3패널 레이아웃:
 *   [좌] 섹션 리스트 · [중앙] 캔버스 스테이지 · [우] 인스펙터/AI 탭
 * 자동저장(2s 디바운스)·단축키·발행 플로우를 이 컴포넌트가 소유한다.
 */
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Palette, Wand2 } from 'lucide-react';
import type { SiteConfig } from '@/lib/types/site';
import type { Tier } from '@/lib/types/domain';
import type { PublishHumanChecks } from '@/lib/publish/human-checks';
import { initializeEditor, useEditorStore } from '@/stores/editor';
import { useToast } from '@/components/dashboard/toast';
import { cn } from '@/components/dashboard/ui';
import {
  confirmPublishPaymentRequest,
  EditorApiError,
  publishSiteRequest,
} from './api';
import { Toolbar } from './Toolbar';
import { SectionListPanel } from './SectionListPanel';
import { CanvasStage } from './CanvasStage';
import { Inspector } from './Inspector';
import { AiPanel } from './AiPanel';
import { PrePublishDialog } from './PrePublishDialog';
import { PublishDialog, type PublishResult } from './PublishDialog';
import { useAutosave } from './useAutosave';
import { useEditorHotkeys } from './useEditorHotkeys';
import { PublishPaymentDialog } from '@/components/publish/PublishPaymentDialog';
import {
  publishPaymentQuoteFromExtra,
  type PublishPaymentQuote,
} from '@/lib/billing/publish-payment-contract';

interface EditorShellProps {
  siteId: string;
  siteName: string;
  initialConfig: SiteConfig;
  /** [gating] 소유자 요금제 — 등장 애니메이션 게이팅(인스펙터 잠금·프리뷰) */
  tier: Tier;
}

type RightTab = 'design' | 'ai';

export function EditorShell({ siteId, siteName, initialConfig, tier }: EditorShellProps) {
  const { toast } = useToast();

  // 첫 렌더 전에 스토어 초기화 — 페이지가 key={siteId}로 마운트하므로 인스턴스당 1회.
  // (effect로 하면 빈 config가 한 프레임 노출됨. StrictMode 이중 호출에도 멱등)
  useState(() => {
    initializeEditor(siteId, initialConfig, tier);
    return siteId;
  });

  const autosave = useAutosave(siteId);
  // [T1] 나가기 목적지 — ?from=(대시보드 내부 경로만 신뢰) 우선, 폴백은 사이트 상세(딥링크 진입 대비)
  const fromParam = useSearchParams().get('from');
  const exitHref = fromParam && fromParam.startsWith('/dashboard') ? fromParam : '/dashboard/sites/' + siteId;
  useEditorHotkeys(() => void autosave.flush());

  // 인스펙터의 "AI로 생성" 클릭(aiIntent) → AI 탭으로 전환 (렌더 중 상태 조정 패턴)
  const [tab, setTab] = useState<RightTab>('design');
  const aiIntent = useEditorStore((s) => s.aiIntent);
  const [lastIntent, setLastIntent] = useState(aiIntent);
  if (aiIntent !== lastIntent) {
    setLastIntent(aiIntent);
    if (aiIntent) setTab('ai');
  }
  const selectTab = (next: RightTab) => {
    if (aiIntent) useEditorStore.getState().setAiIntent(null);
    setTab(next);
  };

  const [publishing, setPublishing] = useState(false);
  const [preparingPublish, setPreparingPublish] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [publishQuote, setPublishQuote] = useState<PublishPaymentQuote | null>(null);
  const [pendingHumanChecks, setPendingHumanChecks] = useState<PublishHumanChecks | null>(null);
  const [paying, setPaying] = useState(false);
  // [v3 Phase 4] 발행 전 2단계 확인 다이얼로그 (사업자 정보 확인 → 발행 확인)
  const [prePublishOpen, setPrePublishOpen] = useState(false);

  // 툴바 발행 버튼 → 즉시 발행이 아니라 확인 다이얼로그부터
  const handlePublishClick = async () => {
    if (publishing || preparingPublish) return;
    // 진단 컴포넌트를 마운트하기 전에 최신 draft 저장이 끝나야 한다.
    setPreparingPublish(true);
    try {
      const saved = await autosave.flush();
      if (!saved) {
        toast('error', '초안 저장에 실패해 발행 진단을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      setPrePublishOpen(true);
    } finally {
      setPreparingPublish(false);
    }
  };

  // 다이얼로그 확인 완료 → 사업자 확인 + 실제 체크값을 동봉해 발행
  const handlePublishConfirmed = async (humanChecks: PublishHumanChecks) => {
    if (publishing) return;
    setPublishing(true);
    try {
      const saved = await autosave.flush();
      if (!saved) {
        toast('error', '초안 저장에 실패해 발행을 중단했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const result = await publishSiteRequest(siteId, humanChecks);
      setPrePublishOpen(false);
      setPublishResult(result);
    } catch (err) {
      if (err instanceof EditorApiError && err.code === 'PUBLISH_PAYMENT_REQUIRED') {
        const quote = publishPaymentQuoteFromExtra(err.extra);
        if (quote) {
          setPendingHumanChecks(humanChecks);
          setPublishQuote(quote);
          setPrePublishOpen(false);
          return;
        }
      }
      if (err instanceof EditorApiError) toast('error', err.message);
      else toast('error', '발행에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishPayment = async () => {
    if (!publishQuote || !pendingHumanChecks || paying) return;
    setPaying(true);
    try {
      await confirmPublishPaymentRequest(siteId, publishQuote);
      const result = await publishSiteRequest(siteId, pendingHumanChecks);
      setPublishQuote(null);
      setPendingHumanChecks(null);
      setPublishResult(result);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '결제 확인에 실패했습니다.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F8FBFF] text-[#0B1736]">
      <Toolbar
        siteName={siteName}
        exitHref={exitHref}
        onPublish={() => void handlePublishClick()}
        publishing={publishing || preparingPublish}
        onExit={() => void autosave.flush()}
      />

      <div className="flex min-h-0 flex-1">
        <SectionListPanel />
        <CanvasStage />

        {/* 우측 패널: 디자인 / AI 탭 */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-[#DCE4F0] bg-[#F8FBFF]">
          <div className="flex shrink-0 border-b border-[#DCE4F0] p-1.5">
            <TabButton active={tab === 'design'} onClick={() => selectTab('design')} icon={<Palette className="h-3.5 w-3.5" />}>
              디자인
            </TabButton>
            <TabButton active={tab === 'ai'} onClick={() => selectTab('ai')} icon={<Wand2 className="h-3.5 w-3.5" />}>
              AI 편집
            </TabButton>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {tab === 'design' ? <Inspector /> : <AiPanel siteId={siteId} />}
          </div>
        </aside>
      </div>

      {prePublishOpen ? (
        <PrePublishDialog
          open
          siteId={siteId}
          publishing={publishing}
          onClose={() => setPrePublishOpen(false)}
          onConfirmed={(humanChecks) => void handlePublishConfirmed(humanChecks)}
        />
      ) : null}
      <PublishDialog result={publishResult} onClose={() => setPublishResult(null)} />
      <PublishPaymentDialog
        quote={publishQuote}
        paying={paying}
        onClose={() => {
          setPublishQuote(null);
          setPendingHumanChecks(null);
        }}
        onConfirm={() => void handlePublishPayment()}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-[#E8EDF5] text-[#0B1736]' : 'text-[#5F6B7C] hover:text-[#26354D]',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
