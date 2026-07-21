import type { ProbedResource } from './fetch-target';

export const TRANSIENT_PROBE_RETRY_DELAY_MS = 120;

export function isTransientProbeFailure(resource: ProbedResource): boolean {
  return resource.status === 429 || (resource.status !== null && resource.status >= 500);
}

export async function retryTransientProbe(
  probe: () => Promise<ProbedResource>,
  wait: (milliseconds: number) => Promise<void>,
): Promise<ProbedResource> {
  const first = await probe();
  if (!isTransientProbeFailure(first)) return first;
  await wait(TRANSIENT_PROBE_RETRY_DELAY_MS);
  return probe();
}
