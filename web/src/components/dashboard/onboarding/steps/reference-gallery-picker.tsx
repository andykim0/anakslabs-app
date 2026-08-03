'use client';

/* eslint-disable @next/next/no-img-element -- Runtime reference URLs intentionally bypass the Next image optimizer. */

/**
 * [R5] 레퍼런스 갤러리 피커 — 컴맹 소상공인은 참고 URL을 못 가져온다. 그래서 우리가 큐레이션한
 * 조합(REFERENCE_GALLERY, 뼈대×팔레트×폰트×모션)을 실제 미리보기 이미지로 보여주고 고르기만
 * 하면 된다. 최대 1개 선택(라디오식) — 부모(step06)가 surveyInputsForDesign으로 색 경로에 흘린다.
 */
import { Check } from 'lucide-react';
import { galleryForPurpose, type ReferenceDesign } from '@/lib/design/reference-gallery';
import type { LivePurposeId } from '@/lib/types/domain';
import { cn } from '../../ui';

export function ReferenceGalleryPicker({
  purposeId,
  value,
  onSelect,
}: {
  /** 1단계에서 고른 목적. 없으면(진입 전) 갤러리를 비운다 */
  purposeId: LivePurposeId | undefined;
  value: string | undefined;
  onSelect: (design: ReferenceDesign) => void;
}) {
  const designs = purposeId ? galleryForPurpose(purposeId) : [];

  if (!designs.length) {
    return (
      <p className="text-[13px] text-ob-muted">First, select a site in step 2 and a preview will appear.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {designs.map((design) => {
        const selected = value === design.id;
        return (
          <button
            key={design.id}
            type="button"
            onClick={() => onSelect(design)}
            aria-pressed={selected}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-ob border text-left transition-colors',
              selected
                ? 'border-ob-accent-strong ring-2 ring-ob-accent'
                : 'border-ob-border hover:border-ob-muted',
            )}
          >
            <span className="relative block aspect-[4/3] w-full overflow-hidden bg-ob-bg">
              <img
                src={design.previewImage}
                alt={design.label}
                loading="lazy"
                className="h-full w-full object-cover object-top transition-transform group-hover:scale-[1.03]"
              />
              {selected ? (
                <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ob-accent-strong text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span className="flex flex-col gap-1.5 p-2.5">
              <span
                className={cn(
                  'text-[13px] font-semibold',
                  selected ? 'text-ob-accent-strong' : 'text-ob-ink',
                )}
              >
                {design.label}
              </span>
              <span className="flex flex-wrap gap-1">
                {design.tone.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-ob-bg px-2 py-0.5 text-[10px] text-ob-muted"
                  >
                    {t}
                  </span>
                ))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
