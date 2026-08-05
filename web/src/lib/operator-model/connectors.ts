import {
  businessDirectionsHref,
  businessPhoneHref,
} from '@/lib/analytics/trackable-actions';
import { connectorCatalogEntry } from '@/lib/connectors/catalog';
import type {
  SiteConnector,
  SiteConnectorManifest,
} from '@/lib/connectors/types';
import { CONNECTOR_CATALOG_VERSION } from '@/lib/connectors/types';
import { isAcceptableUsBookingUrl } from '@/lib/connectors/validation';
import type { SiteConfig } from '@/lib/types/site';

const OPERATOR_MANAGED_CONNECTOR_IDS = new Set<SiteConnector['id']>([
  'tel',
  'booking',
  'map',
]);

export interface OperatorConnectorInput {
  phone?: string;
  bookingUrl?: string;
  address?: string;
}

export interface OperatorConnectorPatch {
  phone?: string | null;
  bookingUrl?: string | null;
  address?: string | null;
}

function telConnector(phone: string): SiteConnector {
  const displayPhone = phone.trim();
  const href = businessPhoneHref(displayPhone);
  if (!href) throw new Error('INVALID_OPERATOR_PHONE');
  return {
    id: 'tel',
    label: connectorCatalogEntry('tel').label,
    href,
    displayPhone,
  };
}

function bookingConnector(bookingUrl: string): SiteConnector {
  const href = bookingUrl.trim();
  if (!isAcceptableUsBookingUrl(href)) throw new Error('INVALID_OPERATOR_BOOKING_URL');
  return {
    id: 'booking',
    label: connectorCatalogEntry('booking').label,
    href,
  };
}

function mapConnector(address: string): SiteConnector {
  const normalized = address.trim();
  const href = businessDirectionsHref(normalized, 'en-US');
  if (!href) throw new Error('INVALID_OPERATOR_ADDRESS');
  return {
    id: 'map',
    label: connectorCatalogEntry('map').label,
    href,
    address: normalized,
  };
}

function nonOperatorItems(config: SiteConfig): SiteConnector[] {
  return (config.connectors?.items ?? []).filter(
    (item) => !OPERATOR_MANAGED_CONNECTOR_IDS.has(item.id),
  );
}

function withManifest(config: SiteConfig, items: SiteConnector[]): SiteConfig {
  const next = structuredClone(config);
  if (items.length === 0) {
    delete next.connectors;
    return next;
  }
  next.connectors = {
    catalogVersion: CONNECTOR_CATALOG_VERSION,
    items,
  };
  return next;
}

/**
 * Operator creation is explicit-only: crawled contact data is never promoted to a connector.
 * Existing provider-specific connector records remain untouched for backward compatibility.
 */
export function applyOperatorConnectorInput(
  config: SiteConfig,
  input: OperatorConnectorInput,
): SiteConfig {
  const items = nonOperatorItems(config);
  if (input.phone !== undefined) items.push(telConnector(input.phone));
  if (input.bookingUrl !== undefined) items.push(bookingConnector(input.bookingUrl));
  if (input.address !== undefined) items.push(mapConnector(input.address));
  return withManifest(config, items);
}

function existingOperatorItem(
  config: SiteConfig,
  id: 'tel' | 'booking' | 'map',
): SiteConnector | undefined {
  return config.connectors?.items.find((item) => item.id === id);
}

/** Omitted fields preserve; null removes; a string replaces the server-managed connector. */
export function applyOperatorConnectorPatch(
  config: SiteConfig,
  patch: OperatorConnectorPatch,
): SiteConfig {
  const items = nonOperatorItems(config);
  const tel = patch.phone === undefined
    ? existingOperatorItem(config, 'tel')
    : patch.phone === null
      ? undefined
      : telConnector(patch.phone);
  const booking = patch.bookingUrl === undefined
    ? existingOperatorItem(config, 'booking')
    : patch.bookingUrl === null
      ? undefined
      : bookingConnector(patch.bookingUrl);
  const map = patch.address === undefined
    ? existingOperatorItem(config, 'map')
    : patch.address === null
      ? undefined
      : mapConnector(patch.address);
  if (tel) items.push(tel);
  if (booking) items.push(booking);
  if (map) items.push(map);
  return withManifest(config, items);
}

export function connectorManifestFromConfig(
  config: SiteConfig,
): SiteConnectorManifest | undefined {
  return config.connectors ? structuredClone(config.connectors) : undefined;
}
