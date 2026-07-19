/**
 * [§6] 개인정보처리방침 / 이용약관 — 고정 템플릿 (AI 생성 금지, 법적 환각 리스크 차단).
 * 사업자 정보를 변수 치환한 순수 텍스트 섹션을 반환한다. HTML을 만들지 않으므로
 * 서빙(React) / Export(HTML 문자열) 양쪽에서 각자 안전하게(이스케이프) 렌더한다.
 *
 * ⚠️ 실제 문안은 시행 전 변호사 검토 필요.
 */
import type { BusinessInfo, SiteConfig } from '@/lib/types/site';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

export interface LegalSection {
  heading: string;
  /** 문단(순수 텍스트) 배열 */
  body: string[];
}

export interface LegalDocument {
  title: string;
  updatedNote: string;
  sections: LegalSection[];
}

/**
 * RPT4 — 발행 사이트 성과 측정 고지의 단일 문구 소스.
 *
 * 비콘은 아래 열거형을 일별·사이트별 합계로만 저장한다. 원문 리퍼러나 폼 입력값처럼
 * 방문자를 재식별할 수 있는 값을 방침 문구에 암시적으로 포함하지 않도록 고정한다.
 */
export const ANONYMOUS_SITE_EVENT_DISCLOSURE = {
  heading: '익명 성과 측정 및 월간 리포트',
  collected:
    '페이지 조회, 전화·예약·길찾기 링크 클릭, 폼 제출 여부와 유입 출처 분류(네이버·구글·인스타그램·직접 방문/사이트 내부·기타)를 사이트·날짜 단위의 집계 건수로 저장합니다.',
  purpose:
    '집계 정보는 웹사이트 운영 성과 확인과 월간 성과 리포트 생성·제공에만 사용합니다.',
  excluded:
    '성과 측정 저장소에는 이름·연락처 등 개인정보, IP 주소, 원문 리퍼러(raw referrer), 방문자·세션 식별자, 폼 입력 내용을 저장하지 않습니다.',
  retention:
    '익명 집계 정보와 이를 바탕으로 생성한 월간 성과 리포트는 집계 기준월부터 24개월 동안 보관한 뒤 삭제합니다.',
  legalReview:
    '※ 법무 검토 대상: 익명 성과 측정의 수집 항목·보관 기간·고지 문구는 정식 방침 확정 시 갱신될 수 있습니다.',
} as const;

/**
 * Daboim 서비스의 외부 AI 처리 고지. 테넌트 방문자 방침이 아니라,
 * Daboim 고객이 명시적으로 AI 기능을 요청할 때의 서비스 처리에만 적용한다.
 * 실제 법인명·처리 국가·보관 조건은 공급자 계약 확인 전에 지어내지 않는다.
 */
export const EXTERNAL_AI_PROCESSING_DISCLOSURE = {
  heading: '외부 AI 서비스 처리 위탁',
  processors:
    '수탁·처리 서비스: Google AI 서비스(이미지·영상 생성 및 문서 인식), Anthropic AI 서비스(텍스트 생성).',
  data:
    '처리 항목: 고객이 AI 기능에 제공한 사업 정보·지시문·콘텐츠와, 해당 기능을 위해 고객이 명시적으로 선택한 이미지·문서에 한합니다. 비밀번호와 결제정보는 AI 생성 요청에 전송하지 않습니다.',
  purpose:
    '처리 목적: 고객이 요청한 홈페이지 초안·문구·이미지·영상 생성과 문서 인식 기능을 제공하기 위함이며, 해당 요청에 필요한 범위로만 전송합니다.',
  terms:
    `외부 AI 사업자의 처리·보관·삭제 조건은 적용되는 공급자 계약과 정책에 따릅니다. AI 처리 여부·삭제·이용 제한에 대한 문의는 ${PUBLIC_BRAND_NAMES.brandBilingual} 개인정보 문의처로 접수할 수 있습니다.`,
  legalReview:
    '※ 법무 검토 대상: 수탁자의 정확한 법인명, 국외 처리·이전 국가, 보관·삭제 기간과 거부 방법은 정식 방침 확정 전 공급자 계약·운영 설정과 함께 확인해 갱신합니다.',
} as const;

/** 실제 발행 config에 다보임 수신 폼이 있을 때만 개인정보 수집으로 고지한다. */
export function siteCollectsPersonalData(config: SiteConfig): boolean {
  return config.pages.some((page) =>
    page.sections.some((section) => section.elements.some((element) => element.kind === 'form')),
  );
}

function contactLine(info: BusinessInfo): string {
  const parts = [
    info.businessName ? `상호: ${subjectName(info)}` : null,
    `${info.isPersonal ? '운영자' : '대표자'}: ${info.ownerName}`,
    info.businessNumber ? `사업자등록번호: ${info.businessNumber}` : null,
    info.mailOrderNumber ? `통신판매업 신고번호: ${info.mailOrderNumber}` : null,
    info.address ? `주소: ${info.address}` : null,
    `연락처: ${info.phone}`,
    info.email ? `이메일: ${info.email}` : null,
  ].filter(Boolean);
  return parts.join(' / ');
}

/** 문서 본문에서 사업 주체를 지칭하는 이름 — 개인 운영이면 운영자명 */
function subjectName(info: BusinessInfo): string {
  return info.businessName?.trim() || info.ownerName;
}

/** 개인정보처리방침 */
export function privacyPolicy(
  info: BusinessInfo,
  opts?: { collectsPersonalData?: boolean },
): LegalDocument {
  const collects = opts?.collectsPersonalData ?? false;
  const items = collects
    ? '이름, 연락처(전화·이메일), 문의·예약 시 입력한 내용'
    : '(별도 수집 항목 없음 — 문의/예약 등 개인정보를 입력받는 기능을 사용하는 경우에 한해 수집)';

  return {
    title: '개인정보처리방침',
    updatedNote:
      '본 방침은 관련 법령 및 내부 방침에 따라 변경될 수 있습니다. 익명 성과 측정 고지는 법무 검토 대상입니다.',
    sections: [
      {
        heading: '1. 개인정보의 수집 항목 및 방법',
        body: [
          `${subjectName(info)}(이하 "사업자")는 다음의 개인정보를 수집할 수 있습니다: ${items}.`,
          '개인정보는 이용자가 문의·예약 등 서비스 이용 과정에서 자발적으로 제공하는 경우에 한해 수집됩니다.',
        ],
      },
      {
        heading: '2. 개인정보의 이용 목적',
        body: [
          '수집한 개인정보는 문의 응대, 예약 확인·안내, 서비스 제공 및 고객 관리 목적으로만 이용됩니다.',
        ],
      },
      {
        heading: '3. 익명 성과 측정 및 월간 리포트',
        body: [
          ANONYMOUS_SITE_EVENT_DISCLOSURE.collected,
          ANONYMOUS_SITE_EVENT_DISCLOSURE.purpose,
          ANONYMOUS_SITE_EVENT_DISCLOSURE.excluded,
          ANONYMOUS_SITE_EVENT_DISCLOSURE.retention,
          ANONYMOUS_SITE_EVENT_DISCLOSURE.legalReview,
        ],
      },
      {
        heading: '4. 개인정보의 보유 및 이용 기간',
        body: [
          '수집 목적 달성 후 지체 없이 파기함을 원칙으로 하며, 관계 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.',
        ],
      },
      {
        heading: '5. 개인정보의 제3자 제공',
        body: [
          '사업자는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 특별한 규정이 있는 경우는 예외로 합니다.',
        ],
      },
      {
        heading: '6. 이용자의 권리',
        body: [
          '이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 언제든지 요청할 수 있으며, 사업자는 관련 법령에 따라 지체 없이 조치합니다.',
        ],
      },
      {
        heading: '7. 개인정보 보호책임자',
        body: [
          `개인정보 보호책임자: ${info.ownerName}`,
          `문의: ${info.phone}${info.email ? ` / ${info.email}` : ''}`,
          contactLine(info),
        ],
      },
    ],
  };
}

/** 이용약관 */
export function termsOfService(info: BusinessInfo): LegalDocument {
  return {
    title: '이용약관',
    updatedNote: '본 약관은 관련 법령 및 내부 방침에 따라 변경될 수 있습니다.',
    sections: [
      {
        heading: '제1조 (목적)',
        body: [
          `본 약관은 ${subjectName(info)}(이하 "사업자")가 제공하는 웹사이트 및 서비스의 이용조건과 절차, 이용자와 사업자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.`,
        ],
      },
      {
        heading: '제2조 (서비스의 제공)',
        body: [
          '사업자는 웹사이트를 통해 매장·서비스 정보, 문의·예약 안내 등을 제공합니다. 제공 내용은 사업자의 사정에 따라 변경될 수 있습니다.',
        ],
      },
      {
        heading: '제3조 (이용자의 의무)',
        body: [
          '이용자는 관계 법령, 본 약관의 규정, 이용안내 및 공지사항을 준수해야 하며, 사업자의 업무를 방해하는 행위를 하여서는 안 됩니다.',
        ],
      },
      {
        heading: '제4조 (책임의 제한)',
        body: [
          '사업자는 천재지변, 이용자의 귀책사유 등 사업자의 통제 범위를 벗어난 사유로 인한 손해에 대하여 책임을 지지 않습니다.',
        ],
      },
      {
        heading: '제5조 (사업자 정보)',
        body: [contactLine(info)],
      },
    ],
  };
}
