export const DEMO_VIEW_HEARTBEAT_MS = 20_000 as const;
export const DEMO_VIEW_RETENTION_DAYS = 30 as const;
export const DEMO_VIEW_MAX_ACTIVE_SECONDS = 7_200 as const;
export const DEMO_VIEW_MAX_SECTIONS = 20 as const;
export const DEMO_VIEW_MAX_CLICKS = 20 as const;
export const DEMO_VIEW_MAX_BODY_BYTES = 8_192 as const;
export const DEMO_VIEW_QA_COOKIE = 'daboim_demo_qa' as const;
export const DEMO_VIEW_QA_COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60;

export const DEMO_REFERRER_CLASSES = [
  'direct',
  'search',
  'social',
  'email',
  'other',
] as const;
export type DemoReferrerClass = (typeof DEMO_REFERRER_CLASSES)[number];

export interface DemoViewSectionSample {
  id: string;
  activeSeconds: number;
}

export interface DemoViewClientPayload {
  slug: string;
  eventId: string;
  visitorId?: string;
  sessionId?: string;
  openedAt: string;
  localHour: number;
  timezone: string;
  activeSeconds: number;
  maxScrollPct: number;
  sections: DemoViewSectionSample[];
  clicks: Record<string, number>;
  referrer: {
    class: DemoReferrerClass;
    origin: string | null;
  };
  isMobile: boolean;
  final: boolean;
}

export interface DemoViewStoredInput {
  previewId: string;
  slug: string;
  eventId: string;
  visitorId: string;
  sessionId: string;
  ipHash: string;
  hashKeyVersion: number;
  openedAt: string;
  localHour: number;
  timezone: string;
  activeSeconds: number;
  maxScrollPct: number;
  sections: DemoViewSectionSample[];
  clicks: Record<string, number>;
  referrer: DemoViewClientPayload['referrer'];
  isMobile: boolean;
  final: boolean;
}

export interface DemoViewRecordResult {
  recorded: boolean;
  visitCount: number;
  hoursSinceLast: number | null;
  alertId: string | null;
}

export const DEMO_REINTEREST_SIGNAL_LABEL =
  '48시간 안에 다시 열어 본 강한 재관심 신호입니다. 다른 사람에게 전달됐을 가능성은 있지만 공유나 구매를 확정하지 않습니다.';

function finiteInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function safeKey(value: string): string | null {
  const key = value.trim().slice(0, 80);
  return /^[A-Za-z0-9:_-]+$/u.test(key) ? key : null;
}

export function clampDemoViewTelemetry(input: DemoViewClientPayload): Pick<
  DemoViewStoredInput,
  | 'openedAt'
  | 'localHour'
  | 'timezone'
  | 'activeSeconds'
  | 'maxScrollPct'
  | 'sections'
  | 'clicks'
  | 'referrer'
  | 'isMobile'
  | 'final'
> {
  const openedAt = new Date(input.openedAt);
  const timezone = input.timezone.trim().slice(0, 64);
  const sections = input.sections
    .map((section) => {
      const id = safeKey(section.id);
      return id
        ? {
            id,
            activeSeconds: finiteInteger(
              section.activeSeconds,
              0,
              DEMO_VIEW_MAX_ACTIVE_SECONDS,
            ),
          }
        : null;
    })
    .filter((section): section is DemoViewSectionSample => section !== null)
    .slice(0, DEMO_VIEW_MAX_SECTIONS);
  const clicks = Object.fromEntries(
    Object.entries(input.clicks)
      .map(([key, count]) => {
        const safe = safeKey(key);
        return safe ? [safe, finiteInteger(count, 0, 100)] as const : null;
      })
      .filter((entry): entry is readonly [string, number] => entry !== null)
      .slice(0, DEMO_VIEW_MAX_CLICKS),
  );
  let referrerOrigin: string | null = null;
  if (input.referrer.origin) {
    try {
      const url = new URL(input.referrer.origin);
      referrerOrigin = ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
    } catch {
      referrerOrigin = null;
    }
  }
  return {
    openedAt: Number.isFinite(openedAt.getTime())
      ? openedAt.toISOString()
      : new Date(0).toISOString(),
    localHour: finiteInteger(input.localHour, 0, 23),
    timezone: timezone || 'UTC',
    activeSeconds: finiteInteger(input.activeSeconds, 0, DEMO_VIEW_MAX_ACTIVE_SECONDS),
    maxScrollPct: finiteInteger(input.maxScrollPct, 0, 100),
    sections,
    clicks,
    referrer: {
      class: DEMO_REFERRER_CLASSES.includes(input.referrer.class)
        ? input.referrer.class
        : 'other',
      origin: referrerOrigin,
    },
    isMobile: Boolean(input.isMobile),
    final: Boolean(input.final),
  };
}
