import type { FrozenStockManifest } from './types';
import { WORKSHOP_STOCK_MANIFEST } from './workshop-manifest.generated';

export const STOCK_MANIFESTS = {
  workshop: WORKSHOP_STOCK_MANIFEST,
} as const satisfies Record<string, FrozenStockManifest>;

export function workshopStockManifest(): FrozenStockManifest {
  return STOCK_MANIFESTS.workshop;
}
