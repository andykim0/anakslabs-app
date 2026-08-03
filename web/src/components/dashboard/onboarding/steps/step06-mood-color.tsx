'use client';

/**
 * S6 느낌 고르기(통합) — [R5] 주 선택: 레퍼런스 갤러리(실제 미리보기, 목적별 큐레이션) 라디오 1개.
 * 고르면 뼈대(referenceDesignId)와 색(colorOverride/secondaryColor)이 함께 정해진다.
 * 보조 선택(접힘, 기본 닫힘): REFERENCE_SAMPLES 12카드(최대 2, 첫 선택=팔레트 시드) +
 * "대표 색이 따로 있어요" → COLOR_FAMILIES 8계열 → shades 5단 + 직접 고르기(colorOverride).
 * 보조색은 "보조색도 직접" 링크로만 노출. 두 경로 모두 결국 colorOverride/secondaryColor로 수렴한다.
 */
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ChevronDown, ChevronUp, Info, Link2, Loader2, Plus, X } from 'lucide-react';
import { COLOR_FAMILIES } from '@/lib/onboarding/color-families';
import { REFERENCE_SAMPLES } from '@/lib/design/reference-samples';
import { surveyInputsForDesign, type ReferenceDesign } from '@/lib/design/reference-gallery';
import type { LivePurposeId } from '@/lib/types/domain';
import { cn } from '../../ui';
import { useToast } from '../../toast';
import { ApiError, improveExtract } from '../../api';
import { ReferenceGalleryPicker } from './reference-gallery-picker';
import { StepIntro, deriveColors, type SurveyForm } from './shared';

function Swatch({ color, size = 'h-5 w-5' }: { color: string; size?: string }) {
  return (
    <span
      className={cn('inline-block rounded-full border border-black/10', size)}
      style={{ backgroundColor: color }}
    />
  );
}

// ---------- [선택] 참고 사이트 — URL이면 색만 가져오기 ----------

const MAX_REFERENCE_SITES = 3;
let refRowSeq = 0;
function nextRefId(): string {
  refRowSeq += 1;
  return `ref-${refRowSeq}`;
}

type RefStatus = 'idle' | 'loading' | 'success' | 'error';
interface RefRow {
  id: string;
  value: string;
  status: RefStatus;
  palette?: { primary: string; secondary?: string };
  message?: string;
}

function isSiteUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim());
}

/**
 * [선택] 참고 사이트 — 소상공인이 "세련되게" 같은 추상 표현을 구체화하지 못할 때, 좋아하는 사이트
 * 주소를 알려주면 색 신호를 뽑아 정확도를 높인다. R-batch 갤러리 선택이 주(primary)이고 이건 보조.
 * [저작권 안전] improveExtract(url)의 응답 중 오직 paletteSeed만 읽는다 —
 * title/description/text/headings/imageUrls/contentItems는 절대 참조하지 않는다(색 신호만 사용).
 * 비-URL 자유입력은 색 추출 대상이 아니며, 계약(SurveyForm.extraNotes)에 자동으로 흘려넣지 않고
 * 이 섹션 안에서만 메모로 보여준다(스텝 재방문 시 초기화 — 선택 보조 입력이라 무손실 저장은 안 함).
 */
function ReferenceSiteSection() {
  const { setValue } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const [rows, setRows] = useState<RefRow[]>([{ id: nextRefId(), value: '', status: 'idle' }]);

  const updateRow = (id: string, patch: Partial<RefRow>) =>
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setText = (id: string, value: string) =>
    updateRow(id, { value, status: 'idle', palette: undefined, message: undefined });

  const addRow = () => {
    if (rows.length >= MAX_REFERENCE_SITES) return;
    setRows((cur) => [...cur, { id: nextRefId(), value: '', status: 'idle' }]);
  };

  const removeRow = (id: string) =>
    setRows((cur) => (cur.length > 1 ? cur.filter((r) => r.id !== id) : cur));

  const fetchColor = async (id: string) => {
    const url = rows.find((r) => r.id === id)?.value.trim();
    if (!url || !isSiteUrl(url)) return;
    updateRow(id, { status: 'loading', message: undefined });
    try {
      const result = await improveExtract(url);
      // [저작권 안전] paletteSeed만 사용 — result.title/description/text/headings/imageUrls/contentItems는 읽지 않음
      const seed = result.paletteSeed;
      if (seed) {
        setValue('colorOverride', seed.primary, { shouldValidate: true });
        setValue('secondaryColor', seed.secondary ?? '', { shouldValidate: true });
        updateRow(id, { status: 'success', palette: seed });
        toast('success', "I took the colors from this site and applied them.");
      } else {
        updateRow(id, {
          status: 'success',
          palette: undefined,
          message: "I couldn't find any clear colors on this site.",
        });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't get the color. Please check your address.";
      updateRow(id, { status: 'error', message });
    }
  };

  return (
    <div className="rounded-ob border border-ob-border bg-ob-surface p-4">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[15px] font-medium text-ob-ink">Reference site</span>
        <span className="text-[13px] text-ob-muted">(optional)</span>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-ob-muted">
        Words like “refined” can mean different things to different people. Share a site you like
        so we can match its color and tone more precisely, or simply choose a preview above.
      </p>

      <div className="space-y-2">
        {rows.map((row, i) => {
          const urlLike = isSiteUrl(row.value);
          return (
            <div key={row.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-1.5 rounded-ob border border-ob-border bg-ob-bg px-3 py-2 focus-within:border-ob-accent-strong focus-within:ring-1 focus-within:ring-ob-accent">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-ob-muted" />
                  <input
                    value={row.value}
                    onChange={(e) => setText(row.id, e.target.value)}
                    placeholder="Example: https://example.com or '○○ feeling'"
                    aria-label={`reference site${i + 1}`}
                    className="w-full bg-transparent text-[15px] text-ob-ink outline-none placeholder:text-ob-muted/70"
                  />
                </div>
                {urlLike ? (
                  <button
                    type="button"
                    onClick={() => void fetchColor(row.id)}
                    disabled={row.status === 'loading'}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-ob border border-ob-accent-strong bg-ob-accent-soft px-3 py-2 text-[13px] font-medium text-ob-accent-strong transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {row.status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Get Color
                  </button>
                ) : null}
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label="Delete reference site"
                    className="shrink-0 text-ob-muted transition-colors hover:text-ob-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {row.status === 'success' && row.palette ? (
                <div className="flex items-center gap-2 pl-1 text-[13px] text-ob-muted">
                  <span>imported color</span>
                  <Swatch color={row.palette.primary} size="h-4 w-4" />
                  {row.palette.secondary ? <Swatch color={row.palette.secondary} size="h-4 w-4" /> : null}
                  <span>I applied it.</span>
                </div>
              ) : null}
              {row.status === 'success' && !row.palette && row.message ? (
                <p className="pl-1 text-[13px] text-ob-muted">{row.message}</p>
              ) : null}
              {row.status === 'error' && row.message ? (
                <p className="pl-1 text-[13px] text-ob-danger">{row.message}</p>
              ) : null}
              {!urlLike && row.value.trim() ? (
                <p className="pl-1 text-[13px] text-ob-muted">
                  I only show it as a note — you can get the color by entering the address (http://...).
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {rows.length < MAX_REFERENCE_SITES ? (
        <button
          type="button"
          onClick={addRow}
          className="mt-3 inline-flex items-center gap-1 text-[13px] text-ob-accent-strong hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Add reference site
        </button>
      ) : null}

      <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-ob-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Reference sites are only used for color and feel reference — text and images are not copied.
      </p>
    </div>
  );
}

export function Step06MoodColor({
  namedTemplatesEnabled = false,
}: {
  namedTemplatesEnabled?: boolean;
}) {
  const { watch, setValue } = useFormContext<SurveyForm>();
  const { toast } = useToast();
  const purposeIdRaw = watch('purposeId');
  const purposeId = (purposeIdRaw || undefined) as LivePurposeId | undefined;
  const referenceDesignId = watch('referenceDesignId');
  const moodIds = watch('moodIds') ?? [];
  const colorOverride = watch('colorOverride') ?? '';
  const secondaryColor = watch('secondaryColor') ?? '';

  const [openColor, setOpenColor] = useState(Boolean(colorOverride));
  const [familyId, setFamilyId] = useState<string>(COLOR_FAMILIES[0].id);
  const [showSecondary, setShowSecondary] = useState(Boolean(secondaryColor));
  // [R5] 직접 고르기는 보조 경로 — 기존에 무드/색을 이미 골랐던(수정 진입) 경우에만 기본으로 펼침
  const [manualOpen, setManualOpen] = useState(Boolean(moodIds.length || colorOverride));

  const selectDesign = (design: ReferenceDesign) => {
    const inputs = surveyInputsForDesign(design);
    setValue('referenceDesignId', design.id, { shouldValidate: true });
    setValue('colorOverride', inputs.colorPreference, { shouldValidate: true });
    setValue('secondaryColor', inputs.secondaryColor ?? '', { shouldValidate: true });
  };

  const toggleMood = (id: string) => {
    if (moodIds.includes(id)) {
      setValue('moodIds', moodIds.filter((m) => m !== id), { shouldValidate: true });
    } else if (moodIds.length >= 2) {
      toast('info', "You can choose up to two feelings.");
    } else {
      setValue('moodIds', [...moodIds, id], { shouldValidate: true });
    }
  };

  const family = COLOR_FAMILIES.find((f) => f.id === familyId) ?? COLOR_FAMILIES[0];
  const applied = deriveColors({ moodIds, colorOverride, secondaryColor });

  return (
    <div className="space-y-7">
      <StepIntro>
        {namedTemplatesEnabled
          ? "We will show you the actual structure appropriate for your industry in the next step. Here, you just need to tell us the color and feel for reference."
          : "Once you choose a preview you like, create a design candidate based on that combination (composition, color, font). If you don't find something that fits you perfectly, you can just choose the color and feel separately by selecting below."}
      </StepIntro>

      {/* [R5] 주 선택: 레퍼런스 갤러리 — 실제 미리보기로 고르기 */}
      {!namedTemplatesEnabled ? (
        <div>
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="text-[15px] font-medium text-ob-ink">Choose from a preview</span>
            <span className="rounded-full bg-ob-accent-soft px-2 py-0.5 text-[11px] font-semibold text-ob-accent-strong">
              suggestion
            </span>
          </div>
          <ReferenceGalleryPicker purposeId={purposeId} value={referenceDesignId} onSelect={selectDesign} />
        </div>
      ) : null}

      {/* 보조 선택: 참고 사이트(URL) — 색 신호만 추출 */}
      <ReferenceSiteSection />

      {/* 보조 선택: 무드보드 + 색 직접 고르기 (접힘) */}
      <div className="rounded-ob border border-ob-border bg-ob-surface">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-medium text-ob-ink">Pick your own</span>
            <span className="text-[13px] text-ob-muted">(select)</span>
          </span>
          {manualOpen ? (
            <ChevronUp className="h-4 w-4 text-ob-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ob-muted" />
          )}
        </button>

        {manualOpen ? (
          <div className="space-y-7 border-t border-ob-border px-4 py-4">
            <p className="text-[13px] leading-relaxed text-ob-muted">
              If you choose a feeling card or decide on a representative color, this color will be applied instead of the preview selection above. maximum
              You can choose up to 2.
            </p>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {REFERENCE_SAMPLES.map((s) => {
                const selected = moodIds.includes(s.id);
                const isSeed = moodIds[0] === s.id;
                const strip = [s.paletteSeed.primary, s.paletteSeed.secondary ?? s.swatch[1], s.swatch[0]];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleMood(s.id)}
                    aria-pressed={selected}
                    className={cn(
                      'relative flex flex-col overflow-hidden rounded-ob border text-left transition-colors',
                      selected
                        ? 'border-ob-accent-strong ring-1 ring-ob-accent'
                        : 'border-ob-border hover:border-ob-muted',
                    )}
                  >
                    <span
                      className="h-16 w-full"
                      style={{ backgroundImage: `linear-gradient(135deg, ${s.swatch[0]}, ${s.swatch[1]})` }}
                    />
                    {selected ? (
                      <span className="absolute top-1.5 right-1.5 rounded-full bg-ob-accent-strong px-2 py-0.5 text-[10px] font-bold text-white">
                        {isSeed ? "representative color" : "Select"}
                      </span>
                    ) : null}
                    <span className="flex flex-col gap-1.5 p-2.5">
                      <span
                        className={cn(
                          'text-[13px] font-semibold',
                          selected ? 'text-ob-accent-strong' : 'text-ob-ink',
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="text-[11px] leading-4 text-ob-muted">{s.description}</span>
                      <span className="mt-0.5 flex items-center gap-1">
                        {strip.map((c, i) => (
                          <Swatch key={i} color={c} size="h-4 w-4" />
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 대표 색 직접 지정 (접힘) */}
            <div className="rounded-ob border border-ob-border bg-ob-surface">
              <button
                type="button"
                onClick={() => setOpenColor((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-[15px] font-medium text-ob-ink">Our store has a different representative color.</span>
                {openColor ? (
                  <ChevronUp className="h-4 w-4 text-ob-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-ob-muted" />
                )}
              </button>

              {openColor ? (
                <div className="space-y-4 border-t border-ob-border px-4 py-4">
                  {/* 1단계: 계열 */}
                  <div>
                    <p className="mb-2 text-[13px] text-ob-muted">First, select a color family.</p>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_FAMILIES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFamilyId(f.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors',
                            familyId === f.id
                              ? 'border-ob-accent-strong bg-ob-accent-soft text-ob-accent-strong'
                              : 'border-ob-border text-ob-muted hover:border-ob-muted',
                          )}
                        >
                          <Swatch color={f.shades[2]} size="h-3.5 w-3.5" />
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2단계: 명암 5단 + 직접 고르기 */}
                  <div>
                    <p className="mb-2 text-[13px] text-ob-muted">Choose a brightness or choose your own.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {family.shades.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={hex}
                          onClick={() => setValue('colorOverride', hex, { shouldValidate: true })}
                          className={cn(
                            'h-9 w-9 rounded-ob border-2 transition-transform',
                            colorOverride.toLowerCase() === hex.toLowerCase()
                              ? 'scale-105 border-ob-accent-strong'
                              : 'border-black/10 hover:border-ob-muted',
                          )}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-ob border border-ob-border px-2.5 py-1.5 text-[13px] text-ob-muted">
                        Pick your own
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(colorOverride) ? colorOverride : '#174DDA'}
                          onChange={(e) => setValue('colorOverride', e.target.value, { shouldValidate: true })}
                          className="h-6 w-8 cursor-pointer rounded border border-ob-border bg-ob-surface"
                        />
                      </label>
                      {colorOverride ? (
                        <button
                          type="button"
                          onClick={() => setValue('colorOverride', '', { shouldValidate: true })}
                          className="text-[13px] text-ob-muted underline hover:text-ob-ink"
                        >
                          clear
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* 보조색 (링크로만 노출) */}
                  {showSecondary ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-ob-muted">Secondary color</span>
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(secondaryColor) ? secondaryColor : '#E8FBF7'}
                        onChange={(e) => setValue('secondaryColor', e.target.value, { shouldValidate: true })}
                        className="h-7 w-10 cursor-pointer rounded border border-ob-border bg-ob-surface"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setValue('secondaryColor', '', { shouldValidate: true });
                          setShowSecondary(false);
                        }}
                        className="text-[13px] text-ob-muted underline hover:text-ob-ink"
                      >
                        Empty
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSecondary(true)}
                      className="text-[13px] text-ob-accent-strong underline"
                    >
                      I will also choose the secondary color myself.
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* 적용될 색 미리보기 */}
      {applied.colorPreference ? (
        <div className="flex items-center gap-2.5 rounded-ob border border-ob-border bg-ob-bg px-4 py-3">
          <span className="text-[13px] text-ob-muted">color to be applied</span>
          <Swatch color={applied.colorPreference} />
          {applied.secondaryColor ? <Swatch color={applied.secondaryColor} /> : null}
          <span className="text-[13px] text-ob-muted">{applied.colorPreference}</span>
        </div>
      ) : (
        <p className="text-[13px] text-ob-muted">Please choose a feeling or a representative color.</p>
      )}
    </div>
  );
}
