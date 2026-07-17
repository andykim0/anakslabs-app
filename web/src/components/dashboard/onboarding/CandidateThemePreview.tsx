import type { DesignCandidate, SectionPlanItem, SitePurposeId } from '@/lib/types/domain';
import { heroVariantForSurvey } from '@/lib/design/reference-gallery';

export interface CandidateThemePreviewProps {
  candidate: DesignCandidate;
  heroImageUrl: string;
  businessName: string;
  tagline?: string;
  purposeId: SitePurposeId;
  referenceDesignId?: string;
  sectionPlan: readonly SectionPlanItem[];
  imageFailed: boolean;
  motionClass?: string;
  onImageError: () => void;
}

export function candidateThemePreviewLayout(
  candidateId: string,
  purposeId: SitePurposeId,
  referenceDesignId?: string,
) {
  return heroVariantForSurvey(referenceDesignId, purposeId, candidateId);
}

function ThemeImage({
  src,
  failed,
  motionClass,
  onError,
  radius,
}: {
  src: string;
  failed: boolean;
  motionClass?: string;
  onError: () => void;
  radius: number;
}) {
  if (failed) {
    return (
      <div
        data-candidate-image-fallback
        aria-hidden="true"
        className="h-full w-full bg-[linear-gradient(135deg,currentColor_1px,transparent_1px)] bg-[size:14px_14px] opacity-15"
        style={{ borderRadius: radius }}
      />
    );
  }
  return (
    // Dynamic customer/AI preview URLs may be data URLs or unconfigured remote hosts.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`h-full w-full object-cover ${motionClass ?? ''}`}
      onError={onError}
      style={{ borderRadius: radius }}
    />
  );
}

function HeroCopy({
  businessName,
  tagline,
  headingFont,
  align = 'left',
}: {
  businessName: string;
  tagline?: string;
  headingFont: string;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <div data-candidate-hero-copy style={{ textAlign: align }}>
      <p
        className="line-clamp-2 text-[15px] leading-[1.12] font-semibold tracking-[-0.04em] break-keep"
        style={{ fontFamily: headingFont, textWrap: 'balance' }}
      >
        {businessName || '우리 브랜드'}
      </p>
      <p className="mt-1.5 line-clamp-2 text-[9px] leading-[1.45] opacity-[0.72]">
        {tagline?.trim() || '가장 중요한 이야기를 첫 화면에서 분명하게 전합니다.'}
      </p>
    </div>
  );
}

function SectionRhythm({ sections, accent, muted }: { sections: readonly SectionPlanItem[]; accent: string; muted: string }) {
  const items = sections.filter((section) => !section.pageSlug).slice(0, 4);
  return (
    <div data-candidate-section-rhythm aria-hidden="true" className="flex h-4 items-end gap-1.5">
      {(items.length > 0 ? items : [{ type: 'hero' }, { type: 'about' }, { type: 'contact' }]).map((section, index) => (
        <span
          key={`${section.type}-${index}`}
          className="block rounded-full"
          style={{
            width: index === 0 ? '32%' : index === 1 ? '24%' : '16%',
            height: index === 0 ? 4 : 3,
            backgroundColor: index === 0 ? accent : muted,
            opacity: index === 0 ? 0.9 : 0.45,
          }}
        />
      ))}
    </div>
  );
}

export function CandidateThemePreview({
  candidate,
  heroImageUrl,
  businessName,
  tagline,
  purposeId,
  referenceDesignId,
  sectionPlan,
  imageFailed,
  motionClass,
  onImageError,
}: CandidateThemePreviewProps) {
  const { palette, fonts } = candidate.theme;
  const radius = Math.max(10, Math.min(candidate.theme.radius ?? 18, 28));
  const layout = candidateThemePreviewLayout(candidate.id, purposeId, referenceDesignId);
  const copyAlign = layout === 'centered' ? 'center' : layout === 'split' ? 'right' : 'left';
  const image = (
    <div className="relative h-full w-full overflow-hidden" style={{ color: palette.primary, borderRadius: radius }}>
      <ThemeImage
        src={heroImageUrl}
        failed={imageFailed}
        motionClass={motionClass}
        onError={onImageError}
        radius={radius}
      />
      <div
        data-candidate-palette-tint
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: palette.primary, mixBlendMode: 'color', opacity: 0.1, borderRadius: radius }}
      />
    </div>
  );

  return (
    <div
      data-candidate-theme-preview
      data-candidate-layout={layout}
      className="relative h-48 w-full overflow-hidden border"
      style={{
        backgroundColor: palette.background,
        borderColor: palette.muted,
        borderRadius: radius,
        color: palette.text,
        fontFamily: fonts.body,
      }}
    >
      {/* Production buildHero keeps one full-bleed background for every R2 variant;
          the variant changes the copy anchor (left / centered / right). The preview
          deliberately mirrors that contract so the selected card matches generation. */}
      <div className="absolute inset-0">{image}</div>
      <div
        data-candidate-local-scrim
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: layout === 'centered'
            ? `linear-gradient(180deg, transparent 0%, ${palette.background} 36%, ${palette.background} 72%, transparent 100%)`
            : layout === 'split'
              ? `linear-gradient(270deg, ${palette.background} 0%, ${palette.background} 42%, transparent 92%)`
              : `linear-gradient(90deg, ${palette.background} 0%, ${palette.background} 42%, transparent 92%)`,
          opacity: 0.9,
        }}
      />
      <div
        data-candidate-copy-align={copyAlign}
        className={`absolute inset-y-0 flex w-[66%] flex-col justify-center p-5 ${
          layout === 'centered' ? 'left-[17%]' : layout === 'split' ? 'right-0' : 'left-0'
        }`}
      >
        <HeroCopy
          businessName={businessName}
          tagline={tagline}
          headingFont={fonts.heading}
          align={copyAlign}
        />
      </div>

      <div
        className="absolute right-4 bottom-3 left-4 rounded-full px-2 py-1.5"
        style={{ backgroundColor: palette.surface, border: `1px solid ${palette.muted}` }}
      >
        <SectionRhythm sections={sectionPlan} accent={palette.accent} muted={palette.muted} />
      </div>
    </div>
  );
}
