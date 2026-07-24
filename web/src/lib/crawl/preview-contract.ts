import { createHash, randomBytes } from 'node:crypto';

export const IMPORT_PREVIEW_NOTICE_VERSION = 1 as const;
export const IMPORT_PREVIEW_NOTICE =
  '확인용 이전 초안입니다. 원문에서 가져온 정보는 사장님 확인 전에는 발행되지 않으며, 사진은 사용 권리를 확인한 뒤에만 반영됩니다.';
export const IMPORT_PREVIEW_BEARER_WARNING =
  '이 링크를 받은 사람은 만료 전까지 초안을 볼 수 있습니다. 필요한 사람에게만 전달하고, 공유가 끝나면 비활성화해 주세요.';

export function createPreviewBearerToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isPreviewBearerToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/u.test(value);
}

export function hashPreviewBearerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
