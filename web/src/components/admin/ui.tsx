/** 관리자 콘솔 공용 UI 프리미티브 (밀도 우선, Tailwind). */
import clsx from 'clsx';
import { AlertTriangle, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ClientStatus, EditStatus, SiteStatus, Tier } from '@/lib/types/domain';

// ---------- Badge ----------

export type BadgeTone = 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'purple';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const TIER_TONES: Record<Tier, BadgeTone> = { basic: 'blue', premium: 'purple' };

export const CLIENT_STATUS_TONES: Record<ClientStatus, BadgeTone> = {
  active: 'green',
  paused: 'amber',
  cancelled: 'red',
};

export const SITE_STATUS_TONES: Record<SiteStatus, BadgeTone> = {
  draft: 'neutral',
  building: 'blue',
  live: 'green',
  pending_dns: 'amber',
  suspended: 'red',
};

export const EDIT_STATUS_TONES: Record<EditStatus, BadgeTone> = {
  pending: 'neutral',
  ai_processing: 'blue',
  qa_review: 'amber',
  applied: 'green',
  rejected: 'red',
};

// ---------- Card / Stat ----------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('rounded-lg border border-slate-200 bg-white', className)}>{children}</div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <Card className={clsx('p-4', tone === 'danger' && 'border-red-300 bg-red-50')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon ? <Icon size={15} className="text-slate-400" aria-hidden /> : null}
      </div>
      <p
        className={clsx(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          tone === 'danger' ? 'text-red-700' : 'text-slate-900',
        )}
      >
        {value}
      </p>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </Card>
  );
}

// ---------- Gauge ----------

export function Gauge({
  value,
  max,
  warnAt,
  className,
}: {
  value: number;
  max: number;
  /** 이 값 이상이면 빨간색 */
  warnAt?: number;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const danger = warnAt !== undefined ? value >= warnAt : ratio >= 0.9;
  const caution = !danger && ratio >= 0.7;
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div
        className={clsx(
          'h-full rounded-full transition-all',
          danger ? 'bg-red-500' : caution ? 'bg-amber-500' : 'bg-emerald-500',
        )}
        style={{ width: `${Math.max(ratio * 100, value > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

// ---------- 상태 블록 ----------

export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center">
      <AlertTriangle size={20} className="text-red-500" aria-hidden />
      <p className="text-sm text-red-700">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          <RefreshCw size={13} aria-hidden />
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
        <Icon size={20} className="text-slate-400" aria-hidden />
      </div>
      <p className="mt-1 text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="max-w-sm text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

// ---------- 페이지/패널 헤더 ----------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 px-5 py-4">
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}
