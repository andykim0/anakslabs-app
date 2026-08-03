'use client';

/**
 * [v3 Phase 3] 온보딩 3단계 — 부가기능: 문의 폼 · 지도 · SNS 링크.
 * 1차 가공(후보 선택) 직후, 생성 전에 물어 생성 시 요소를 함께 배치한다(재생성 불필요).
 *
 * - 목적의 recommendedFeatures는 pre-check.
 * - 배치 드롭다운은 sectionPlan에서 채움 — contact:form/contact:map 행이 있으면 자동 연결.
 * - SNS는 "묶음 바(socialLinks)" vs "개별 버튼(ButtonElement)" 선택.
 * - 전부 선택사항 — "건너뛰기" 명시 버튼.
 */
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarCheck, FormInput, Map as MapIcon, Plus, Share2, X } from 'lucide-react';
import type { ExtraFeatureSelection, SectionPlanItem, SnsKind, SurveyInput } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import { mainDirectionsPageEnabled } from '@/lib/content/content-depth';
import { isHttpsUrl, isSafeMapEmbedUrl } from '@/lib/safe-url';
import { SNS_BASES, hasHandleBase, snsUrlFromHandle } from '@/lib/onboarding/sns';
import { isRecognizedReservationUrl } from '@/lib/analytics/trackable-actions';
import type { ExtrasOptionsDto } from '../api';
import { Button, Card, cn } from '../ui';

type FormFieldKey = 'name' | 'phone' | 'email' | 'message';

const FORM_FIELD_OPTIONS: { value: FormFieldKey; label: string }[] = [
  { value: 'name', label: "name" },
  { value: 'phone', label: "contact" },
  { value: 'email', label: "email" },
  { value: 'message', label: "Inquiry details" },
];

const SNS_KIND_OPTIONS: { value: SnsKind; label: string }[] = [
  { value: 'instagram', label: "Instagram" },
  { value: 'youtube', label: "YouTube" },
  { value: 'x', label: "X (Twitter)" },
  { value: 'custom', label: "Other Links" },
];

interface SnsRow {
  kind: SnsKind;
  url: string;
  label?: string;
}

/** 계획표에서 배치 후보 도출 — variant가 form/map인 contact 행이 있으면 자동 연결 대상 */
function planTargets(plan: SectionPlanItem[]): { label: string; type: SectionType; variant?: string }[] {
  return plan.map((item, i) => ({
    label: `${i + 1}. ${item.name}`,
    type: item.type,
    variant: item.variant,
  }));
}

const inputClass =
  'w-full rounded-lg border border-ob-border bg-ob-surface px-3.5 py-2.5 text-sm text-ob-ink placeholder:text-ob-muted outline-none transition-colors focus:border-ob-accent-strong';

function FeatureCard({
  icon,
  title,
  desc,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border p-4 transition-colors', enabled ? 'border-ob-accent-strong bg-ob-accent-soft' : 'border-ob-border')}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 text-left">
        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', enabled ? 'bg-ob-surface text-ob-accent-strong' : 'bg-ob-bg text-ob-muted')}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm font-semibold', enabled ? 'text-ob-accent-strong' : 'text-ob-ink')}>{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-ob-muted">{desc}</span>
        </span>
        <span
          role="switch"
          aria-checked={enabled}
          className={cn('relative mt-1 h-5 w-9 shrink-0 rounded-full transition-colors', enabled ? 'bg-ob-accent' : 'bg-ob-border')}
        >
          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-ob-ink transition-transform', enabled ? 'translate-x-4' : 'translate-x-0.5')} />
        </span>
      </button>
      {enabled && children ? <div className="mt-4 space-y-3 border-t border-ob-border pt-4">{children}</div> : null}
    </div>
  );
}

export function ExtrasStep({
  survey,
  onBack,
  onComplete,
}: {
  survey: SurveyInput;
  onBack: () => void;
  onComplete: (extras: ExtraFeatureSelection | undefined, options: ExtrasOptionsDto | undefined) => void;
}) {
  const purpose = findPurpose(survey.purposeId);
  const recommended = new Set(purpose?.recommendedFeatures ?? []);
  const targets = planTargets(survey.sectionPlan);

  const formRow = targets.find((t) => t.variant === 'contact:form');
  const mapRow = targets.find((t) => t.variant === 'contact:map');
  const hasMainDirectionsPage = mainDirectionsPageEnabled(survey);

  // 실제 외부 예약 링크 — 예약이 목표일 때만 추천으로 켜고, URL은 사용자가 직접 확정한다.
  // 레거시 survey.reservationUrl은 같은 엄격한 allowlist를 통과할 때만 편의상 프리필한다.
  const briefDestination = survey.contentDepth?.surveyBrief?.conversionDestination;
  const briefReservationUrl = briefDestination?.kind === 'reservation_url' ? briefDestination.url : undefined;
  const initialReservationUrl = (briefReservationUrl ?? survey.reservationUrl) && isRecognizedReservationUrl(briefReservationUrl ?? survey.reservationUrl ?? '')
    ? (briefReservationUrl ?? survey.reservationUrl ?? '')
    : '';
  const [reservationOn, setReservationOn] = useState(
    survey.siteGoal === 'reserve' || Boolean(initialReservationUrl),
  );
  const [reservationUrl, setReservationUrl] = useState(initialReservationUrl);
  const reservationInvalid = reservationUrl.trim() !== '' && !isRecognizedReservationUrl(reservationUrl);

  // 문의 폼
  const [formOn, setFormOn] = useState(
    briefDestination?.kind === 'contact_form' || recommended.has('contactForm'),
  );
  const [formFields, setFormFields] = useState<FormFieldKey[]>(['name', 'phone', 'message']);
  const [formTarget, setFormTarget] = useState<SectionType>(formRow?.type ?? 'contact');

  // 지도
  const [mapOn, setMapOn] = useState(recommended.has('mapEmbed'));
  const [mapUrl, setMapUrl] = useState('');
  const [mapTarget, setMapTarget] = useState<SectionType>(mapRow?.type ?? 'contact');
  const mapInvalid = mapUrl.trim() !== '' && !isSafeMapEmbedUrl(mapUrl.trim());

  // SNS
  const [snsOn, setSnsOn] = useState(recommended.has('snsLinks'));
  const [snsRows, setSnsRows] = useState<SnsRow[]>([{ kind: 'instagram', url: '' }]);
  const [snsStyle, setSnsStyle] = useState<'bar' | 'buttons'>('bar');

  const [error, setError] = useState('');

  const toggleFormField = (f: FormFieldKey) => {
    setFormFields((prev) => {
      const has = prev.includes(f);
      const next = has ? prev.filter((x) => x !== f) : [...prev, f];
      if (next.length === 0) return prev; // 최소 1개
      return FORM_FIELD_OPTIONS.map((o) => o.value).filter((v) => next.includes(v));
    });
  };

  const submit = () => {
    setError('');
    const extras: ExtraFeatureSelection = {};
    const options: ExtrasOptionsDto = {};

    if (reservationOn) {
      const url = reservationUrl.trim();
      if (!url || !isRecognizedReservationUrl(url)) {
        setError("Please check the reservation link — you can only use https:// addresses for supported reservation services.");
        return;
      }
      extras.reservationLink = { url };
    }

    if (formOn) {
      extras.contactForm = { targetSection: formTarget };
      options.formFields = formFields;
    }
    if (mapOn) {
      const url = mapUrl.trim();
      if (!url || !isSafeMapEmbedUrl(url)) {
        setError("Please enter a valid Google Maps embed URL.");
        return;
      }
      extras.mapEmbed = {
        embedUrl: url,
        targetSection: mapTarget,
        // MAIN v1은 전체 지도와 방문 정보를 홈 요약이 아닌 완결된 오시는 길 페이지에 둔다.
        ...(hasMainDirectionsPage && mapTarget === 'contact' ? { targetPageSlug: 'directions' } : {}),
      };
    }
    if (snsOn) {
      // [v4 #6c] 핸들/풀URL 어느 쪽이든 snsUrlFromHandle로 정규화(계약=풀URL 저장 불변).
      const valid = snsRows
        .map((r) => ({ kind: r.kind, url: snsUrlFromHandle(r.kind, r.url.trim()), label: r.label }))
        .filter((r) => r.url.trim() !== '' && isHttpsUrl(r.url));
      if (valid.length === 0) {
        setError("Please enter at least one SNS ID or link.");
        return;
      }
      extras.snsLinks = valid.map((r) => ({ kind: r.kind, url: r.url, label: r.label?.trim() || undefined }));
      options.snsStyle = snsStyle;
    }

    const any = extras.reservationLink || extras.contactForm || extras.mapEmbed || extras.snsLinks;
    // 신규 온보딩은 네이티브 커넥터 manifest를 서버가 계산하도록 버전만 요청한다.
    // 실제 connector URL·종류는 이 클라이언트 값이 아니라 검증된 survey/config에서 파생된다.
    extras.connectorCatalogVersion = 1;
    onComplete(extras, any ? options : undefined);
  };

  const targetSelect = (value: SectionType, onChange: (t: SectionType) => void, auto?: { label: string }) => (
    <div>
      <span className="mb-1 block text-[11px] text-ob-muted">section to put</span>
      {auto ? (
        <p className="rounded-lg border border-ob-border bg-ob-accent-soft px-3 py-2 text-xs text-ob-accent-strong">
          This will be added to the planned &ldquo;{auto.label.replace(/^\d+\.\s*/, '')}&rdquo; section.
        </p>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value as SectionType)} className={cn(inputClass, 'h-10 py-0')}>
          {targets.map((t, i) => (
            <option key={i} value={t.type}>
              {t.label}
            </option>
          ))}
          <option value="contact">+ Added new inquiry section</option>
        </select>
      )}
    </div>
  );

  return (
    <Card className="space-y-5 border-ob-border bg-ob-surface p-6">
      <div>
        <h2 className="text-lg font-semibold text-ob-ink">Please select an add-on</h2>
        <p className="mt-1 text-sm text-ob-muted">
          Everything is optional. {purpose ? `Recommended features for ${purpose.label} are enabled.` : ''} You can edit these choices later.
        </p>
      </div>

      {/* 예약 링크 — 의도 라벨이 아니라 실제 외부 href가 있을 때만 생성·집계 */}
      <FeatureCard
        icon={<CalendarCheck className="h-4.5 w-4.5" />}
        title="Reservation Link"
        desc="Connect Hero’s reservation button to the actual reservation service. I only recommend this if your goal is to make a reservation."
        enabled={reservationOn}
        onToggle={() => setReservationOn((value) => !value)}
      >
        <div>
          <label htmlFor="reservation-url" className="mb-1 block text-[11px] text-ob-muted">
            External reservation URL
          </label>
          <input
            id="reservation-url"
            value={reservationUrl}
            onChange={(event) => setReservationUrl(event.target.value)}
            placeholder="https://booking.example.com/..."
            inputMode="url"
            autoComplete="url"
            className={inputClass}
          />
          <p className="mt-1 text-[11px] leading-4 text-ob-muted">
            Enter the clinic’s verified HTTPS booking page.
          </p>
          {reservationInvalid ? (
            <p className="mt-1 text-[11px] text-ob-danger">
              This address is not supported. Please enter the https link of the actual reservation page.
            </p>
          ) : null}
          {reservationUrl.trim() && !reservationInvalid ? (
            <p className="mt-1 text-[11px] text-ob-success">You can connect to the actual reservation button.</p>
          ) : null}
        </div>
      </FeatureCard>

      {/* 문의 폼 */}
      <FeatureCard
        icon={<FormInput className="h-4.5 w-4.5" />}
        title="Inquiry form"
        desc="Inquiries left by visitors are sent to the dashboard inquiry box."
        enabled={formOn}
        onToggle={() => setFormOn((v) => !v)}
      >
        <div>
          <span className="mb-1.5 block text-[11px] text-ob-muted">field to receive</span>
          <div className="flex flex-wrap gap-2">
            {FORM_FIELD_OPTIONS.map((o) => {
              const on = formFields.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleFormField(o.value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    on ? 'border-ob-accent-strong bg-ob-accent-soft font-medium text-ob-accent-strong' : 'border-ob-border text-ob-muted hover:border-ob-muted',
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
        {targetSelect(formTarget, setFormTarget, formRow ? { label: formRow.label } : undefined)}
      </FeatureCard>

      {/* 지도 */}
      <FeatureCard
        icon={<MapIcon className="h-4.5 w-4.5" />}
        title="Map embed"
        desc="Add a Google map to the directions section."
        enabled={mapOn}
        onToggle={() => setMapOn((v) => !v)}
      >
        <div>
          <span className="mb-1 block text-[11px] text-ob-muted">Map embed URL</span>
          <input
            value={mapUrl}
            onChange={(e) => setMapUrl(e.target.value)}
            placeholder="https://www.google.com/maps/embed?..."
            className={inputClass}
          />
          <p className="mt-1 text-[11px] leading-4 text-ob-muted">
            In Google Maps, choose &ldquo;Share → Embed a map&rdquo; and paste the iframe src URL.
          </p>
          {mapInvalid ? (
            <p className="mt-1 text-[11px] text-ob-danger">
              This address is not allowed. Use a www.google.com/maps/embed URL.
            </p>
          ) : null}
          {mapUrl.trim() && !mapInvalid ? (
            <p className="mt-1 text-[11px] text-ob-success">This is the map address you can use.</p>
          ) : null}
        </div>
        {targetSelect(mapTarget, setMapTarget, mapRow ? { label: mapRow.label } : undefined)}
      </FeatureCard>

      {/* SNS 링크 */}
      <FeatureCard
        icon={<Share2 className="h-4.5 w-4.5" />}
        title="Social links"
        desc="Add verified Instagram, YouTube, X, or other HTTPS links."
        enabled={snsOn}
        onToggle={() => setSnsOn((v) => !v)}
      >
        {snsRows.map((row, i) => {
          // [v4 #6c] 베이스가 있는 채널은 아이디만 받고(프리픽스 표시), 기타 링크만 풀 URL 검사
          const withBase = hasHandleBase(row.kind);
          const bad = !withBase && row.url.trim() !== '' && !isHttpsUrl(row.url.trim());
          return (
            <div key={i} className="flex items-start gap-2">
              <select
                value={row.kind}
                onChange={(e) => setSnsRows((rows) => rows.map((r, j) => (j === i ? { ...r, kind: e.target.value as SnsKind } : r)))}
                className={cn(inputClass, 'h-10 w-36 shrink-0 py-0')}
              >
                {SNS_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="min-w-0 flex-1">
                {withBase ? (
                  <div className="flex items-stretch">
                    <span className="flex items-center whitespace-nowrap rounded-l-md border border-r-0 border-ob-border bg-ob-bg px-2 text-[11px] text-ob-muted">
                      {hasHandleBase(row.kind) ? SNS_BASES[row.kind] : null}
                    </span>
                    <input
                      value={row.url}
                      onChange={(e) => setSnsRows((rows) => rows.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)))}
                      placeholder="Enter only the ID (e.g. mycafe)"
                      className={cn(inputClass, 'rounded-l-none')}
                    />
                  </div>
                ) : (
                  <input
                    value={row.url}
                    onChange={(e) => setSnsRows((rows) => rows.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)))}
                    placeholder="https://…"
                    className={inputClass}
                  />
                )}
                {bad ? <p className="mt-1 text-[11px] text-ob-danger">Please enter the https:// address.</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setSnsRows((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : rows))}
                disabled={snsRows.length <= 1}
                aria-label="Delete link"
                className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded text-ob-muted transition-colors hover:bg-ob-danger/10 hover:text-ob-danger disabled:opacity-30"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setSnsRows((rows) => (rows.length < 8 ? [...rows, { kind: 'custom', url: '' }] : rows))}
          disabled={snsRows.length >= 8}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-ob-border px-3 py-2 text-xs text-ob-muted transition-colors hover:border-ob-muted hover:text-ob-ink disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add link
        </button>
        <div>
          <span className="mb-1.5 block text-[11px] text-ob-muted">Display method</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['bar', "bundled bars", "Display icons in one line"],
                ['buttons', "individual buttons", "Move and modify freely with buttons"],
              ] as const
            ).map(([val, label, hint]) => (
              <button
                key={val}
                type="button"
                onClick={() => setSnsStyle(val)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  snsStyle === val ? 'border-ob-accent-strong bg-ob-accent-soft' : 'border-ob-border hover:border-ob-muted',
                )}
              >
                <span className={cn('block text-xs font-medium', snsStyle === val ? 'text-ob-accent-strong' : 'text-ob-ink')}>{label}</span>
                <span className="mt-0.5 block text-[10px] text-ob-muted">{hint}</span>
              </button>
            ))}
          </div>
        </div>
      </FeatureCard>

      {error ? <p className="rounded-lg border border-ob-danger/40 bg-ob-danger/10 px-3 py-2.5 text-xs text-ob-danger">{error}</p> : null}

      <div className="flex items-center justify-between border-t border-ob-border pt-5">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Choose your design
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => onComplete(undefined, undefined)}>
            Skip
          </Button>
          <Button size="lg" onClick={submit}>
            Create it like this
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
