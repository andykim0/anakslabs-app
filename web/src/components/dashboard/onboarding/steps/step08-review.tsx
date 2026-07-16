'use client';

/**
 * S8 확인 — 전 입력 요약 카드(스텝별 편집 링크) + 추가 요청(선택) → "생성 시작"(호스트 onComplete).
 */
import { useFormContext } from 'react-hook-form';
import { Pencil } from 'lucide-react';
import type {
  CandidateStyle,
  PresenceKind,
  SiteGoalId,
  SitePurposeId,
} from '@/lib/types/domain';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import {
  IMAGE_DIRECTIONS,
  canSelectRealPhoto,
  legacyCandidateStyleToImageDirection,
} from '@/lib/assets/image-directions';
import { IMAGE_STYLE_OPTIONS, defaultImageStyle } from '@/lib/onboarding/image-style';
import { REFERENCE_SAMPLES } from '@/lib/design/reference-samples';
import { SITE_GOALS } from '@/lib/onboarding/site-goal';
import { cn } from '../../ui';
import { Field, StepIntro, deriveColors, obInput, useSurveyUx, type SurveyForm } from './shared';

const KIND_LABEL: Record<PresenceKind, string> = {
  website: '홈페이지',
  instagram: '인스타그램',
  naver_place: '네이버 플레이스',
  other: '기타',
};

function Row({
  title,
  step,
  goTo,
  children,
}: {
  title: string;
  step: number;
  goTo: (s: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ob-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] text-ob-muted">{title}</p>
        <div className="mt-0.5 text-[15px] text-ob-ink">{children}</div>
      </div>
      <button
        type="button"
        onClick={() => goTo(step)}
        className="inline-flex shrink-0 items-center gap-1 text-[13px] text-ob-accent-strong hover:underline"
      >
        <Pencil className="h-3 w-3" /> 수정
      </button>
    </div>
  );
}

function Empty() {
  return <span className="text-ob-muted">없음</span>;
}

export function Step08Review() {
  const { watch, register } = useFormContext<SurveyForm>();
  const { goTo, assetPolicyV2Ready } = useSurveyUx();
  const v = watch();

  const purpose = v.purposeId ? findPurpose(v.purposeId as SitePurposeId) : undefined;
  const legacyImageStyle = (v.imageStyle as CandidateStyle | undefined)
    ?? defaultImageStyle(v.industry);
  const legacyImageStyleLabel = IMAGE_STYLE_OPTIONS.find(
    (option) => option.id === legacyImageStyle,
  )?.label ?? legacyImageStyle;
  const realPhotoEligible = canSelectRealPhoto(v);
  const imageDirection = v.imageDirectionId
    ?? legacyCandidateStyleToImageDirection(v.imageStyle, realPhotoEligible);
  const imageDirectionLabel = IMAGE_DIRECTIONS[imageDirection].label;
  const goalLabel = v.siteGoal ? SITE_GOALS[v.siteGoal as SiteGoalId]?.label : undefined;
  const moodLabels = (v.moodIds ?? [])
    .map((id) => REFERENCE_SAMPLES.find((s) => s.id === id)?.label)
    .filter(Boolean) as string[];
  const applied = deriveColors(v);

  return (
    <div className="space-y-6">
      <StepIntro>맞으면 아래 생성 시작을 눌러주세요. 각 항목은 언제든 수정할 수 있어요.</StepIntro>

      <div className="rounded-ob border border-ob-border bg-ob-surface px-4">
        <Row title="목적 · 업종" step={1} goTo={goTo}>
          {purpose?.label ?? <Empty />}
          {v.industry ? ` · ${v.industry}` : ''}
        </Row>
        <Row title="상호명" step={1} goTo={goTo}>
          {v.businessName || <Empty />}
          {v.region ? <span className="text-ob-muted"> · {v.region}</span> : null}
        </Row>
        <Row title="한 줄 소개" step={1} goTo={goTo}>
          {v.tagline || <span className="text-ob-muted">AI가 지어드려요</span>}
        </Row>
        <Row title="기존 채널" step={2} goTo={goTo}>
          {v.existingPresence.length ? (
            v.existingPresence.map((p) => KIND_LABEL[p.kind]).join(' · ')
          ) : (
            <Empty />
          )}
        </Row>
        <Row title="소개·메뉴 원문" step={3} goTo={goTo}>
          {v.providedContent?.trim() ? (
            <span className="line-clamp-2 text-ob-muted">{v.providedContent.trim()}</span>
          ) : (
            <span className="text-ob-muted">AI가 초안을 채워드려요</span>
          )}
        </Row>
        <Row title="대표 사진" step={4} goTo={goTo}>
          {!assetPolicyV2Ready ? (
            v.heroPhotoUrl
              ? '1장 · 히어로에 사용'
              : <span className="text-ob-muted">AI가 분위기에 맞춰 연출</span>
          ) : v.heroPhotoUrl ? (
            v.heroPhotoAssetRef
              ? '1장 · 직접 업로드 등록'
              : <span className="text-ob-muted">1장 · URL 이미지(실사 근거 아님)</span>
          ) : <span className="text-ob-muted">AI가 예술적인 방향으로 연출</span>}
        </Row>
        <Row title="가게·메뉴 사진" step={4} goTo={goTo}>
          {!assetPolicyV2Ready
            ? (v.storePhotoUrls.length ? `${v.storePhotoUrls.length}장` : <Empty />)
            : v.storePhotoUrls.length
            ? `${v.storePhotoUrls.length}장 · 직접 업로드 등록 ${v.storePhotoAssetRefs.length}장`
            : <Empty />}
        </Row>
        {assetPolicyV2Ready && v.importedPhotoAssetRefs.length ? (
          <Row title="외부 채널에서 가져온 사진" step={2} goTo={goTo}>
            <span className="text-ob-muted">{v.importedPhotoAssetRefs.length}장 · 실사 사진 근거로 자동 사용 안 함</span>
          </Row>
        ) : null}
        {assetPolicyV2Ready ? (
          <Row title="실제 사진 사용 확인" step={4} goTo={goTo}>
            {v.generalAssetAttestationId ? '확인 완료' : <span className="text-ob-muted">확인 안 됨</span>}
          </Row>
        ) : null}
        {assetPolicyV2Ready && v.personPhotoAssetIds.length ? (
          <Row title="인물 사진 추가 확인" step={4} goTo={goTo}>
            {v.personPhotoAssetIds.length}장 · 자산별 확인 완료
          </Row>
        ) : null}
        {assetPolicyV2Ready && v.nonPersonPhotoAssetIds.length ? (
          <Row title="인물 없음 확인" step={4} goTo={goTo}>
            {v.nonPersonPhotoAssetIds.length}장 · 식별 가능한 인물 없음
          </Row>
        ) : null}
        <Row title={assetPolicyV2Ready ? '이미지 방향' : '이미지 스타일'} step={5} goTo={goTo}>
          {assetPolicyV2Ready ? imageDirectionLabel : legacyImageStyleLabel}
        </Row>
        <Row title="느낌 · 색" step={6} goTo={goTo}>
          <span className="inline-flex items-center gap-2">
            {applied.colorPreference ? (
              <span
                className="inline-block h-4 w-4 rounded-full border border-black/10"
                style={{ backgroundColor: applied.colorPreference }}
              />
            ) : null}
            {moodLabels.length ? moodLabels.join(', ') : applied.colorPreference || <Empty />}
          </span>
        </Row>
        <Row title="방문자 목표" step={7} goTo={goTo}>
          {goalLabel ?? <Empty />}
        </Row>
        <Row title="자랑거리" step={7} goTo={goTo}>
          {v.highlights.length ? v.highlights.join(', ') : <Empty />}
        </Row>
        <Row title="분위기(톤)" step={7} goTo={goTo}>
          {v.tone.length ? v.tone.join(', ') : <Empty />}
        </Row>
      </div>

      <Field
        label={
          <>
            추가로 요청할 내용 <span className="font-normal text-ob-muted">(선택)</span>
          </>
        }
      >
        <textarea
          {...register('extraNotes')}
          rows={3}
          placeholder="예: 대표 메뉴를 가장 위에, 예약 버튼을 눈에 띄게"
          className={cn(obInput, 'resize-none')}
        />
      </Field>
    </div>
  );
}
