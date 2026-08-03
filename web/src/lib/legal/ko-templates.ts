/**
 * Archived Korean tenant templates from the Daboim product.
 *
 * This module is intentionally not imported by any Anaks Labs production route. It is preserved
 * only as the isolated KO source requested during the fork and is not approved for US use.
 */
import type { BusinessInfo } from '@/lib/types/site';
import type { LegalDocument } from './templates';

export const KO_TENANT_LEGAL_TEMPLATES_STATUS = 'archived-ko-only-unused' as const;

function subjectName(info: BusinessInfo): string {
  return info.businessName?.trim() || info.ownerName;
}

function contactLine(info: BusinessInfo): string {
  return [
    info.businessName ? `상호: ${subjectName(info)}` : null,
    `${info.isPersonal ? '운영자' : '대표자'}: ${info.ownerName}`,
    info.businessNumber ? `사업자등록번호: ${info.businessNumber}` : null,
    info.mailOrderNumber ? `통신판매업 신고번호: ${info.mailOrderNumber}` : null,
    info.address ? `주소: ${info.address}` : null,
    `연락처: ${info.phone}`,
    info.email ? `이메일: ${info.email}` : null,
  ].filter(Boolean).join(' / ');
}

export function koPrivacyPolicy(
  info: BusinessInfo,
  opts?: { collectsPersonalData?: boolean },
): LegalDocument {
  const items = opts?.collectsPersonalData
    ? '이름, 연락처(전화·이메일), 문의·예약 시 입력한 내용'
    : '(별도 수집 항목 없음 — 문의/예약 등 개인정보를 입력받는 기능을 사용하는 경우에 한해 수집)';
  return {
    title: '개인정보처리방침',
    updatedNote: '본 방침은 관련 법령 및 내부 방침에 따라 변경될 수 있습니다.',
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
        body: ['수집한 개인정보는 문의 응대, 예약 확인·안내, 서비스 제공 및 고객 관리 목적으로만 이용됩니다.'],
      },
      {
        heading: '3. 개인정보의 보유 및 이용 기간',
        body: ['수집 목적 달성 후 지체 없이 파기함을 원칙으로 하며, 관계 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.'],
      },
      {
        heading: '4. 개인정보의 제3자 제공',
        body: ['사업자는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 특별한 규정이 있는 경우는 예외로 합니다.'],
      },
      {
        heading: '5. 이용자의 권리',
        body: ['이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다.'],
      },
      {
        heading: '6. 개인정보 보호책임자',
        body: [`개인정보 보호책임자: ${info.ownerName}`, `문의: ${info.phone}${info.email ? ` / ${info.email}` : ''}`, contactLine(info)],
      },
    ],
  };
}

export function koTermsOfService(info: BusinessInfo): LegalDocument {
  return {
    title: '이용약관',
    updatedNote: '본 약관은 관련 법령 및 내부 방침에 따라 변경될 수 있습니다.',
    sections: [
      {
        heading: '제1조 (목적)',
        body: [`본 약관은 ${subjectName(info)}(이하 "사업자")가 제공하는 웹사이트 및 서비스의 이용조건과 절차, 이용자와 사업자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.`],
      },
      {
        heading: '제2조 (서비스의 제공)',
        body: ['사업자는 웹사이트를 통해 매장·서비스 정보, 문의·예약 안내 등을 제공합니다. 제공 내용은 사업자의 사정에 따라 변경될 수 있습니다.'],
      },
      {
        heading: '제3조 (이용자의 의무)',
        body: ['이용자는 관계 법령, 본 약관의 규정, 이용안내 및 공지사항을 준수해야 하며, 사업자의 업무를 방해하는 행위를 하여서는 안 됩니다.'],
      },
      {
        heading: '제4조 (책임의 제한)',
        body: ['사업자는 천재지변, 이용자의 귀책사유 등 사업자의 통제 범위를 벗어난 사유로 인한 손해에 대하여 책임을 지지 않습니다.'],
      },
      { heading: '제5조 (사업자 정보)', body: [contactLine(info)] },
    ],
  };
}
