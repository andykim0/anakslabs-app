import type { BusinessFactAnswer } from '@/lib/types/domain';
import type { PublicContact, SiteConfig } from '@/lib/types/site';

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function normalizePublicContact(
  input: PublicContact | undefined,
): PublicContact | undefined {
  const phone = clean(input?.phone);
  const address = clean(input?.address);
  if (!phone && !address) return undefined;
  return {
    version: 1,
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
  };
}

/** 신규 생성 경계에서 고객이 확인한 사실만 공개 연락처 슬롯으로 승격한다. */
export function publicContactFromFacts(
  facts: readonly BusinessFactAnswer[],
): PublicContact | undefined {
  const latest = new Map(facts.map((fact) => [fact.key, clean(fact.value)]));
  return normalizePublicContact({
    version: 1,
    phone: latest.get('phone'),
    address: latest.get('address'),
  });
}

/**
 * 공개 연락처의 단일 소비 규칙.
 *
 * 법적 확인을 거친 businessInfo가 존재하면 그 안의 필드가 설문 슬롯보다 우선한다.
 * 개인 운영자처럼 businessInfo에 주소가 없는 경우에만 확인된 설문 주소를 유지한다.
 */
export function resolvePublicContact(config: SiteConfig): PublicContact | undefined {
  const survey = normalizePublicContact(config.publicContact);
  return normalizePublicContact({
    version: 1,
    phone: config.businessInfo?.phone ?? survey?.phone,
    address: config.businessInfo?.address ?? survey?.address,
  });
}

function phoneHref(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const compact = phone.trim().replace(/(?!^\+)[^0-9]/gu, '');
  return compact.replace(/\D/gu, '').length >= 7 ? `tel:${compact}` : undefined;
}

function replaceContactValue(
  value: string,
  stored: PublicContact,
  resolved: PublicContact,
): string {
  let next = value;
  if (stored.phone && resolved.phone && stored.phone !== resolved.phone) {
    next = next.replaceAll(stored.phone, resolved.phone);
  }
  if (stored.address && resolved.address && stored.address !== resolved.address) {
    next = next.replaceAll(stored.address, resolved.address);
  }
  return next;
}

/**
 * 저장 JSON을 바꾸지 않고 보이는 문의·오시는 길과 CTA를 권위 연락처로 투영한다.
 * publicContact가 없는 기존 config는 같은 객체를 그대로 반환해 HTML/SHA를 보존한다.
 */
export function projectAuthoritativePublicContact(config: SiteConfig): SiteConfig {
  const stored = normalizePublicContact(config.publicContact);
  if (!stored) return config;
  const resolved = resolvePublicContact(config);
  if (!resolved) return config;
  const changed = stored.phone !== resolved.phone || stored.address !== resolved.address;
  if (!changed) return config;

  const previousTel = phoneHref(stored.phone);
  const nextTel = phoneHref(resolved.phone);
  return {
    ...config,
    pages: config.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        elements: section.elements.map((element) => {
          if (element.kind === 'text') {
            const text = replaceContactValue(element.text, stored, resolved);
            return text === element.text ? element : { ...element, text };
          }
          if (element.kind === 'button') {
            const label = replaceContactValue(element.label, stored, resolved);
            const href = previousTel && nextTel && element.href === previousTel
              ? nextTel
              : element.href;
            return label === element.label && href === element.href
              ? element
              : { ...element, label, href };
          }
          return element;
        }),
      })),
    })),
  };
}

/** 에디터 저장 요청에서 클라이언트 값을 버리고 생성 서버가 기록한 슬롯만 보존한다. */
export function preserveServerPublicContact(
  incoming: SiteConfig,
  persisted: SiteConfig | null | undefined,
): SiteConfig {
  const serverValue = normalizePublicContact(persisted?.publicContact);
  const rest = { ...incoming };
  delete rest.publicContact;
  return { ...rest, ...(serverValue ? { publicContact: serverValue } : {}) };
}
