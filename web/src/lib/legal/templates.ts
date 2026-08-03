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
    '페이지 조회, 전화·예약·길찾기·카카오 상담·인스타그램 링크 클릭, 폼 제출 여부와 유입 출처 분류(네이버·구글·인스타그램·직접 방문/사이트 내부·기타)를 사이트·날짜 단위의 집계 건수로 저장합니다.',
  purpose:
    '집계 정보는 웹사이트 운영 성과 확인과 월간 성과 리포트 생성·제공에만 사용합니다.',
  excluded:
    '성과 측정 저장소에는 이름·연락처 등 개인정보, IP 주소, 원문 리퍼러(raw referrer), 방문자·세션 식별자, 클릭한 원문 주소, 폼 입력 내용을 저장하지 않습니다. 전송 재시도 중복을 막는 일회성 번호는 방문자와 연결하지 않고 48시간 뒤 삭제합니다.',
  retention:
    '익명 집계 정보와 이를 바탕으로 생성한 월간 성과 리포트는 집계 기준월부터 24개월 동안 보관한 뒤 삭제합니다.',
  legalReview:
    '※ 법무 검토 대상: 익명 성과 측정의 수집 항목·보관 기간·고지 문구는 정식 방침 확정 시 갱신될 수 있습니다.',
} as const;

/**
 * Anaks Labs 서비스의 외부 AI 처리 고지. 테넌트 방문자 방침이 아니라,
 * Anaks Labs 고객이 명시적으로 AI 기능을 요청할 때의 서비스 처리에만 적용한다.
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

/**
 * CRAWL — Anaks Labs 운영자가 직접 지정한 공개 URL의 이전 제안 초안 처리 고지.
 *
 * 테넌트 방문자 방침이 아니라 Anaks Labs 고객·잠재 고객을 위한 서비스 처리에만 적용한다.
 * 정식 방침 확정 전에도 코드와 화면이 같은 고정 문구를 소비하도록 하며 AI가 작성하지 않는다.
 */
export const DESIGNATED_CRAWL_DISCLOSURE = {
  heading: '지정 공개 페이지 확인 및 이전 초안',
  collected:
    '운영자가 직접 지정한 공개 웹페이지에서 상호, 공개 연락처, 공개 인물명, 페이지 문구와 자산 주소를 확인할 수 있습니다. 로그인하거나 회원 전용 영역에 들어가지 않으며, 쿠키·세션·원문 HTML·이미지 파일·방문자 IP·브라우저 정보는 저장하지 않습니다.',
  purpose:
    '확인한 정보는 해당 사업자에게 보여드릴 이전 제안 초안과 개선 필요 신호를 만드는 데만 사용하며, 사장님 확인 전에는 발행하거나 사실 정보로 확정하지 않습니다.',
  retention:
    '확인 자료는 최대 30일, 읽기 전용 공유 초안은 최대 14일 보관한 뒤 삭제합니다. 공유 링크를 받은 사람은 만료 전까지 초안을 볼 수 있으므로 필요한 사람에게만 전달해야 합니다.',
  imageRights:
    '원문에서 찾은 사진은 사용 권리를 확인하기 전에는 공유 초안이나 발행 사이트에 사용하지 않습니다.',
  legalReview:
    '※ 법무 검토 대상: 공개 연락처·인물명 보관, 공유 링크 전달 위험, 원문 사진 권리 확인 절차는 정식 방침 확정 전에 검토합니다.',
} as const;

/**
 * US-DEMO — expiring outreach-demo view measurement exception.
 *
 * This is a fixed interim draft for Anaks Labs's own privacy page, not a tenant-site disclosure.
 * Andy and legal counsel must confirm the wording before the outreach demo goes live.
 */
export const US_DEMO_VIEW_DISCLOSURE = {
  heading: '미국 병원 비공개 데모 열람 측정 예외',
  collected:
    '14일 한시 비공개 데모에서는 열람 횟수, 열람 시각대·시간대, 활성 시간, 최대 스크롤 위치, 살펴본 구간과 기기 구분을 1차 당사자 방식으로 측정할 수 있습니다. 재방문 구분을 위해 브라우저·세션 식별자를 서버에서 다시 익명화해 저장하며, 접속 IP는 원문을 저장하지 않고 버전이 붙은 비밀키로 만든 HMAC-SHA-256 해시만 보관합니다.',
  purpose:
    '측정 정보는 데모 품질 점검, 관심 구간 확인, 후속 연락 시점 판단에만 사용합니다. 재방문은 강한 재관심 또는 전달 가능성 신호일 뿐 공유·구매를 확정하지 않습니다.',
  excluded:
    '원본 IP 주소, 브라우저 user-agent 문자열, 전체 방문 경로가 포함된 리퍼러, 환자 정보와 문의·예약 내용은 저장하지 않습니다. 제3자 분석 스크립트도 사용하지 않습니다.',
  retention:
    '데모 열람 행과 알림 기록은 수신 후 최대 30일 보관한 뒤 삭제합니다. 내부 품질검수와 자동화된 봇 열람은 저장 전에 제외합니다.',
  legalReview:
    '※ 법무 검토 전 초안: 라이브 운영 전에 미국 대상 고지 범위, HMAC 식별자 처리, 보관 기간과 이용자 권리 문구를 Andy와 법무가 최종 확인해야 합니다.',
} as const;

/** 실제 발행 config에 Anaks Labs 수신 폼이 있을 때만 개인정보 수집으로 고지한다. */
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
