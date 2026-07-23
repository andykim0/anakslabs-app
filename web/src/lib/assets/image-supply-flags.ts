export interface ImageSupplyEnvironment {
  [key: string]: string | undefined;
  REALISTIC_IMAGE_SUPPLY_ENABLED?: string;
}

/**
 * Server-owned supply readiness. The option stays hidden unless the licensed
 * stock pipeline is deliberately enabled with the exact value `1`.
 */
export function realisticImageSupplyEnabled(
  environment: ImageSupplyEnvironment = process.env,
): boolean {
  return environment.REALISTIC_IMAGE_SUPPLY_ENABLED === '1';
}
