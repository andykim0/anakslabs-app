/**
 * 대시보드 공용 UI 프리미티브 (dashboard 팀 소유).
 * 'use client' 없음 — 서버/클라이언트 양쪽에서 사용 가능(순수 표현 컴포넌트).
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';
import type { CreditReason, EditStatus, EditType, SiteStatus, Tier } from '@/lib/types/domain';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------- 포맷터 ----------

export function formatKrw(amount: number): string {
  return `${amount.toLocaleString('ko-KR')} KRW`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- 라벨 사전 ----------

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  draft: "draft",
  building: "Creating",
  live: "live",
  pending_dns: "DNS standby",
  suspended: "pause",
};

export const EDIT_STATUS_LABELS: Record<EditStatus, string> = {
  pending: "Received",
  ai_processing: "AI processing",
  qa_review: "Inspecting",
  applied: "Reflection completed",
  rejected: "companion",
};

export const EDIT_TYPE_LABELS: Record<EditType, string> = {
  text: "Anaks Labs copy editing service",
  image: "Create a new AI image",
  video: "AI video regeneration",
  structure: "AI entire section redesign",
};

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  initial_grant: "initial payment",
  purchase: "Buy Credits",
  subscription_grant: "Subscription monthly payment",
  edit_text: "Anaks Labs copy editing service",
  edit_image: "Create a new AI image",
  edit_video: "AI video regeneration",
  edit_structure: "AI entire section redesign",
  refund: "refund",
  expired: "expiration",
  admin_clawback: "Recovery of payment",
  admin_adjust: "Operator Coordination",
};

export const TIER_LABELS: Record<Tier, string> = {
  basic: "Clinic website",
  premium: "AI video homepage",
};

// ---------- 뱃지 ----------

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'blue' | 'emerald' | 'amber' | 'red' | 'gold';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-[#DCE4F0] bg-[#EEF3F9] text-[#475467]',
    blue: 'border-[#BBD0FA] bg-[#EDF4FF] text-[#174DDA]',
    emerald: 'border-[#A8E5D8] bg-[#EAFBF7] text-[#087D70]',
    amber: 'border-[#F2D59B] bg-[#FFF8E8] text-[#855700]',
    red: 'border-[#F2B8BE] bg-[#FFF0F2] text-[#B42318]',
    // Legacy API name kept for callers; visually this is now the Anaks Labs mint tier signal.
    gold: 'border-[#A8E5D8] bg-[#EAFBF7] text-[#087D70]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const SITE_STATUS_TONES: Record<SiteStatus, 'neutral' | 'blue' | 'emerald' | 'amber' | 'red'> = {
  draft: 'neutral',
  building: 'blue',
  live: 'emerald',
  pending_dns: 'amber',
  suspended: 'red',
};

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  return <Badge tone={SITE_STATUS_TONES[status]}>{SITE_STATUS_LABELS[status]}</Badge>;
}

const EDIT_STATUS_TONES: Record<EditStatus, 'neutral' | 'blue' | 'emerald' | 'amber' | 'red'> = {
  pending: 'neutral',
  ai_processing: 'blue',
  qa_review: 'amber',
  applied: 'emerald',
  rejected: 'red',
};

export function EditStatusBadge({ status }: { status: EditStatus }) {
  return <Badge tone={EDIT_STATUS_TONES[status]}>{EDIT_STATUS_LABELS[status]}</Badge>;
}

export function TierBadge({ tier }: { tier: Tier }) {
  return <Badge tone={tier === 'premium' ? 'gold' : 'neutral'}>{TIER_LABELS[tier]}</Badge>;
}

// ---------- 레이아웃 조각 ----------

export function Card({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-[0_10px_32px_rgba(11,23,54,0.045)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#0B1736]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[#5F6B7C]">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------- 상태 표현 ----------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[#DCE8F7]', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#CAD5E5] bg-[#F8FBFF] px-6 py-10 text-center">
      {icon ? <div className="text-[#8B9AB0]">{icon}</div> : null}
      <p className="text-sm font-medium text-[#26354D]">{title}</p>
      {description ? <p className="max-w-sm text-xs leading-5 text-[#667085]">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message = "Failed to load data.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#F2B8BE] bg-[#FFF5F6] px-6 py-8 text-center"
    >
      <p className="text-sm text-[#B42318]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-[#E59AA3] px-3 py-1.5 text-xs text-[#B42318] transition-colors hover:bg-[#FFE8EA]"
        >
          try again
        </button>
      ) : null}
    </div>
  );
}

// ---------- 버튼 ----------

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}) {
  const variants: Record<string, string> = {
    primary:
      'bg-[#174DDA] text-white hover:bg-[#0F3DB9] disabled:hover:bg-[#174DDA] font-semibold shadow-[0_8px_20px_rgba(23,77,218,0.16)]',
    secondary:
      'border border-[#CAD5E5] bg-white text-[#26354D] hover:border-[#174DDA] hover:text-[#174DDA]',
    ghost: 'text-[#475467] hover:bg-[#EDF4FF] hover:text-[#174DDA]',
    danger: 'border border-[#F2B8BE] bg-[#FFF5F6] text-[#B42318] hover:bg-[#FFE8EA]',
  };
  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-xs rounded-lg',
    md: 'h-10 px-4 text-sm rounded-lg',
    lg: 'h-12 px-6 text-sm rounded-xl',
  };
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
