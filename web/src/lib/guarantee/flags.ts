/**
 * The pilot guarantee is suspended until before/after evidence is available
 * and legal review is complete. Only an explicit server flag can re-enable it.
 */
export function guaranteeProgramEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.GUARANTEE_PROGRAM_ENABLED === '1';
}
