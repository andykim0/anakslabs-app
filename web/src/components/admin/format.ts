/** 관리자 콘솔 공용 포맷터/라벨. */
import type {
  ClientStatus,
  CreditReason,
  DomainType,
  EditStatus,
  EditType,
  PaymentType,
  SiteStatus,
  Tier,
} from '@/lib/types/domain';

export function formatKrw(amount: number): string {
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

function kstParts(iso: string): Record<string, string> | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const parts = kstParts(iso);
  return parts ? `${parts.year}.${parts.month}.${parts.day}` : '—';
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const parts = kstParts(iso);
  return parts
    ? `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute} KST`
    : '—';
}

export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export const TIER_LABELS: Record<Tier, string> = {
  basic: '기본 홈페이지',
  premium: 'AI 영상 홈페이지',
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: '활성',
  paused: '일시중지',
  cancelled: '해지',
};

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  draft: '초안',
  building: '제작 중',
  live: '라이브',
  pending_dns: 'DNS 대기',
  suspended: '중지됨',
};

export const DOMAIN_TYPE_LABELS: Record<DomainType, string> = {
  subdomain: '서브도메인',
  custom: '커스텀',
};

export const EDIT_TYPE_LABELS: Record<EditType, string> = {
  text: '다보임 카피 수정 대행',
  image: 'AI 이미지 새로 생성',
  video: 'AI 영상 재생성',
  structure: 'AI 전체 섹션 재디자인',
};

export const EDIT_STATUS_LABELS: Record<EditStatus, string> = {
  pending: '대기',
  ai_processing: 'AI 처리 중',
  qa_review: 'QA 검수',
  applied: '적용됨',
  rejected: '반려됨',
};

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  initial_grant: '초기 지급',
  purchase: '팩 구매',
  subscription_grant: '구독 월 지급',
  edit_text: '다보임 카피 수정 대행',
  edit_image: 'AI 이미지 새로 생성',
  edit_video: 'AI 영상 재생성',
  edit_structure: 'AI 전체 섹션 재디자인',
  refund: '환불',
  expired: '만료 소멸',
  admin_clawback: '지급분 회수',
  admin_adjust: '관리자 조정',
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  build_fee: '빌드비(과거)',
  maintenance_subscription: '사이트 운영 구독',
  premium_addon: 'AI 영상 애드온',
  credit_pack: '크레딧 팩',
};
