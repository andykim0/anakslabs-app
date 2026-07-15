'use client';

/**
 * 발행 전 3단계 다이얼로그.
 *  1단계 — 자동 진단.
 *  2단계 — 사업자 정보 확인: 입력값 요약(미입력이면 인라인 폼 즉시 입력),
 *          "위 정보가 정확한지 확인했습니다" 체크 필수. 개인 사이트 토글은 폼 안에.
 *  3단계 — 휴먼 3체크 후 발행 실행.
 * 서버도 사업자 정보 확인과 휴먼 3체크를 각각 요구한다(클라 우회 방지).
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Pencil, Rocket, ArrowLeft } from 'lucide-react';
import type { BusinessInfo } from '@/lib/types/site';
import { useEditorStore } from '@/stores/editor';
import { Modal } from '@/components/dashboard/modal';
import { Button, cn } from '@/components/dashboard/ui';
import { BusinessInfoForm } from './BusinessInfoForm';
import { PublishDiagnostics, type FixAnchor } from './PublishDiagnostics';
import { HumanPublishChecklist } from '@/components/publish/HumanPublishChecklist';
import {
  allPublishHumanChecksConfirmed,
  emptyPublishHumanChecks,
  type PublishHumanCheckId,
  type PublishHumanChecks,
} from '@/lib/publish/human-checks';

function SummaryRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 text-[11px] leading-5 text-[#667085]">{label}</span>
      <span className="min-w-0 flex-1 text-[#26354D]">{value}</span>
    </div>
  );
}

function BusinessInfoSummary({ info }: { info: BusinessInfo }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-[#DCE4F0] bg-[#F8FBFF] px-3.5 py-3">
      {info.isPersonal ? (
        <p className="text-[11px] font-medium text-[#174DDA]">개인 운영 사이트</p>
      ) : null}
      <SummaryRow label="상호" value={info.businessName} />
      <SummaryRow label={info.isPersonal ? '운영자' : '대표자'} value={info.ownerName} />
      <SummaryRow label="사업자등록번호" value={info.businessNumber} />
      <SummaryRow label="주소" value={info.address} />
      <SummaryRow label="전화" value={info.phone} />
      <SummaryRow label="이메일" value={info.email} />
      <SummaryRow label="통신판매업 신고" value={info.mailOrderNumber} />
    </div>
  );
}

export function PrePublishDialog({
  open,
  siteId,
  publishing,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  /** [G4] 발행 전 진단 조회 대상 */
  siteId: string;
  publishing: boolean;
  onClose: () => void;
  /** 발행 클릭 완료 — 실제로 체크한 값을 서버 요청에 전달 */
  onConfirmed: (humanChecks: PublishHumanChecks) => void;
}) {
  const businessInfo = useEditorStore((s) => s.businessInfo);
  // [G4] 3단계: 0=진단 → 1=사업자정보 → 2=발행
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [humanChecks, setHumanChecks] = useState<PublishHumanChecks>(emptyPublishHumanChecks);
  const [qualityGateReady, setQualityGateReady] = useState(false);

  // 열릴 때마다 초기화 — 진단부터. (사업자정보 미입력이면 그 단계에서 인라인 폼)
  useEffect(() => {
    if (open) {
      setStep(0);
      setEditing(!useEditorStore.getState().businessInfo);
      setConfirmed(false);
      setHumanChecks(emptyPublishHumanChecks());
      setQualityGateReady(false);
    }
  }, [open]);

  // [G4] 개선 항목 '채우기' — 사업자정보는 그 단계로, 나머지는 다이얼로그 닫고 에디터에서 편집
  const handleFix = (anchor: FixAnchor) => {
    if (anchor === 'editor:business-info') {
      setStep(1);
      setEditing(true);
    } else {
      onClose();
    }
  };

  const title = step === 0 ? '발행 전 진단 (1/3)' : step === 1 ? '사업자 정보 확인 (2/3)' : '발행 (3/3)';
  const updateHumanCheck = (id: PublishHumanCheckId, checked: boolean) => {
    setHumanChecks((current) => ({ ...current, [id]: checked }));
  };

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-lg">
      {step === 0 ? (
        <div className="space-y-4">
          <PublishDiagnostics siteId={siteId} onFix={handleFix} onGateChange={setQualityGateReady} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              먼저 보완하기
            </Button>
            <Button disabled={!qualityGateReady} onClick={() => setStep(1)}>
              계속
              <Rocket className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : step === 1 ? (
        editing || !businessInfo ? (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-[#5F6B7C]">
              발행하려면 사이트에 표기할 {businessInfo ? '' : '사업자(또는 운영자) '}정보가 필요해요.
            </p>
            <BusinessInfoForm
              initial={businessInfo}
              submitLabel="저장하고 계속"
              onSave={(info) => {
                useEditorStore.getState().setBusinessInfo(info);
                setEditing(false);
                setConfirmed(false);
              }}
              extraActions={
                businessInfo ? (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="inline-flex h-9 items-center rounded-lg border border-[#CAD5E5] px-4 text-sm text-[#344054] transition-colors hover:border-[#AEBACC]"
                  >
                    취소
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            <BusinessInfoSummary info={businessInfo} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 text-xs text-[#5F6B7C] transition-colors hover:text-[#174DDA]"
            >
              <Pencil className="h-3 w-3" />
              정보 수정하기
            </button>
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-3 transition-colors',
                confirmed ? 'border-[#174DDA] bg-[#EDF4FF]/60' : 'border-[#CAD5E5]',
              )}
            >
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#174DDA]"
              />
              <span className="text-xs leading-5 text-[#344054]">
                위 {businessInfo.isPersonal ? '운영자' : '사업자'} 정보가 정확한지 확인했습니다. 발행된 사이트
                최하단에 법적 표기로 게시됩니다.
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>
                취소
              </Button>
              <Button disabled={!confirmed} onClick={() => setStep(2)}>
                다음
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-[#26354D]">
            <CheckCircle2 className="h-4 w-4 text-[#174DDA]" />
            사업자 정보 확인 완료
          </p>
          <p className="text-xs leading-5 text-[#5F6B7C]">
            지금 발행하면 편집 중인 초안이 라이브 사이트로 반영됩니다. 서브도메인은 즉시 접속 가능하며,
            이후에도 언제든 다시 편집하고 재발행할 수 있어요.
          </p>
          <HumanPublishChecklist value={humanChecks} onChange={updateHumanCheck} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              이전
            </Button>
            <Button
              disabled={!allPublishHumanChecksConfirmed(humanChecks)}
              loading={publishing}
              onClick={() => onConfirmed(humanChecks)}
            >
              <Rocket className="h-4 w-4" />
              발행하기
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
