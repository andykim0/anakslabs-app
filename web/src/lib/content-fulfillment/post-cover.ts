/**
 * Cover image selection for published content posts.
 *
 * The rule this module exists to enforce: a cover may only depict a service the clinic has
 * actually declared. Nothing here reads the generated article — not its title, not its summary,
 * not its tags — because a model-written sentence is not evidence that a practice performs a
 * procedure, and an implant photo on a practice that does not place implants is a false claim
 * made in pictures. Categories come from the operator-declared service set; the article only
 * contributes its slot number, which decides rotation and nothing else.
 *
 * No declared services means no cover, and the card falls back to its accent field — a finished
 * state, not a degraded one.
 */
import {
  CLINIC_DENTAL_SERVICE_TAXONOMY,
  type ClinicServiceTaxonomyEntry,
} from '@/lib/clinic-master/service-taxonomy';
import { selectDentalStock } from '@/lib/clinic-master/dental-stock';
import type { DentalStockCategory } from '@/lib/clinic-master/dental-stock-types';
import type { SiteConfig } from '@/lib/types/site';

/**
 * Layout item id the newbuild compiler writes for each declared service. It is a server-built
 * identifier derived from the operator's `serviceIds`, which is what makes it usable as evidence:
 * it round-trips a declaration rather than describing generated copy.
 */
const SERVICE_ITEM_ID = /^clinic-service-newbuild-service-(.+)$/u;

/**
 * Slot identity written by `monthlySlotSlug` (`YYYY-MM-post-N`). Both parts come from the slot,
 * not from the article: the month decides which images a month draws from, the ordinal decides
 * which declared service it depicts.
 */
const SLOT_SLUG_IDENTITY = /^(\d{4}-\d{2})-post-(\d{1,2})$/u;

const TAXONOMY_BY_ID = new Map<string, ClinicServiceTaxonomyEntry>(
  CLINIC_DENTAL_SERVICE_TAXONOMY.map((entry: ClinicServiceTaxonomyEntry) => [entry.id, entry]),
);

/**
 * Stock categories for the services this site declared, in declaration order, deduplicated.
 * Unrecognized ids are dropped rather than guessed, so the result is always a subset of the real
 * taxonomy. A site without a clinic master pin returns nothing at all.
 */
export function pinnedServiceStockCategories(config: SiteConfig): DentalStockCategory[] {
  if (!config.clinicMaster) return [];
  const categories: DentalStockCategory[] = [];
  for (const page of config.pages) {
    for (const section of page.sections) {
      for (const item of section.sectionLayout?.items ?? []) {
        const serviceId = SERVICE_ITEM_ID.exec(item.id)?.[1];
        const entry = serviceId ? TAXONOMY_BY_ID.get(serviceId) : undefined;
        if (entry && !categories.includes(entry.stockCategory)) {
          categories.push(entry.stockCategory);
        }
      }
    }
  }
  return categories;
}

export interface SlotIdentity {
  /** Calendar month key, `YYYY-MM`. */
  period: string;
  ordinal: number;
}

/** The slot a post was provisioned into, or null for a slug that predates slot identity. */
export function slotIdentityFromSlug(slug: string): SlotIdentity | null {
  const match = SLOT_SLUG_IDENTITY.exec(slug);
  if (!match) return null;
  const ordinal = Number(match[2]);
  return Number.isSafeInteger(ordinal) && ordinal >= 1
    ? { period: match[1], ordinal }
    : null;
}

export interface PostCover {
  url: string;
  category: DentalStockCategory;
}

/**
 * Deterministic per-slot cover. The same site, pin, month and ordinal always resolve to the same
 * image, so a static export and the live page never disagree.
 *
 * The month is part of the selection seed, not decoration: without it every August post and every
 * September post in the same slot draw the identical photo, and a practice publishing eight posts
 * a month would show the same eight pictures forever.
 *
 * Editing the pinned services does change existing covers. That is accepted: the replacement is
 * still one of the practice's own declared services, so no post ever shows work the clinic does
 * not do. Freezing a cover at publish time would need a schema field to store it in.
 */
export function postCoverImage(input: {
  config: SiteConfig;
  siteId: string;
  slug: string;
}): PostCover | null {
  const categories = pinnedServiceStockCategories(input.config);
  const slot = slotIdentityFromSlug(input.slug);
  if (categories.length === 0 || !slot) return null;

  // Category rotation stays keyed on the ordinal alone: which service a slot depicts is a
  // property of the slot, not of the month it falls in.
  const category = categories[(slot.ordinal - 1) % categories.length];
  const asset = selectDentalStock({
    hospitalStableId: input.siteId,
    category,
    slot: 'atmosphere',
    accent: input.config.clinicMaster!.accentPreset,
    selectionSalt: `content-post-${slot.period}-${slot.ordinal}`,
  });
  return asset ? { url: asset.renditionUrl, category } : null;
}

/**
 * Every cover URL a set of posts will render, so an exporter can bundle them.
 *
 * The export asset collector walks the SiteConfig, and these images are not in it — they are
 * chosen here at render time. Without this list the exported pages point at a path that exists
 * only on the live origin.
 */
export function postCoverSources(input: {
  config: SiteConfig;
  siteId: string;
  slugs: readonly string[];
}): string[] {
  const seen = new Set<string>();
  for (const slug of input.slugs) {
    const cover = postCoverImage({ config: input.config, siteId: input.siteId, slug });
    if (cover) seen.add(cover.url);
  }
  return [...seen];
}
