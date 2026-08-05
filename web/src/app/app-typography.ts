/**
 * Anaks Labs application typeface — Space Grotesk, the face used by the
 * marketing site (anakslabs.com, `assets/site.css` `--sans`).
 *
 * Deliberately NOT part of `root-layout-contract.ts`: that contract is shared
 * with the tenant document roots (`app/s/layout.tsx`, `app/preview/[token]/layout.tsx`)
 * and customer sites must keep rendering with their own AI-generated theme fonts.
 * Only the application route groups — (auth), (dashboard), (admin), (marketing) —
 * import this module, so the brand face can never leak into a customer render.
 */
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-anaks-sans',
  subsets: ['latin'],
  display: 'swap',
});

/** Added to <html> of application route groups only. */
export const APP_BRAND_FONT_CLASS_NAME = spaceGrotesk.variable;

/**
 * Added to <body> of application route groups only. Carries the brand face and
 * surface (`.anakslabs-app` in `globals.css`) without touching the shared `body`
 * rule, which the tenant and share-preview roots also load.
 */
export const APP_BRAND_BODY_CLASS_NAME = 'anakslabs-app';
