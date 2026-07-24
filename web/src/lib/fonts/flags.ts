interface FontPairingEnvironment {
  [key: string]: string | undefined;
  FONT_PAIRINGS_ENABLED?: string;
}

/** New IDs are issued only for the exact opt-in value. Stored pins render independently. */
export function fontPairingsEnabled(
  environment: FontPairingEnvironment = process.env,
): boolean {
  return environment.FONT_PAIRINGS_ENABLED === '1';
}
