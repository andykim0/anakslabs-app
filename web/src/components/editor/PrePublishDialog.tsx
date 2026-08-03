'use client';

/**
 * 발행 전 3단계 다이얼로그.
 *  1단계 — 자동 진단.
 *  2단계 — 사업자 정보 확인: KO/default에서는 필수 입력, US에서는 선택 입력값만 확인.
 *          입력값이 있으면 "위 정보가 정확한지 확인했습니다" 체크 필수.
 *  3단계 — 휴먼 3체크 후 발행 실행.
 * 서버도 locale별 사업자 정보 정책과 휴먼 3체크를 각각 재검증한다(클라 우회 방지).
 */
import { useState } from 'react';
import { CheckCircle2, Pencil, Rocket } from 'lucide-react';
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
import { businessInfoRequiredForPublish } from '@/lib/legal/templates';

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
        <p className="text-[11px] font-medium text-[#174DDA]">privately operated site</p>
      ) : null}
      <SummaryRow label="mutual" value={info.businessName} />
      <SummaryRow label={info.isPersonal ? "operator" : "exponent"} value={info.ownerName} />
      <SummaryRow label="Business registration number" value={info.businessNumber} />
      <SummaryRow label="address" value={info.address} />
      <SummaryRow label="phone call" value={info.phone} />
      <SummaryRow label="email" value={info.email} />
      <SummaryRow label="Mail order business report" value={info.mailOrderNumber} />
    </div>
  );
}

type PrePublishDialogProps = {
  open: boolean;
  /** [G4] 발행 전 진단 조회 대상 */
  siteId: string;
  publishing: boolean;
  onClose: () => void;
  /** 발행 클릭 완료 — 실제로 체크한 값을 서버 요청에 전달 */
  onConfirmed: (humanChecks: PublishHumanChecks) => void;
};

export function PrePublishDialog(props: PrePublishDialogProps) {
  return <PrePublishDialogContent key={props.open ? 'open' : 'closed'} {...props} />;
}

function PrePublishDialogContent({
  open,
  siteId,
  publishing,
  onClose,
  onConfirmed,
}: PrePublishDialogProps) {
  const businessInfo = useEditorStore((s) => s.businessInfo);
  const businessInfoRequired = useEditorStore((s) => businessInfoRequiredForPublish(s.config));
  // [G4] 3단계: 0=진단 → 1=사업자정보 → 2=발행
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [editing, setEditing] = useState(() => businessInfoRequired && !businessInfo);
  const [confirmed, setConfirmed] = useState(false);
  const [humanChecks, setHumanChecks] = useState<PublishHumanChecks>(emptyPublishHumanChecks);
  const [qualityGateReady, setQualityGateReady] = useState(false);

  // [G4] 개선 항목 '채우기' — 사업자정보는 그 단계로, 나머지는 다이얼로그 닫고 에디터에서 편집
  const handleFix = (anchor: FixAnchor) => {
    if (anchor === 'editor:business-info') {
      setStep(1);
      setEditing(true);
    } else {
      onClose();
    }
  };

  const title = step === 0 ? "Pre-issue diagnosis (1/3)" : step === 1 ? "Check business information (2/3)" : "Published (3/3)";
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
              Complement first
            </Button>
            <Button disabled={!qualityGateReady} onClick={() => setStep(1)}>
              continue
              <Rocket className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : step === 1 && !businessInfoRequired && !businessInfo && !editing ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-[#344054]">
            Business information is optional for this site. If you add it, it will appear in the site footer.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Add business information
            </Button>
            <Button onClick={() => setStep(2)}>Continue without it</Button>
          </div>
        </div>
      ) : step === 1 ? (
        editing || !businessInfo ? (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-[#5F6B7C]">
              {businessInfoRequired
                ? 'Add the business or operator information required for publication.'
                : 'Add optional business information to show it in the site footer.'}
            </p>
            <BusinessInfoForm
              initial={businessInfo}
              submitLabel="Save and continue"
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
                    Cancel
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
              Edit information
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
                stomach {businessInfo.isPersonal ? "operator" : "business person"} We have verified that the information is accurate. published site
                It is posted with legal notation at the bottom.
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!confirmed} onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-[#26354D]">
            <CheckCircle2 className="h-4 w-4 text-[#174DDA]" />
            Business information confirmed completed
          </p>
          <p className="text-xs leading-5 text-[#5F6B7C]">
            If you publish now, your edited draft will be reflected on your live site. Subdomains can be accessed immediately,
            You can edit and republish at any time later.
          </p>
          <HumanPublishChecklist value={humanChecks} onChange={updateHumanCheck} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              disabled={!allPublishHumanChecksConfirmed(humanChecks)}
              loading={publishing}
              onClick={() => onConfirmed(humanChecks)}
            >
              <Rocket className="h-4 w-4" />
              Publish
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
