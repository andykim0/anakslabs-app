'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Check, ExternalLink, Film, ImageIcon, RefreshCw, SlidersHorizontal } from 'lucide-react';
import {
  SECTION_DIRECTION_GUIDES,
  type SectionDirection,
  type SectionDirectionGuide,
  type SectionDirectionIntent,
  type SiteConfig,
} from '@/lib/types/site';
import {
  applySectionDirection,
  configForSectionReview,
  reviewTargets,
  sectionDirectionGuidesFromNote,
} from '@/lib/onboarding/section-directions';
import { SitePreview } from '../site-preview';
import { Badge, Button, Card } from '../ui';
import { saveSiteDraft } from './section-review-api';

export function SectionReviewStep({
  siteId,
  initialConfig,
  onComplete,
  onChooseHeroImage,
  onChooseHeroMotion,
}: {
  siteId: string;
  initialConfig: SiteConfig;
  onComplete: (config: SiteConfig) => void;
  /** 기존 draft를 직접 바꾸지 않고 Wizard의 이미지 선택 단계로 돌아간다. */
  onChooseHeroImage?: () => void;
  /** 기존 draft를 직접 바꾸지 않고 Wizard의 움직임 선택 단계로 돌아간다. */
  onChooseHeroMotion?: () => void;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [targetIndex, setTargetIndex] = useState(0);
  const [guided, setGuided] = useState<SectionDirectionGuide[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<SectionDirectionIntent | 'empty' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // 검수 중 레이아웃 조정으로 section 배열이 달라져도 최초 검수 목록은 건너뛰지 않는다.
  const targets = useMemo(() => reviewTargets(initialConfig), [initialConfig]);
  const target = targets[targetIndex];
  const previewConfig = useMemo(
    () => (target ? configForSectionReview(config, target.pageSlug, target.sectionId) : null),
    [config, target],
  );
  const targetSection = target
    ? config.pages
      .find((page) => page.slug === target.pageSlug)
      ?.sections.find((section) => section.id === target.sectionId)
    : undefined;
  const isHeroTarget = targetSection?.type === 'hero';
  const hasAppliedHeroVideo = Boolean(
    isHeroTarget &&
    targetSection?.background.video?.src &&
    targetSection.background.video.poster,
  );
  const previewAsAddon = Boolean(
    isHeroTarget &&
    !hasAppliedHeroVideo &&
    (config.motion?.videoAddon === true || config.motion?.videoRequested === true),
  );
  const isBusy = saving !== null;
  const matchedNoteGuides = sectionDirectionGuidesFromNote(note);
  const unsupportedNote = note.trim().length > 0 && matchedNoteGuides.length === 0;
  const hasAdjustment = guided.length > 0 || matchedNoteGuides.length > 0;

  const toggleGuide = (guide: SectionDirectionGuide) => {
    setGuided((current) =>
      current.includes(guide) ? current.filter((item) => item !== guide) : [...current, guide],
    );
  };

  const submitDirection = async (intent: SectionDirectionIntent) => {
    if (!target || isBusy) return;
    const trimmedNote = note.trim();
    const unmatchedNote = Boolean(trimmedNote) && sectionDirectionGuidesFromNote(trimmedNote).length === 0;
    if (intent === 'adjust' && guided.length === 0 && unmatchedNote) {
      setMessage('이 메모는 자동 조정 규칙과 연결되지 않았어요. 방향 칩을 하나 고르거나 에디터에서 직접 수정해 주세요.');
      return;
    }
    const direction: SectionDirection = {
      sectionId: target.sectionId,
      intent,
      ...(intent === 'adjust' && guided.length > 0 ? { guided: [...guided] } : {}),
      ...(intent === 'adjust' && trimmedNote ? { note: trimmedNote } : {}),
    };

    setSaving(intent);
    setError('');
    setMessage('');
    try {
      const nextConfig = applySectionDirection(config, direction);
      await saveSiteDraft(siteId, nextConfig);
      setConfig(nextConfig);
      setGuided([]);
      setNote('');

      if (intent === 'keep') {
        if (targetIndex === targets.length - 1) {
          onComplete(nextConfig);
        } else {
          setTargetIndex((current) => current + 1);
        }
        return;
      }

      setMessage(
        intent === 'regenerate'
          ? '좌우 배치를 바꿨어요. 같은 섹션을 다시 확인한 뒤, 괜찮으면 이대로 확정해 주세요.'
          : unmatchedNote
            ? '선택한 방향 칩만 반영했어요. 자유 메모는 자동 반영되지 않았으니 에디터에서 직접 확인해 주세요.'
            : '요청한 방향을 반영했어요. 같은 섹션을 다시 확인한 뒤, 괜찮으면 이대로 확정해 주세요.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '검수 내용을 저장하지 못했습니다.');
    } finally {
      setSaving(null);
    }
  };

  const completeEmptyReview = async () => {
    if (isBusy) return;
    setSaving('empty');
    setError('');
    try {
      await saveSiteDraft(siteId, config);
      onComplete(config);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '사이트 초안을 저장하지 못했습니다.');
    } finally {
      setSaving(null);
    }
  };

  if (!target || !previewConfig) {
    return (
      <Card className="space-y-5 border-ob-border bg-ob-surface p-6">
        <div>
          <Badge tone="blue">최종 확인</Badge>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-ob-ink">확인할 섹션이 없어요</h2>
          <p className="mt-2 text-sm leading-6 text-ob-muted">
            현재 초안을 저장하고 완료 화면으로 이동할 수 있어요.
          </p>
        </div>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ob-border pt-5">
          <EditorLink siteId={siteId} />
          <Button loading={saving === 'empty'} onClick={completeEmptyReview}>
            초안 저장하고 완료
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    );
  }

  const isLast = targetIndex === targets.length - 1;

  return (
    <div className="space-y-5">
      <Card className="space-y-5 border-ob-border bg-ob-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">섹션별 최종 확인</Badge>
              <span className="text-xs font-medium text-ob-muted">
                {targetIndex + 1} / {targets.length}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-ob-ink">
              {target.sectionName}, 이대로 보여드릴까요?
            </h2>
            <p className="mt-2 text-sm leading-6 text-ob-muted">
              <span className="font-medium text-ob-ink">{target.pageTitle}</span> 페이지를 한 섹션씩
              확인해요. 직접 확정한 섹션만 다음으로 넘어갑니다.
            </p>
          </div>
          <EditorLink siteId={siteId} />
        </div>

        {isHeroTarget && (onChooseHeroImage || onChooseHeroMotion) ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ob-border bg-ob-bg p-3">
            <p className="mr-auto text-xs leading-5 text-ob-muted">
              첫 화면의 원본 사진과 연출은 언제든 다시 골라 재생성할 수 있어요.
            </p>
            {onChooseHeroImage ? (
              <Button variant="secondary" disabled={isBusy} onClick={onChooseHeroImage}>
                <ImageIcon className="h-4 w-4" />
                대표 사진 다시 고르기
              </Button>
            ) : null}
            {onChooseHeroMotion ? (
              <Button variant="secondary" disabled={isBusy} onClick={onChooseHeroMotion}>
                <Film className="h-4 w-4" />
                움직임 다시 고르기
              </Button>
            ) : null}
          </div>
        ) : null}

        {hasAppliedHeroVideo ? (
          <div className="rounded-xl border border-ob-success/40 bg-ob-success/10 px-3 py-2 text-xs leading-5 text-ob-ink">
            <span className="font-semibold">승인 후 생성된 실제 영상 초안이에요.</span>{' '}
            아래에서 고객님의 영상과 스크롤 연출을 그대로 확인한 뒤 확정해 주세요.
          </div>
        ) : previewAsAddon ? (
          <div className="rounded-xl border border-ob-accent bg-ob-accent-soft px-3 py-2 text-xs leading-5 text-ob-ink">
            <span className="font-semibold">고른 영상 연출의 실제 스크롤 예시예요.</span>{' '}
            저장된 권한이나 발행물은 바꾸지 않고, 대표 데모 영상으로만 작동을 보여드려요. 고객님의 최종 영상은 아닙니다.
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-ob-border bg-ob-bg">
          <SitePreview
            config={previewConfig}
            mode="desktop"
            maxHeight={460}
            scroll
            motion
            previewAsAddon={previewAsAddon}
          />
        </div>

        {message ? (
          <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="rounded-xl border border-ob-border bg-ob-bg p-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-ob-accent-strong" />
              <p className="text-sm font-semibold text-ob-ink">원하는 방향으로 조금 조정</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SECTION_DIRECTION_GUIDES.map((guide) => {
                const selected = guided.includes(guide);
                return (
                  <button
                    key={guide}
                    type="button"
                    aria-pressed={selected}
                    disabled={isBusy}
                    onClick={() => toggleGuide(guide)}
                    className={
                      selected
                        ? 'rounded-full border border-ob-accent-strong bg-ob-accent-soft px-3 py-1.5 text-xs font-medium text-ob-accent-strong'
                        : 'rounded-full border border-ob-border bg-ob-surface px-3 py-1.5 text-xs font-medium text-ob-muted transition-colors hover:border-ob-muted hover:text-ob-ink'
                    }
                  >
                    {guide}
                  </button>
                );
              })}
            </div>
            <label className="mt-3 block text-xs font-medium text-ob-muted" htmlFor="section-direction-note">
              더 필요한 방향 (선택)
            </label>
            <textarea
              id="section-direction-note"
              value={note}
              maxLength={500}
              disabled={isBusy}
              onChange={(event) => setNote(event.target.value)}
              placeholder="예: 제목은 유지하고 사진 비중만 조금 키워주세요"
              className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-ob-border bg-ob-surface px-3 py-2 text-sm text-ob-ink outline-none transition-colors placeholder:text-ob-muted focus:border-ob-accent-strong"
            />
            {unsupportedNote ? (
              <p role="status" className="mt-2 text-xs leading-5 text-ob-muted">
                {guided.length > 0
                  ? '이 메모는 자동 규칙과 연결되지 않아 선택한 방향 칩만 반영돼요. 메모 내용은 에디터에서 직접 수정해 주세요.'
                  : '이 메모는 자동 조정 규칙과 연결되지 않았어요. 방향 칩을 하나 고르거나 에디터에서 직접 수정해 주세요.'}
              </p>
            ) : null}
            <Button
              variant="secondary"
              className="mt-3"
              disabled={!hasAdjustment || isBusy}
              loading={saving === 'adjust'}
              onClick={() => submitDirection('adjust')}
            >
              조정해서 다시 보기
            </Button>
          </div>

          <div className="flex min-w-56 flex-col justify-end gap-2">
            <Button
              variant="secondary"
              disabled={isBusy}
              loading={saving === 'regenerate'}
              onClick={() => submitDirection('regenerate')}
            >
              <RefreshCw className="h-4 w-4" />
              좌우 배치 바꾸기
            </Button>
            <Button
              size="lg"
              disabled={isBusy}
              loading={saving === 'keep'}
              onClick={() => submitDirection('keep')}
            >
              <Check className="h-4 w-4" />
              {isLast ? '이대로 확정하고 완료' : '이대로 확정하고 다음'}
            </Button>
          </div>
        </div>

        <p className="text-xs leading-5 text-ob-muted">
          다른 구성이나 조정을 눌러도 다음으로 자동 이동하지 않아요. 결과를 다시 보고
          <span className="font-medium text-ob-ink"> 이대로 확정</span>해야 저장된 검수가 끝나요.
        </p>
      </Card>
    </div>
  );
}

function EditorLink({ siteId }: { siteId: string }) {
  return (
    <Link
      href={`/dashboard/sites/${siteId}/editor`}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-ob-accent-strong underline-offset-4 hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      에디터에서 직접 수정
      <span className="text-ob-muted">(횟수 제한 없이 무료)</span>
    </Link>
  );
}
