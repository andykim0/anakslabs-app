import { createHash } from 'node:crypto';
import { isHttpsUrl, isSafeMediaSrc } from '@/lib/safe-url';

export interface ClinicUsDestination {
  readonly version: 1;
  readonly validated: true;
  readonly bookingUrl?: string;
  readonly phone?: string;
  readonly googleMapsUrl?: string;
}

export interface ClinicSourcePhoneProjection {
  readonly version: 1;
  readonly sourceBlockId: string;
  /** Exact crawl-source projection string; never inferred from a phone-shaped value. */
  readonly sourceText: string;
  readonly sourceSha256: string;
  readonly phone: string;
}

export interface ClinicRatingAggregateProjection {
  readonly version: 1;
  readonly validated: true;
  readonly rating: number;
  readonly userRatingCount: number;
  readonly googleMapsUri: string;
  readonly attribution: 'Google';
}

export interface ClinicProviderPhotoProjection {
  readonly version: 1;
  readonly providerBioBlockId: string;
  readonly src: string;
  readonly alt: string;
  readonly origin: 'customer_upload';
}

/** Internal preview-only photo projected from the immutable public crawl artifact. */
export interface ClinicPreviewProviderPhotoProjection {
  readonly version: 1;
  readonly providerBioBlockId: string;
  readonly src: string;
  readonly alt: string;
  readonly origin: 'prospect_public_source';
  readonly sourceImageId: string;
}

export type ClinicMasterExperience =
  | { readonly mode: 'demo' }
  | {
      readonly mode: 'preview-full';
      readonly destination?: ClinicUsDestination;
      readonly sourcePhone?: ClinicSourcePhoneProjection;
      readonly providerPhotos?: readonly ClinicPreviewProviderPhotoProjection[];
      readonly beforeAfterImages?: readonly {
        sourceImageId: string;
        src: string;
        alt: string;
      }[];
    }
  | {
      readonly mode: 'live';
      readonly destination?: ClinicUsDestination;
      readonly ratingAggregate?: ClinicRatingAggregateProjection;
      readonly providerPhotos?: readonly ClinicProviderPhotoProjection[];
    };

function googleMapsLinkIsValid(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return (
    (['google.com', 'www.google.com', 'maps.google.com'].includes(host)
      && url.pathname.startsWith('/maps'))
    || (host === 'maps.app.goo.gl' && url.pathname.length > 1)
  );
}

function normalizedUsPhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/gu, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/u.test(national)) return undefined;
  return `+1${national}`;
}

/** A preview Call action requires a hash-valid verbatim source block, not format inference. */
export function verifyClinicSourcePhone(input: {
  sourceBlockId: string;
  sourceText: string;
  sourceSha256: string;
}): ClinicSourcePhoneProjection | null {
  const sourceBlockId = input.sourceBlockId.trim();
  const sourceText = input.sourceText;
  const sourceSha256 = input.sourceSha256.toLowerCase();
  const actualSha256 = createHash('sha256').update(sourceText, 'utf8').digest('hex');
  const phone = normalizedUsPhone(sourceText);
  if (
    !sourceBlockId
    || sourceText.trim() !== sourceText
    || sourceSha256 !== actualSha256
    || !phone
  ) {
    return null;
  }
  return Object.freeze({
    version: 1,
    sourceBlockId,
    sourceText,
    sourceSha256,
    phone,
  });
}

/** 고객 확인을 마친 US 예약 목적지만 live 렌더 경계로 투영한다. */
export function verifyClinicUsDestination(input: {
  bookingUrl?: string;
  phone?: string;
  googleMapsUrl?: string;
}): ClinicUsDestination | null {
  const bookingUrl = input.bookingUrl?.trim();
  const phone = normalizedUsPhone(input.phone);
  const googleMapsUrl = input.googleMapsUrl?.trim();
  if (bookingUrl && !isHttpsUrl(bookingUrl)) return null;
  if (input.phone && !phone) return null;
  if (googleMapsUrl && !googleMapsLinkIsValid(googleMapsUrl)) return null;
  if (!bookingUrl && !phone && !googleMapsUrl) return null;
  return Object.freeze({
    version: 1,
    validated: true,
    ...(bookingUrl ? { bookingUrl } : {}),
    ...(phone ? { phone } : {}),
    ...(googleMapsUrl ? { googleMapsUrl } : {}),
  });
}

/** Google review text 없이 숫자 집계와 attribution 링크만 받는 별도 projection. */
export function verifyClinicRatingAggregate(input: {
  rating: number;
  userRatingCount: number;
  googleMapsUri: string;
}): ClinicRatingAggregateProjection | null {
  if (
    !Number.isFinite(input.rating)
    || input.rating < 1
    || input.rating > 5
    || Math.abs(input.rating * 10 - Math.round(input.rating * 10)) > 1e-9
    || !Number.isInteger(input.userRatingCount)
    || input.userRatingCount < 0
    || !googleMapsLinkIsValid(input.googleMapsUri)
  ) {
    return null;
  }
  return Object.freeze({
    version: 1,
    validated: true,
    rating: input.rating,
    userRatingCount: input.userRatingCount,
    googleMapsUri: input.googleMapsUri.trim(),
    attribution: 'Google',
  });
}

/** 고객 업로드 provenance가 확인된 실사진만 provider placeholder를 교체한다. */
export function verifyClinicProviderPhoto(input: {
  providerBioBlockId: string;
  src: string;
  alt: string;
  origin: 'customer_upload';
}): ClinicProviderPhotoProjection | null {
  const providerBioBlockId = input.providerBioBlockId.trim();
  const src = input.src.trim();
  const alt = input.alt.trim();
  if (
    input.origin !== 'customer_upload'
    || !providerBioBlockId
    || !isSafeMediaSrc(src)
    || !alt
  ) {
    return null;
  }
  return Object.freeze({
    version: 1,
    providerBioBlockId,
    src,
    alt,
    origin: 'customer_upload',
  });
}
