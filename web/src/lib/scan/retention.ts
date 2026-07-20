export const SCAN_RETENTION_DAYS = 30;

export function isScanExpired(createdAt: string, now = new Date()): boolean {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return true;
  return now.getTime() - createdMs > SCAN_RETENTION_DAYS * 86_400_000;
}
