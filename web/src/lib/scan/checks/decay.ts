import type { ScanRule } from '../rules';

const STRICT_LEGACY_FINGERPRINTS = [
  /(?:^|[/_-])jquery[.-]1\.(?:[0-9]+)(?:\.[0-9]+)?(?:\.min)?\.js(?:[?"']|$)/iu,
  /jquery\.easing\.1\.3(?:\.min)?\.js(?:[?"']|$)/iu,
  /<meta[^>]+name=["']generator["'][^>]+content=["'](?:xpressengine|제로보드|adobe golive|microsoft frontpage)["']/iu,
] as const;

function observedDate(ctx: Parameters<ScanRule['failed']>[0]): Date | null {
  if (!ctx.observedAt) return null;
  const parsed = new Date(ctx.observedAt);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function footerCopyrightYear(ctx: Parameters<ScanRule['failed']>[0]): number | null {
  const footer = ctx.root.querySelector('footer');
  if (!footer) return null;
  const text = footer.text.replace(/\s+/gu, ' ');
  if (!/(?:©|copyright|all rights reserved)/iu.test(text)) return null;
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => Number(match[0]));
  return years.length > 0 ? Math.max(...years) : null;
}

function staleFooterYear(ctx: Parameters<ScanRule['failed']>[0]): boolean {
  const observed = observedDate(ctx);
  const year = footerCopyrightYear(ctx);
  if (!observed || year === null || year > observed.getUTCFullYear()) return false;
  return observed.getUTCFullYear() - year >= 3;
}

function staleLastModified(ctx: Parameters<ScanRule['failed']>[0]): boolean {
  const observed = observedDate(ctx);
  if (!observed || !ctx.lastModified) return false;
  const modified = new Date(ctx.lastModified);
  if (!Number.isFinite(modified.getTime()) || modified > observed) return false;
  return observed.getTime() - modified.getTime() >= 730 * 86_400_000;
}

export const DECAY_RULES: ScanRule[] = [
  {
    code: 'decay_footer_year_stale',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'info',
    weight: 0,
    advisory: true,
    decaySlot: 'freshness',
    decayWeight: 10,
    label: '푸터 연도가 오래된 상태로 보입니다',
    detail: '저작권 연도가 최근 3년 안에 갱신되지 않았습니다. 실제 운영 상태를 확인한 뒤 현재 연도로 정리하세요.',
    failed: staleFooterYear,
  },
  {
    code: 'decay_last_modified_stale',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'info',
    weight: 0,
    advisory: true,
    decaySlot: 'freshness',
    decayWeight: 15,
    label: '오랫동안 수정되지 않은 응답 신호가 있습니다',
    detail: '서버의 Last-Modified 값이 2년 넘게 고정되어 있습니다. 이 값만으로 운영 중단을 단정하지 않으며 실제 수정 이력을 함께 확인하세요.',
    failed: staleLastModified,
  },
  {
    code: 'decay_legacy_builder_fingerprint',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'info',
    weight: 0,
    advisory: true,
    decaySlot: 'legacyTechnology',
    decayWeight: 10,
    label: '오래된 제작 도구의 명확한 흔적이 있습니다',
    detail: '엄격한 지문 목록과 일치한 경우만 표시합니다. 보안 취약점을 단정하지 않고 업데이트 필요 여부를 확인하는 신호입니다.',
    failed: (ctx) => STRICT_LEGACY_FINGERPRINTS.some((pattern) => pattern.test(ctx.rawHtml)),
  },
  {
    code: 'decay_social_link_dead',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'info',
    weight: 0,
    advisory: true,
    decaySlot: 'socialLinks',
    decayWeight: 5,
    label: '연결되지 않는 공식 채널 링크가 있습니다',
    detail: '명확한 404 또는 410 응답만 표시합니다. 일시 오류·로그인 요구·요청 제한은 판정 불가로 두고 감점하지 않습니다.',
    failed: (ctx) => ctx.socialLinks?.some((link) => link.status === 'dead') ?? false,
  },
];

export function hasStrictLegacyFingerprint(html: string): boolean {
  return STRICT_LEGACY_FINGERPRINTS.some((pattern) => pattern.test(html));
}
