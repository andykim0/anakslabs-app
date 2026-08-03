import type { CSSProperties, FormEventHandler } from 'react';
import type { FormElement, SiteTheme } from '@/lib/types/site';
import { themeColor, themeRadius } from '@/lib/design/site-theme-tokens';

export type ContactFormStatus = 'idle' | 'sending' | 'ok' | 'error';

type FormFieldKey = FormElement['fields'][number];

const FIELD_META: Record<FormFieldKey, { label: string; type: string; multiline?: boolean }> = {
  name: { label: 'Name', type: 'text' },
  phone: { label: 'Phone', type: 'tel' },
  email: { label: 'Email', type: 'email' },
  message: { label: 'Message', type: 'text', multiline: true },
};

/**
 * The form's initial DOM is shared by the hydrated live component and static
 * serialization. Static documents intentionally omit React handlers while
 * retaining the same controls, labels, enabled state, and semantic markup.
 */
export function ContactFormView({
  el,
  theme,
  enabled,
  compact,
  values,
  status,
  feedback,
  onSubmit,
  onValueChange,
}: {
  el: FormElement;
  theme: SiteTheme;
  enabled: boolean;
  compact?: boolean;
  values: Readonly<Record<string, string>>;
  status: ContactFormStatus;
  feedback: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onValueChange?: (field: string, value: string) => void;
}) {
  const s = el.style;
  const radius = theme.tokens
    ? themeRadius(theme, 'soft', 8)
    : (s.borderRadius ?? theme.radius ?? 8);
  const controlRadius = theme.tokens
    ? themeRadius(theme, 'sharp', 8)
    : Math.min(radius as number, 12);
  const accent = s.color ?? theme.palette.primary;

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? 10 : 12,
    fontFamily: theme.fonts.body,
    padding: s.variant === 'card' ? (compact ? 16 : 24) : 0,
    backgroundColor: s.variant === 'card' ? themeColor(theme, 'surfaceStrong') : 'transparent',
    borderRadius: s.variant === 'card' ? radius : undefined,
    boxSizing: 'border-box',
    overflow: 'hidden',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: 15,
    fontFamily: theme.fonts.body,
    color: theme.palette.text,
    backgroundColor: themeColor(theme, 'backgroundSubtle'),
    border: theme.tokens
      ? `1px solid ${themeColor(theme, 'border')}`
      : `1px solid ${theme.palette.muted}55`,
    borderRadius: controlRadius,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <form style={wrap} onSubmit={onSubmit}>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        {...(onValueChange
          ? {
              value: values.website ?? '',
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange('website', event.target.value),
            }
          : { defaultValue: values.website ?? '' })}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
      />
      {el.fields.map((field) => {
        const meta = FIELD_META[field];
        return meta.multiline ? (
          <textarea
            key={field}
            placeholder={meta.label}
            rows={3}
            disabled={!enabled}
            {...(onValueChange
              ? {
                  value: values[field] ?? '',
                  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onValueChange(field, event.target.value),
                }
              : { defaultValue: values[field] ?? '' })}
            style={{ ...inputStyle, resize: 'none', flex: 1, minHeight: 72 }}
          />
        ) : (
          <input
            key={field}
            type={meta.type}
            placeholder={meta.label}
            disabled={!enabled}
            {...(onValueChange
              ? {
                  value: values[field] ?? '',
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange(field, event.target.value),
                }
              : { defaultValue: values[field] ?? '' })}
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
          borderRadius: controlRadius,
          cursor: enabled ? 'pointer' : 'default',
          opacity: status === 'sending' ? 0.7 : 1,
        }}
      >
        {status === 'sending' ? 'Sending…' : el.submitLabel || 'Send message'}
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
