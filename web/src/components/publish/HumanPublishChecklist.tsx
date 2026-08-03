'use client';

import {
  PUBLISH_HUMAN_CHECKS,
  type PublishHumanCheckId,
  type PublishHumanChecks,
} from '@/lib/publish/human-checks';

export function HumanPublishChecklist({
  value,
  onChange,
}: {
  value: PublishHumanChecks;
  onChange: (id: PublishHumanCheckId, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-xs font-semibold text-ob-ink">
        Review these items before publishing
      </legend>
      {PUBLISH_HUMAN_CHECKS.map(({ id, label }, index) => (
        <label
          key={id}
          className={`flex cursor-pointer items-start gap-2.5 rounded-ob border px-3.5 py-3 transition-colors ${
            value[id]
              ? 'border-ob-accent-strong bg-ob-accent-soft'
              : 'border-ob-border bg-ob-surface hover:border-ob-muted'
          }`}
        >
          <input
            type="checkbox"
            checked={value[id]}
            onChange={(event) => onChange(id, event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#174DDA]"
          />
          <span className="text-xs leading-5 text-ob-ink">
            {index + 1}. {label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
