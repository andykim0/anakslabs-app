'use client';

/**
 * 인스펙터 공용 입력 필드 프리미티브.
 * 스토어 값을 prop으로 받아 즉시 커밋(onChange) — undo 그룹핑은 스토어가 처리.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/components/dashboard/ui';

/**
 * prop 변경 시 로컬 draft를 리셋하는 파생 상태 패턴 (렌더 중 setState — React 권장 방식).
 * 빈 입력 등 커밋 불가 중간값을 draft로 유지하다가 외부 값이 바뀌면 동기화한다.
 */
function useDraft(value: string): [string, (v: string) => void] {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setDraft(value);
  }
  return [draft, setDraft];
}

export function Field({
  label,
  children,
  row = false,
}: {
  label: string;
  children: React.ReactNode;
  row?: boolean;
}) {
  return (
    <label className={cn('block', row && 'flex items-center justify-between gap-2')}>
      <span className="mb-1 block text-[11px] font-medium text-[#5F6B7C]">{label}</span>
      {children}
    </label>
  );
}

export function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#DCE4F0] px-4 py-4">
      <p className="mb-3 text-[11px] font-semibold tracking-wide text-[#667085] uppercase">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

const inputCls =
  'h-8 w-full rounded-md border border-[#CAD5E5] bg-white px-2 text-xs text-[#0B1736] outline-none transition-colors focus:border-sky-600 placeholder:text-[#667085]';

// ---------- 텍스트 ----------

export function TextField({
  label,
  value,
  onCommit,
  placeholder,
  allowEmpty = true,
  hint,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  /** false면 공백 입력은 커밋하지 않음 (src 등 zod min(1) 필드) */
  allowEmpty?: boolean;
  hint?: string;
}) {
  const [draft, setDraft] = useDraft(value);
  return (
    <Field label={label}>
      <input
        type="text"
        className={inputCls}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          if (allowEmpty || e.target.value.trim().length > 0) onCommit(e.target.value);
        }}
        onBlur={() => {
          if (!allowEmpty && draft.trim().length === 0) setDraft(value);
        }}
      />
      {hint ? <span className="mt-1 block text-[10px] leading-4 text-[#667085]">{hint}</span> : null}
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onCommit,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <textarea
        className={cn(inputCls, 'h-auto resize-y py-1.5 leading-5')}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onCommit(e.target.value)}
      />
    </Field>
  );
}

// ---------- 숫자 ----------

export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useDraft(String(value));

  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  /**
   * 타이핑 중(onChange)에는 범위 안의 값만 커밋한다 — 클램프 커밋 금지.
   * 예: min=8인 크기에 '12' 입력 시 '1' 시점에 8로 클램프 커밋하면 스토어 반영값이
   * prop으로 되돌아와 draft가 '8'로 리셋되고 이어 '2'를 치면 82가 되는 하이재킹 발생.
   * 범위 밖 중간값은 draft로만 유지하고, 확정(blur/Enter) 시점에만 클램프해 커밋한다.
   */
  const commitLive = (s: string) => {
    if (s.trim() === '') return;
    const n = Number(s);
    if (!Number.isFinite(n)) return;
    if (min !== undefined && n < min) return;
    if (max !== undefined && n > max) return;
    onCommit(n);
  };

  const commitFinal = (s: string) => {
    const n = Number(s);
    if (s.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(value)); // 무효 입력 — 마지막 확정값으로 복귀
      return;
    }
    const v = clamp(n);
    onCommit(v);
    // 클램프 결과가 기존 value와 같으면 prop이 안 바뀌어 useDraft가 리셋하지 않으므로 직접 동기화
    setDraft(String(v));
  };

  return (
    <Field label={label}>
      <input
        type="number"
        className={inputCls}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          commitLive(e.target.value);
        }}
        onBlur={() => commitFinal(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitFinal(e.currentTarget.value);
        }}
      />
    </Field>
  );
}

export function RangeField({
  label,
  value,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#5F6B7C]">{label}</span>
        <span className="text-[11px] tabular-nums text-[#344054]">{format(value)}</span>
      </div>
      <input
        type="range"
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#DCE4F0] accent-sky-500"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onCommit(Number(e.target.value))}
      />
    </div>
  );
}

// ---------- 선택 ----------

export function SelectField<T extends string>({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onCommit: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select className={inputCls} value={value} onChange={(e) => onCommit(e.target.value as T)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function SegmentedField<T extends string>({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onCommit: (v: T) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-[#5F6B7C]">{label}</span>
      <div className="flex rounded-md border border-[#CAD5E5] bg-white p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            onClick={() => onCommit(opt.value)}
            className={cn(
              'flex h-7 flex-1 items-center justify-center rounded text-xs transition-colors',
              value === opt.value
                ? 'bg-[#DCE4F0] text-[#0B1736]'
                : 'text-[#5F6B7C] hover:text-[#26354D]',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToggleField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: boolean;
  onCommit: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCommit(!value)}
      className="flex w-full items-center justify-between py-0.5"
    >
      <span className="text-xs text-[#344054]">{label}</span>
      <span
        className={cn(
          'relative h-4.5 w-8 rounded-full transition-colors',
          value ? 'bg-sky-600' : 'bg-[#DCE4F0]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform',
            value ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

// ---------- 색상 ----------

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function ColorField({
  label,
  value,
  onCommit,
  clearable = false,
  clearLabel = "theme basics",
}: {
  label: string;
  /** undefined = 테마 기본값 사용 */
  value: string | undefined;
  onCommit: (v: string | undefined) => void;
  clearable?: boolean;
  clearLabel?: string;
}) {
  const [draft, setDraft] = useDraft(value ?? '');

  const pickerValue = value && HEX6.test(value) ? value : '#888888';

  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-[#CAD5E5] bg-white p-0.5"
          value={pickerValue}
          onChange={(e) => onCommit(e.target.value)}
        />
        <input
          type="text"
          className={inputCls}
          value={draft}
          placeholder={clearable ? clearLabel : '#000000'}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = e.target.value.trim();
            if (v.length > 0) onCommit(v);
            else if (clearable) onCommit(undefined);
          }}
        />
        {clearable && value !== undefined ? (
          <button
            type="button"
            title={`${clearLabel}initialized to`}
            onClick={() => onCommit(undefined)}
            className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-[#667085] transition-colors hover:bg-[#E8EDF5] hover:text-[#26354D]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </Field>
  );
}
