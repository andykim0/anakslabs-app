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
        toast('success', '이 사이트의 색을 가져와 적용했어요.');
      } else {
        updateRow(id, {
          status: 'success',
          palette: undefined,
          message: '이 사이트에서는 뚜렷한 색을 찾지 못했어요.',
        });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '색을 가져오지 못했어요. 주소를 확인해 주세요.';
      updateRow(id, { status: 'error', message });
    }
  };

  return (
    <div className="rounded-ob border border-ob-border bg-ob-surface p-4">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[15px] font-medium text-ob-ink">참고 사이트</span>
        <span className="text-[13px] text-ob-muted">(선택)</span>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-ob-muted">
        &lsquo;세련되게&rsquo;처럼 막연한 느낌은 사람마다 떠올리는 모습이 달라요 — 마음에 드는 사이트
        주소를 알려주시면 색과 느낌을 더 정확히 맞출 수 있어요. 없으면 위에서 미리보기만 골라도 충분해요.
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
                    placeholder="예: https://example.com 또는 '○○ 느낌'"
                    aria-label={`참고 사이트 ${i + 1}`}
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
                    색 가져오기
                  </button>
                ) : null}
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label="참고 사이트 삭제"
                    className="shrink-0 text-ob-muted transition-colors hover:text-ob-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {row.status === 'success' && row.palette ? (
                <div className="flex items-center gap-2 pl-1 text-[13px] text-ob-muted">
                  <span>가져온 색</span>
                  <Swatch color={row.palette.primary} size="h-4 w-4" />
                  {row.palette.secondary ? <Swatch color={row.palette.secondary} size="h-4 w-4" /> : null}
                  <span>적용했어요.</span>
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
                  메모로만 보여드려요 — 주소(http://...)를 넣으면 색을 가져올 수 있어요.
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
          <Plus className="h-3.5 w-3.5" /> 참고 사이트 추가
        </button>
      ) : null}

      <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-ob-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        참고 사이트는 색·느낌 참고로만 써요 — 글·이미지는 복제하지 않아요.
      </p>
    </div>
  );
}

export function Step06MoodColor() {
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
      toast('info', '느낌은 최대 2개까지 고를 수 있어요.');
    } else {
      setValue('moodIds', [...moodIds, id], { shouldValidate: true });
    }
  };

  const family = COLOR_FAMILIES.find((f) => f.id === familyId) ?? COLOR_FAMILIES[0];
  const applied = deriveColors({ moodIds, colorOverride, secondaryColor });

  return (
    <div className="space-y-7">
      <StepIntro>
        마음에 드는 미리보기를 하나 고르면, 그 조합(구성·색·글꼴)으로 디자인 후보를 만들어요. 딱 맞는 게
        없으면 아래 직접 고르기로 색과 느낌만 따로 정해도 돼요.
      </StepIntro>

      {/* [R5] 주 선택: 레퍼런스 갤러리 — 실제 미리보기로 고르기 */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="text-[15px] font-medium text-ob-ink">미리보기로 고르기</span>
          <span className="rounded-full bg-ob-accent-soft px-2 py-0.5 text-[11px] font-semibold text-ob-accent-strong">
            추천
          </span>
        </div>
        <ReferenceGalleryPicker purposeId={purposeId} value={referenceDesignId} onSelect={selectDesign} />
      </div>

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
            <span className="text-[15px] font-medium text-ob-ink">직접 고르기</span>
            <span className="text-[13px] text-ob-muted">(선택)</span>
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
              느낌 카드를 고르거나 대표 색을 직접 정하면, 위 미리보기 선택 대신 이 색이 적용돼요. 최대
              2개까지 고를 수 있어요.
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
                        {isSeed ? '대표 색' : '선택'}
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
                <span className="text-[15px] font-medium text-ob-ink">우리 가게 대표 색이 따로 있어요</span>
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
                    <p className="mb-2 text-[13px] text-ob-muted">먼저 색 계열을 골라주세요.</p>
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
                    <p className="mb-2 text-[13px] text-ob-muted">밝기를 고르거나 직접 고르세요.</p>
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
                        직접 고르기
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
                          지우기
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* 보조색 (링크로만 노출) */}
                  {showSecondary ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-ob-muted">보조색</span>
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
                        비우기
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSecondary(true)}
                      className="text-[13px] text-ob-accent-strong underline"
                    >
                      보조색도 직접 고를게요
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
          <span className="text-[13px] text-ob-muted">적용될 색</span>
          <Swatch color={applied.colorPreference} />
          {applied.secondaryColor ? <Swatch color={applied.secondaryColor} /> : null}
          <span className="text-[13px] text-ob-muted">{applied.colorPreference}</span>
        </div>
      ) : (
        <p className="text-[13px] text-ob-muted">느낌을 하나 고르거나 대표 색을 직접 골라주세요.</p>
      )}
    </div>
  );
}
