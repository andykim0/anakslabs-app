import type { FormElement, SiteTheme } from '@/lib/types/site';
import { ContactFormView } from './ContactFormView';

/** Static-export form shell. It matches the hydrated component's initial DOM. */
export function StaticContactForm({
  el,
  theme,
  siteId,
  interactive,
  compact,
}: {
  el: FormElement;
  theme: SiteTheme;
  siteId?: string;
  interactive: boolean;
  compact?: boolean;
}) {
  return (
    <ContactFormView
      el={el}
      theme={theme}
      enabled={interactive && Boolean(siteId)}
      compact={compact}
      values={{}}
      status="idle"
      feedback=""
    />
  );
}
