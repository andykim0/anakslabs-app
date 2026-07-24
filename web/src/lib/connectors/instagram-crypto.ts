import 'server-only';
import {
  decryptInstagramTokenWithKeyring,
  encryptInstagramTokenWithKeyring,
  type EncryptedInstagramToken,
  type InstagramTokenKeyring,
} from './instagram-crypto-core';

function decodeKey(raw: string): Buffer {
  const value = raw.trim();
  const key = /^[0-9a-f]{64}$/iu.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.byteLength !== 32) {
    throw new Error('INSTAGRAM_TOKEN_KEY_INVALID: AES-256 key must be exactly 32 bytes');
  }
  return key;
}

/** 키 버전별 env map을 지원해 기존 암호문을 읽는 동안 새 키로 순차 회전할 수 있다. */
export function readInstagramTokenKeyring(
  source: NodeJS.ProcessEnv = process.env,
): InstagramTokenKeyring {
  const currentVersion = Number(source.INSTAGRAM_TOKEN_KEY_VERSION ?? '1');
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    throw new Error('INSTAGRAM_TOKEN_KEY_VERSION_INVALID');
  }
  const keys = new Map<number, Buffer>();
  const encodedMap = source.INSTAGRAM_TOKEN_KEYS?.trim();
  if (encodedMap) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(encodedMap);
    } catch {
      throw new Error('INSTAGRAM_TOKEN_KEYS_INVALID');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('INSTAGRAM_TOKEN_KEYS_INVALID');
    }
    Object.entries(parsed).forEach(([version, raw]) => {
      const numberVersion = Number(version);
      if (!Number.isSafeInteger(numberVersion) || numberVersion < 1 || typeof raw !== 'string') {
        throw new Error('INSTAGRAM_TOKEN_KEYS_INVALID');
      }
      keys.set(numberVersion, decodeKey(raw));
    });
  }
  const current = source.INSTAGRAM_TOKEN_KEY?.trim();
  if (current) keys.set(currentVersion, decodeKey(current));
  if (!keys.has(currentVersion)) throw new Error('INSTAGRAM_TOKEN_KEY_MISSING');
  return { currentVersion, keys };
}

export function encryptInstagramToken(
  plaintext: string,
  keyring: InstagramTokenKeyring = readInstagramTokenKeyring(),
): EncryptedInstagramToken {
  return encryptInstagramTokenWithKeyring(plaintext, keyring);
}

export function decryptInstagramToken(
  encrypted: EncryptedInstagramToken,
  keyring: InstagramTokenKeyring = readInstagramTokenKeyring(),
): string {
  return decryptInstagramTokenWithKeyring(encrypted, keyring);
}

export type { EncryptedInstagramToken, InstagramTokenKeyring };
