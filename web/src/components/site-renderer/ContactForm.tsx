'use client';

/**
 * [v3 Phase 3] 문의 폼 요소의 대화형 구현 — 테넌트 사이트에서 실제 제출 동작.
 * POST /api/forms/[siteId] (공개 엔드포인트). 성공/실패 인라인 피드백.
 *
 * - interactive=false(미리보기/에디터) 또는 siteId 부재 시엔 비활성 렌더.
 * - honeypot(website) 히든 필드 — 봇이 채우면 서버가 조용히 폐기.
 * - 정적 Export에는 JS 번들이 없어 제출이 동작하지 않음(약관 11장 동적 기능 고지와 일치).
 */
import { useState } from 'react';
import type { FormElement, SiteTheme } from '@/lib/types/site';
import { announceSuccessfulSiteForm } from '@/lib/analytics/site-beacon';
import { ContactFormView, type ContactFormStatus } from './ContactFormView';

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
  const [status, setStatus] = useState<ContactFormStatus>('idle');
  const [feedback, setFeedback] = useState('');

  const enabled = interactive && !!siteId;
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
        setFeedback('Your message was received. We will follow up shortly.');
        setValues({});
        // 성공한 제출만 집계한다. detail/payload가 없어 폼 값·연락처는 비콘으로 전달되지 않는다.
        announceSuccessfulSiteForm();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setStatus('error');
        setFeedback(body?.error?.message ?? 'The message could not be sent. Try again shortly.');
      }
    } catch {
      setStatus('error');
      setFeedback('The message could not be sent. Check your connection and try again.');
    }
  };

  return (
    <ContactFormView
      el={el}
      theme={theme}
      enabled={enabled}
      compact={compact}
      values={values}
      status={status}
      feedback={feedback}
      onSubmit={submit}
      onValueChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
    />
  );
}
