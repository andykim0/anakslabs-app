import { STOCK_COLLECTION_ID } from './types';

export const PEXELS_RATE_LIMITS = {
  hourly: 200,
  monthly: 20_000,
  cacheMs: 24 * 60 * 60 * 1_000,
} as const;

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color: string | null;
  alt: string | null;
  src: {
    original: string;
    large2x: string;
  };
}

interface PexelsCollectionResponse {
  id: string;
  media: PexelsPhoto[];
  next_page?: string;
}

interface CachedCollection {
  expiresAt: number;
  photos: readonly PexelsPhoto[];
}

const cache = new Map<string, CachedCollection>();

export class PexelsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PexelsApiError';
  }
}

function requiredApiKey(env: NodeJS.ProcessEnv): string {
  const value = env.PEXELS_API_KEY?.trim();
  if (!value) throw new PexelsApiError('PEXELS_API_KEY is required for the offline stock sync.');
  return value;
}

function positiveHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value || !/^\d+$/u.test(value)) return null;
  return Number(value);
}

/** Offline sync only. Public rendering consumes the frozen local manifest. */
export async function fetchInteriorMaterialsCollection(input: {
  env?: NodeJS.ProcessEnv;
  now?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<readonly PexelsPhoto[]> {
  const now = input.now ?? Date.now();
  const hit = cache.get(STOCK_COLLECTION_ID);
  if (hit && hit.expiresAt > now) return hit.photos;

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.pexels.com/v1/collections/${STOCK_COLLECTION_ID}?type=photos&per_page=80&sort=asc`,
    { headers: { Authorization: requiredApiKey(input.env ?? process.env) } },
  );
  if (!response.ok) {
    throw new PexelsApiError(`Pexels collection request failed with ${response.status}.`);
  }
  const hourlyRemaining = positiveHeader(response, 'x-ratelimit-remaining');
  const monthlyRemaining = positiveHeader(response, 'x-ratelimit-monthly-remaining');
  if (hourlyRemaining === 0 || monthlyRemaining === 0) {
    throw new PexelsApiError('Pexels rate limit is exhausted; the frozen manifest remains authoritative.');
  }
  const payload = await response.json() as PexelsCollectionResponse;
  if (payload.id !== STOCK_COLLECTION_ID || !Array.isArray(payload.media)) {
    throw new PexelsApiError('Pexels collection response does not match the approved collection.');
  }
  const photos = [...payload.media]
    .filter((item): item is PexelsPhoto => item && typeof item.id === 'number')
    .sort((left, right) => left.id - right.id);
  cache.set(STOCK_COLLECTION_ID, {
    expiresAt: now + PEXELS_RATE_LIMITS.cacheMs,
    photos,
  });
  return photos;
}

export function clearPexelsCollectionCacheForTests(): void {
  cache.clear();
}
