export interface DnaPipelineEnvironment {
  [key: string]: string | undefined;
  DNA_PIPELINE_ENABLED?: string;
}

/** Server-owned rollout switch. Missing, blank, and malformed values are OFF. */
export function dnaPipelineEnabled(
  environment: DnaPipelineEnvironment = process.env,
): boolean {
  return environment.DNA_PIPELINE_ENABLED === '1';
}
