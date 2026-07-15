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

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(iso)} ${hh}:${mi}`;
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
  text: '텍스트',
  image: '이미지',
  video: '영상',
  structure: '구조 변경',
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
  edit_text: '텍스트 편집',
  edit_image: '이미지 편집',
  edit_video: '영상 편집',
  edit_structure: '구조 변경',
  refund: '환불',
  expired: '만료 소멸',
  admin_adjust: '관리자 조정',
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  build_fee: '빌드비',
  maintenance_subscription: '사이트 운영 구독',
  credit_pack: '크레딧 팩',
};
