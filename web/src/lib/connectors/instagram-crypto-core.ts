import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

export interface EncryptedInstagramToken {
  keyVersion: number;
  ciphertext: string;
  initializationIv: string;
  authTag: string;
}

export interface InstagramTokenKeyring {
  currentVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}

export function encryptInstagramTokenWithKeyring(
  plaintext: string,
  keyring: InstagramTokenKeyring,
): EncryptedInstagramToken {
  const token = plaintext.trim();
  if (!token) throw new Error('INSTAGRAM_TOKEN_EMPTY');
  const key = keyring.keys.get(keyring.currentVersion);
  if (!key) throw new Error('INSTAGRAM_TOKEN_KEY_MISSING');
  const initializationIv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, initializationIv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    keyVersion: keyring.currentVersion,
    ciphertext: ciphertext.toString('base64'),
    initializationIv: initializationIv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptInstagramTokenWithKeyring(
  encrypted: EncryptedInstagramToken,
  keyring: InstagramTokenKeyring,
): string {
  const key = keyring.keys.get(encrypted.keyVersion);
  if (!key) throw new Error('INSTAGRAM_TOKEN_KEY_VERSION_UNAVAILABLE');
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encrypted.initializationIv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('INSTAGRAM_TOKEN_DECRYPT_FAILED');
  }
}
