import type { MotionSignatureId } from '@/lib/types/site';

/**
 * Browser-only, content-free funnel telemetry for the onboarding motion upsell.
 *
 * This contract intentionally accepts only finite enums, booleans, and a registry
 * signature ID. Customer copy, business names, asset URLs, prompts, and owner/site
 * identifiers have no field through which they can enter the event.
 */
export const MOTION_UPSELL_CUSTOM_EVENT = 'daboim:motion-upsell-funnel' as const;
export const MOTION_UPSELL_DATA_LAYER_EVENT = 'daboim_motion_upsell_funnel' as const;

interface MotionUpsellEventBase {
  schemaVersion: 1;
  funnel: 'hero-motion-addon';
  surface: 'onboarding-motion-choice';
  signatureId: MotionSignatureId;
}

export type MotionUpsellFunnelEvent =
  | (MotionUpsellEventBase & {
      action: 'upsell_impression';
      addonOwned: boolean;
      videoRequired: boolean;
    })
  | (MotionUpsellEventBase & {
      action: 'preview_mode_toggle';
      mode: 'still' | 'motion';
      trigger: 'auto' | 'user';
    })
  | (MotionUpsellEventBase & {
      action: 'immersive_preview_open';
      alreadySelected: boolean;
      addonDemo: boolean;
      representativeMedia: boolean;
    })
  | (MotionUpsellEventBase & {
      action: 'addon_select' | 'addon_decline';
      addonOwned: boolean;
      videoRequired: boolean;
    });

export type MotionUpsellFunnelEventInput =
  | {
      action: 'upsell_impression';
      signatureId: MotionSignatureId;
      addonOwned: boolean;
      videoRequired: boolean;
    }
  | {
      action: 'preview_mode_toggle';
      signatureId: MotionSignatureId;
      mode: 'still' | 'motion';
      trigger: 'auto' | 'user';
    }
  | {
      action: 'immersive_preview_open';
      signatureId: MotionSignatureId;
      alreadySelected: boolean;
      addonDemo: boolean;
      representativeMedia: boolean;
    }
  | {
      action: 'addon_select' | 'addon_decline';
      signatureId: MotionSignatureId;
      addonOwned: boolean;
      videoRequired: boolean;
    };

export type MotionUpsellDataLayerEntry = MotionUpsellFunnelEvent & {
  event: typeof MOTION_UPSELL_DATA_LAYER_EVENT;
};

export interface MotionUpsellBrowserTarget {
  dispatchEvent?: (event: Event) => unknown;
  dataLayer?: {
    push: (entry: MotionUpsellDataLayerEntry) => unknown;
  };
}

const BASE_EVENT = {
  schemaVersion: 1,
  funnel: 'hero-motion-addon',
  surface: 'onboarding-motion-choice',
} as const;

/** Build an exact allowlisted payload instead of spreading caller-owned metadata. */
export function buildMotionUpsellFunnelEvent(
  input: MotionUpsellFunnelEventInput,
): MotionUpsellFunnelEvent {
  switch (input.action) {
    case 'upsell_impression':
      return Object.freeze({
        ...BASE_EVENT,
        action: input.action,
        signatureId: input.signatureId,
        addonOwned: input.addonOwned,
        videoRequired: input.videoRequired,
      });
    case 'preview_mode_toggle':
      return Object.freeze({
        ...BASE_EVENT,
        action: input.action,
        signatureId: input.signatureId,
        mode: input.mode,
        trigger: input.trigger,
      });
    case 'immersive_preview_open':
      return Object.freeze({
        ...BASE_EVENT,
        action: input.action,
        signatureId: input.signatureId,
        alreadySelected: input.alreadySelected,
        addonDemo: input.addonDemo,
        representativeMedia: input.representativeMedia,
      });
    case 'addon_select':
    case 'addon_decline':
      return Object.freeze({
        ...BASE_EVENT,
        action: input.action,
        signatureId: input.signatureId,
        addonOwned: input.addonOwned,
        videoRequired: input.videoRequired,
      });
  }
}

function browserTarget(): MotionUpsellBrowserTarget | undefined {
  if (typeof window === 'undefined') return undefined;
  return window as Window & MotionUpsellBrowserTarget;
}

/**
 * Emit to both the browser CustomEvent seam and an optional dataLayer-style
 * collector. Analytics must never block or alter the onboarding decision path.
 */
export function trackMotionUpsellFunnelEvent(
  input: MotionUpsellFunnelEventInput,
  target: MotionUpsellBrowserTarget | undefined = browserTarget(),
): MotionUpsellFunnelEvent {
  const detail = buildMotionUpsellFunnelEvent(input);
  if (!target) return detail;

  try {
    if (typeof target.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      target.dispatchEvent(new CustomEvent(MOTION_UPSELL_CUSTOM_EVENT, { detail }));
    }
  } catch {
    // Funnel telemetry is intentionally fail-open.
  }

  try {
    if (typeof target.dataLayer?.push === 'function') {
      target.dataLayer.push({ event: MOTION_UPSELL_DATA_LAYER_EVENT, ...detail });
    }
  } catch {
    // A third-party collector must never block a customer's selection.
  }

  return detail;
}
