import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { isMockMode } from '@/lib/env';
import {
  DEMO_VIEW_QA_COOKIE_MAX_AGE_SECONDS,
  type DemoViewClientPayload,
  type DemoViewStoredInput,
  clampDemoViewTelemetry,
} from './view-tracking-contract';

interface HmacKeyring {
  currentVersion: number;
  keys: ReadonlyMap<number, string>;
}

const MOCK_HMAC_SECRET = 'daboim-us-demo-mock-secret-2026-07';

function readHmacKeyring(): HmacKeyring {
  if (isMockMode() && !process.env.DEMO_TRACKING_HMAC_KEYS) {
    return { currentVersion: 1, keys: new Map([[1, MOCK_HMAC_SECRET]]) };
  }
  const raw = process.env.DEMO_TRACKING_HMAC_KEYS?.trim() ?? '';
  const currentVersion = Number(process.env.DEMO_TRACKING_HMAC_KEY_VERSION);
  const keys = new Map<number, string>();
  for (const entry of raw.split(',').map((part) => part.trim()).filter(Boolean)) {
    const separator = entry.indexOf(':');
    const version = Number(entry.slice(0, separator));
    const secret = entry.slice(separator + 1);
    if (separator > 0 && Number.isSafeInteger(version) && version > 0 && secret.length >= 32) {
      keys.set(version, secret);
    }
  }
  if (!Number.isSafeInteger(currentVersion) || !keys.has(currentVersion)) {
    throw new Error('DEMO_TRACKING_HMAC_NOT_CONFIGURED');
  }
  return { currentVersion, keys };
}

function hmacHex(secret: string, scope: string, value: string): string {
  return createHmac('sha256', secret).update(`${scope}\0${value}`, 'utf8').digest('hex');
}

export function demoRequestIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unavailable';
}

export function hashDemoViewIdentity(input: {
  slug: string;
  clientVisitorId?: string;
  clientSessionId?: string;
  fallbackSessionSeed?: string;
  ip: string;
  userAgent: string;
}): Pick<DemoViewStoredInput, 'visitorId' | 'sessionId' | 'ipHash' | 'hashKeyVersion'> {
  const keyring = readHmacKeyring();
  const secret = keyring.keys.get(keyring.currentVersion)!;
  const ipHash = hmacHex(secret, 'ip', input.ip);
  const fallbackVisitor = `${input.slug}|${ipHash}|${input.userAgent}`;
  const visitorMaterial = input.clientVisitorId || fallbackVisitor;
  const visitorId = hmacHex(secret, 'visitor', `${input.slug}|${visitorMaterial}`);
  const sessionMaterial = input.clientSessionId
    || `${visitorId}|${input.fallbackSessionSeed || 'fallback-session'}`;
  const sessionId = hmacHex(secret, 'session', `${input.slug}|${sessionMaterial}`);
  return {
    visitorId,
    sessionId,
    ipHash,
    hashKeyVersion: keyring.currentVersion,
  };
}

export function isInternalDemoIpHash(ipHash: string): boolean {
  return (process.env.DEMO_TRACKING_INTERNAL_IP_HASHES ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(ipHash.toLowerCase());
}

export function createDemoQaCookieValue(now = new Date()): string {
  const keyring = readHmacKeyring();
  const secret = keyring.keys.get(keyring.currentVersion)!;
  const expiresAt = Math.floor(now.getTime() / 1_000) + DEMO_VIEW_QA_COOKIE_MAX_AGE_SECONDS;
  const body = `${keyring.currentVersion}.${expiresAt}`;
  const signature = hmacHex(secret, 'qa-cookie', body);
  return `${body}.${signature}`;
}

export function isDemoQaCookieValue(value: string | undefined, now = new Date()): boolean {
  if (!value) return false;
  const [versionRaw, expiresRaw, signature, ...rest] = value.split('.');
  if (rest.length > 0 || !signature) return false;
  const version = Number(versionRaw);
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(version) || !Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt <= Math.floor(now.getTime() / 1_000)) return false;
  let keyring: HmacKeyring;
  try {
    keyring = readHmacKeyring();
  } catch {
    return false;
  }
  const secret = keyring.keys.get(version);
  if (!secret) return false;
  const expected = hmacHex(secret, 'qa-cookie', `${version}.${expiresAt}`);
  const actualBytes = Buffer.from(signature, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

export function storedDemoViewInput(input: {
  previewId: string;
  payload: DemoViewClientPayload;
  request: Request;
  now?: Date;
}): DemoViewStoredInput {
  const now = input.now ?? new Date();
  const userAgent = input.request.headers.get('user-agent') ?? '';
  const identity = hashDemoViewIdentity({
    slug: input.payload.slug,
    clientVisitorId: input.payload.visitorId,
    clientSessionId: input.payload.sessionId,
    fallbackSessionSeed: input.payload.openedAt,
    ip: demoRequestIp(input.request),
    userAgent,
  });
  const telemetry = clampDemoViewTelemetry(input.payload);
  const openedAtMs = Date.parse(telemetry.openedAt);
  const minOpenedAt = now.getTime() - 86_400_000;
  const maxOpenedAt = now.getTime() + 5 * 60_000;
  return {
    previewId: input.previewId,
    slug: input.payload.slug,
    eventId: input.payload.eventId,
    ...identity,
    ...telemetry,
    openedAt: new Date(Math.max(minOpenedAt, Math.min(maxOpenedAt, openedAtMs))).toISOString(),
  };
}
