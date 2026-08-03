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
  sectionDirectionGuideLabel,
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
      setMessage("This note is not associated with an auto-scaling rule. Please select a direction chip or edit it directly in the editor.");
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
          ? 'Left and right placement has been swapped. Review this section again before confirming.'
          : unmatchedNote
            ? 'Only the selected direction was applied. Free-form notes are not applied automatically; review them in the editor.'
            : 'The requested direction was applied. Review this section again before confirming.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save inspection details.");
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
      setError(cause instanceof Error ? cause.message : "Failed to save site draft.");
    } finally {
      setSaving(null);
    }
  };

  if (!target || !previewConfig) {
    return (
      <Card className="space-y-5 border-ob-border bg-ob-surface p-6">
        <div>
          <Badge tone="blue">final confirmation</Badge>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-ob-ink">There are no sections to check</h2>
          <p className="mt-2 text-sm leading-6 text-ob-muted">
            You can save the current draft and go to the completion screen.
          </p>
        </div>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ob-border pt-5">
          <EditorLink siteId={siteId} />
          <Button loading={saving === 'empty'} onClick={completeEmptyReview}>
            Save draft and finish
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
              <Badge tone="blue">Final check by section</Badge>
              <span className="text-xs font-medium text-ob-muted">
                {targetIndex + 1} / {targets.length}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-ob-ink">
              Review {target.sectionName}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ob-muted">
              Check this section on the <span className="font-medium text-ob-ink">{target.pageTitle}</span> page before continuing.
            </p>
          </div>
          <EditorLink siteId={siteId} />
        </div>

        {isHeroTarget && (onChooseHeroImage || onChooseHeroMotion) ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ob-border bg-ob-bg p-3">
            <p className="mr-auto text-xs leading-5 text-ob-muted">
              You can revisit the hero image and motion choices before publishing.
            </p>
            {onChooseHeroImage ? (
              <Button variant="secondary" disabled={isBusy} onClick={onChooseHeroImage}>
                <ImageIcon className="h-4 w-4" />
                Choose another hero image
              </Button>
            ) : null}
            {onChooseHeroMotion ? (
              <Button variant="secondary" disabled={isBusy} onClick={onChooseHeroMotion}>
                <Film className="h-4 w-4" />
                Choose another motion
              </Button>
            ) : null}
          </div>
        ) : null}

        {hasAppliedHeroVideo ? (
          <div className="rounded-xl border border-ob-success/40 bg-ob-success/10 px-3 py-2 text-xs leading-5 text-ob-ink">
            <span className="font-semibold">This video draft was created after approval.</span>{' '}
            Review the video and scroll behavior below.
          </div>
        ) : previewAsAddon ? (
          <div className="rounded-xl border border-ob-accent bg-ob-accent-soft px-3 py-2 text-xs leading-5 text-ob-ink">
            <span className="font-semibold">This is a scroll preview of the selected treatment.</span>{' '}
            It does not alter stored permissions or published content, and representative media is not your final video.
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
              <p className="text-sm font-semibold text-ob-ink">Adjust slightly in the direction you want</p>
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
                    {sectionDirectionGuideLabel(guide)}
                  </button>
                );
              })}
            </div>
            <label className="mt-3 block text-xs font-medium text-ob-muted" htmlFor="section-direction-note">
              Further needed directions (optional)
            </label>
            <textarea
              id="section-direction-note"
              value={note}
              maxLength={500}
              disabled={isBusy}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Example: Keep the title but increase the proportion of the photo a little."
              className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-ob-border bg-ob-surface px-3 py-2 text-sm text-ob-ink outline-none transition-colors placeholder:text-ob-muted focus:border-ob-accent-strong"
            />
            {unsupportedNote ? (
              <p role="status" className="mt-2 text-xs leading-5 text-ob-muted">
                {guided.length > 0
                  ? 'This note is not linked to an automatic adjustment, so only the selected direction was applied. Edit the remaining note directly in the editor.'
                  : 'This note is not linked to an automatic adjustment. Select a direction or edit the section directly.'}
              </p>
            ) : null}
            <Button
              variant="secondary"
              className="mt-3"
              disabled={!hasAdjustment || isBusy}
              loading={saving === 'adjust'}
              onClick={() => submitDirection('adjust')}
            >
              Adjust and watch again
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
              Swap left and right placement
            </Button>
            <Button
              size="lg"
              disabled={isBusy}
              loading={saving === 'keep'}
              onClick={() => submitDirection('keep')}
            >
              <Check className="h-4 w-4" />
              {isLast ? 'Confirm and finish' : 'Confirm and continue'}
            </Button>
          </div>
        </div>

        <p className="text-xs leading-5 text-ob-muted">
          Even if you click on another configuration or adjustment, it does not automatically move to the next step. look at the results again
          <span className="font-medium text-ob-ink"> Confirmed like this</span>Only then will the saved review be completed.
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
      Edit directly in the editor
      <span className="text-ob-muted">(Free and unlimited)</span>
    </Link>
  );
}
