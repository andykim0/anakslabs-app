'use client';

/**
 * [v3 Phase 3] 문의 폼 요소의 대화형 구현 — 테넌트 사이트에서 실제 제출 동작.
 * POST /api/forms/[siteId] (공개 엔드포인트). 성공/실패 인라인 피드백.
 *
 * - interactive=false(미리보기/에디터) 또는 siteId 부재 시엔 비활성 렌더.
 * - honeypot(website) 히든 필드 — 봇이 채우면 서버가 조용히 폐기.
 * - 정적 Export에는 JS 번들이 없어 제출이 동작하지 않음(약관 11장 동적 기능 고지와 일치).
 */
import { useState, type CSSProperties } from 'react';
import type { FormElement, SiteTheme } from '@/lib/types/site';

type FormFieldKey = FormElement['fields'][number];

const FIELD_META: Record<FormFieldKey, { label: string; type: string; multiline?: boolean }> = {
  name: { label: '이름', type: 'text' },
  phone: { label: '연락처', type: 'tel' },
  email: { label: '이메일', type: 'email' },
  message: { label: '문의 내용', type: 'text', multiline: true },
};

export function ContactForm({
  el,
  theme,
  siteId,
  interactive,
  compact,
}: {
  el: FormElement;
  theme: SiteTheme;
  /** 제출 대상 사이트 — 없으면 비활성(미리보기) */
  siteId?: string;
  interactive: boolean;
  /** stack(모바일) variant — 고정 px 타이포 */
  compact?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');

  const enabled = interactive && !!siteId;
  const s = el.style;
  const radius = s.borderRadius ?? theme.radius ?? 8;
  const accent = s.color ?? theme.palette.primary;

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? 10 : 12,
    fontFamily: theme.fonts.body,
    padding: s.variant === 'card' ? (compact ? 16 : 24) : 0,
    backgroundColor: s.variant === 'card' ? theme.palette.surface : 'transparent',
    borderRadius: s.variant === 'card' ? radius : undefined,
    boxSizing: 'border-box',
    overflow: 'hidden',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: compact ? 15 : 15,
    fontFamily: theme.fonts.body,
    color: theme.palette.text,
    backgroundColor: theme.palette.background,
    border: `1px solid ${theme.palette.muted}55`,
    borderRadius: Math.min(radius, 12),
    outline: 'none',
    boxSizing: 'border-box',
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled || status === 'sending') return;
    setStatus('sending');
    setFeedback('');
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(siteId!)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        setStatus('ok');
        setFeedback('문의가 접수됐어요. 확인 후 연락드리겠습니다.');
        setValues({});
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setStatus('error');
        setFeedback(body?.error?.message ?? '전송에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    } catch {
      setStatus('error');
      setFeedback('전송에 실패했어요. 네트워크를 확인해 주세요.');
    }
  };

  return (
    <form style={wrap} onSubmit={submit}>
      {/* honeypot — 사람에겐 보이지 않음. 봇이 채우면 서버가 폐기 */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={values.website ?? ''}
        onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
      />
      {el.fields.map((f) => {
        const meta = FIELD_META[f];
        return meta.multiline ? (
          <textarea
            key={f}
            placeholder={meta.label}
            rows={3}
            disabled={!enabled}
            value={values[f] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            style={{ ...inputStyle, resize: 'none', flex: 1, minHeight: 72 }}
          />
        ) : (
          <input
            key={f}
            type={meta.type}
            placeholder={meta.label}
            disabled={!enabled}
            value={values[f] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            style={inputStyle}
          />
        );
      })}
      <button
        type="submit"
        disabled={!enabled || status === 'sending'}
        className="anaks-btn"
        data-variant="solid"
        style={{
          padding: '13px 20px',
          fontSize: 15,
          fontWeight: 600,
          fontFamily: theme.fonts.body,
          color: theme.palette.background,
          backgroundColor: accent,
          border: 'none',
          borderRadius: Math.min(radius, 12),
          cursor: enabled ? 'pointer' : 'default',
          opacity: status === 'sending' ? 0.7 : 1,
        }}
      >
        {status === 'sending' ? '전송 중…' : el.submitLabel || '문의 보내기'}
      </button>
      {feedback ? (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.5,
            color: status === 'ok' ? accent : '#e5484d',
          }}
        >
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
