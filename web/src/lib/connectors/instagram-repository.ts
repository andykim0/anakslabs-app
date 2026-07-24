import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import {
  decryptInstagramToken,
  encryptInstagramToken,
  type EncryptedInstagramToken,
} from './instagram-crypto';

export interface InstagramCacheItem {
  id: string;
  assetId: string;
  renditionUrl: string;
  permalink: string;
  alt: string;
}

export interface InstagramCachePayload {
  profileUrl: string;
  username: string;
  items: InstagramCacheItem[];
}

interface CredentialRecord extends EncryptedInstagramToken {
  tokenExpiresAt: string | null;
  status: 'active' | 'reauthorization_required' | 'disabled';
}

interface CacheRecord {
  payload: InstagramCachePayload;
  fetchedAt: string;
  expiresAt: string;
  lastErrorCode: string | null;
}

const MOCK_KEY = '__daboimInstagramConnectorStore__' as const;
type MockStore = {
  credentials: Map<string, CredentialRecord>;
  caches: Map<string, CacheRecord>;
};
type GlobalWithMockStore = typeof globalThis & { [MOCK_KEY]?: MockStore };

function mockStore(): MockStore {
  const global = globalThis as GlobalWithMockStore;
  return global[MOCK_KEY] ??= {
    credentials: new Map<string, CredentialRecord>(),
    caches: new Map<string, CacheRecord>(),
  };
}

function cleanErrorCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_:-]/gu, '_').slice(0, 80);
  return normalized || 'CONNECTOR_ERROR';
}

export async function saveInstagramCredential(input: {
  siteId: string;
  accessToken: string;
  tokenExpiresAt?: string | null;
}): Promise<{ keyVersion: number }> {
  const encrypted = encryptInstagramToken(input.accessToken);
  const record: CredentialRecord = {
    ...encrypted,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    status: 'active',
  };
  if (isMockMode()) {
    mockStore().credentials.set(input.siteId, record);
    return { keyVersion: encrypted.keyVersion };
  }
  const { error } = await getServiceRoleClient()
    .from('site_connector_credentials')
    .upsert({
      site_id: input.siteId,
      connector_type: 'instagram',
      key_version: encrypted.keyVersion,
      ciphertext: encrypted.ciphertext,
      initialization_iv: encrypted.initializationIv,
      auth_tag: encrypted.authTag,
      token_expires_at: input.tokenExpiresAt ?? null,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'site_id,connector_type' });
  if (error) throw new Error(`INSTAGRAM_CREDENTIAL_SAVE_FAILED: ${error.code ?? 'DATABASE'}`);
  return { keyVersion: encrypted.keyVersion };
}

export async function readInstagramAccessToken(siteId: string): Promise<{
  accessToken: string;
  keyVersion: number;
  tokenExpiresAt: string | null;
} | null> {
  let record: CredentialRecord | null = null;
  if (isMockMode()) {
    record = mockStore().credentials.get(siteId) ?? null;
  } else {
    const { data, error } = await getServiceRoleClient()
      .from('site_connector_credentials')
      .select('key_version,ciphertext,initialization_iv,auth_tag,token_expires_at,status')
      .eq('site_id', siteId)
      .eq('connector_type', 'instagram')
      .maybeSingle();
    if (error) throw new Error(`INSTAGRAM_CREDENTIAL_READ_FAILED: ${error.code ?? 'DATABASE'}`);
    if (data) {
      record = {
        keyVersion: Number(data.key_version),
        ciphertext: String(data.ciphertext),
        initializationIv: String(data.initialization_iv),
        authTag: String(data.auth_tag),
        tokenExpiresAt: data.token_expires_at ? String(data.token_expires_at) : null,
        status: data.status as CredentialRecord['status'],
      };
    }
  }
  if (
    !record ||
    record.status !== 'active' ||
    (record.tokenExpiresAt && Date.parse(record.tokenExpiresAt) <= Date.now())
  ) return null;
  return {
    accessToken: decryptInstagramToken(record),
    keyVersion: record.keyVersion,
    tokenExpiresAt: record.tokenExpiresAt,
  };
}

export async function writeInstagramCache(input: {
  siteId: string;
  payload: InstagramCachePayload;
  fetchedAt: string;
  expiresAt: string;
  lastErrorCode?: string | null;
}): Promise<void> {
  const record: CacheRecord = {
    payload: input.payload,
    fetchedAt: input.fetchedAt,
    expiresAt: input.expiresAt,
    lastErrorCode: cleanErrorCode(input.lastErrorCode),
  };
  if (isMockMode()) {
    mockStore().caches.set(input.siteId, record);
    return;
  }
  const { error } = await getServiceRoleClient()
    .from('site_connector_cache')
    .upsert({
      site_id: input.siteId,
      connector_type: 'instagram',
      cache_payload: input.payload,
      fetched_at: input.fetchedAt,
      expires_at: input.expiresAt,
      last_error_code: record.lastErrorCode,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'site_id,connector_type' });
  if (error) throw new Error(`INSTAGRAM_CACHE_SAVE_FAILED: ${error.code ?? 'DATABASE'}`);
}

export async function readInstagramCache(siteId: string): Promise<CacheRecord | null> {
  if (isMockMode()) return mockStore().caches.get(siteId) ?? null;
  const { data, error } = await getServiceRoleClient()
    .from('site_connector_cache')
    .select('cache_payload,fetched_at,expires_at,last_error_code')
    .eq('site_id', siteId)
    .eq('connector_type', 'instagram')
    .maybeSingle();
  if (error) throw new Error(`INSTAGRAM_CACHE_READ_FAILED: ${error.code ?? 'DATABASE'}`);
  if (!data) return null;
  return {
    payload: data.cache_payload as InstagramCachePayload,
    fetchedAt: String(data.fetched_at),
    expiresAt: String(data.expires_at),
    lastErrorCode: data.last_error_code ? String(data.last_error_code) : null,
  };
}
