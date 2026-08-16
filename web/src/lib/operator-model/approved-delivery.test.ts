import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { Section, SiteConfig } from '@/lib/types/site';
import { prepareUsMedicalPreview } from '@/lib/us-demo/admin-workflow';
import { buildOperatorApprovedPreviewSiteConfig } from './site-generation';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');
const artifact = (name: string) => JSON.parse(
  readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8'),
) as CrawlArtifactPayload;
/** The config a prospect actually approves — issued through the real preview path. */
const approvedConfig = (name: string) => prepareUsMedicalPreview({
  artifact: artifact(name),
  renderMode: 'preview-full',
}).config;

/** Everything a customer can see: structure, words, pictures, colour and the pinned decisions. */
function visibleShape(config: SiteConfig) {
  const sections = (page: { sections: Section[] }) => page.sections;
  return {
    pages: config.pages.map((page) => page.slug || 'home'),
    sectionIds: config.pages.map((page) => sections(page).map((s) => s.id)),
    sectionTypes: config.pages.map((page) => sections(page).map((s) => s.type)),
    text: config.pages.flatMap((page) => sections(page)).flatMap((s) => s.elements)
      .flatMap((e) => (e.kind === 'text' ? [e.text] : [])),
    images: config.pages.flatMap((page) => sections(page))
      .flatMap((s) => [
        ...(s.background.image ? [s.background.image.src] : []),
        ...s.elements.flatMap((e) => (e.kind === 'image' ? [e.src] : [])),
      ]),
    palette: config.theme.palette,
    clinicMaster: config.clinicMaster,
    heroLayouts: config.pages.map(
      (page) => sections(page).find((s) => s.type === 'hero')?.clinicHeroLayout ?? null,
    ),
  };
}

describe('delivery — the customer receives the artefact they approved', () => {
  for (const name of ['cameods', 'iddental']) {
    test(`${name}: 승인본과 배송본의 보이는 모든 것이 동일하다`, () => {
      const approved = approvedConfig(name);
      const delivered = buildOperatorApprovedPreviewSiteConfig(approved, 'premium', {
        phone: '(312) 555-0100',
        bookingUrl: 'https://example.com/book',
      });
      /**
       * Structure, pictures, colour and every pinned decision survive delivery untouched. Before
       * this existed the operator path recompiled from the artifact and produced a different
       * product entirely — 19 hash-slug pages against 12 curated ones on cameods.
       *
       * Copy included: the screen now runs at issuance, so delivery changes nothing.
       */
      assert.deepEqual(visibleShape(delivered), visibleShape(approved));
    });
  }

  test('배송은 승인된 문장을 단 한 글자도 바꾸지 않는다', () => {
    /**
     * This replaces a test that pinned the rewrite at one sentence. The medical-ad screen now runs
     * at ISSUANCE, so the prospect approves the compliant copy and delivery has nothing left to
     * change. Measured before the move: 2 sentences of 961 across the three samples were rewritten
     * after approval — cameods' "cornerstone of our practice" and iddental's "Immediate, dramatic
     * results". Both are claims we could not lawfully publish, so the prospect now sees the truth
     * at approval time rather than after it.
     */
    for (const name of ['cameods', 'iddental']) {
      const approved = approvedConfig(name);
      const delivered = buildOperatorApprovedPreviewSiteConfig(approved, 'premium', {});
      const textOf = (c: SiteConfig) => c.pages.flatMap((p) => p.sections)
        .flatMap((s) => s.elements).flatMap((e) => (e.kind === 'text' ? [e.text] : []));
      assert.deepEqual(textOf(delivered), textOf(approved), `${name} copy changed at delivery`);
    }
  });

  test('파이프가 바꾸는 것은 선언된 목록뿐이다', () => {
    const approved = approvedConfig('cameods');
    const delivered = buildOperatorApprovedPreviewSiteConfig(approved, 'premium', {
      phone: '(312) 555-0100',
      bookingUrl: 'https://example.com/book',
    });
    const changed = [...new Set([...Object.keys(approved), ...Object.keys(delivered)])]
      .filter((key) => JSON.stringify(
        (approved as unknown as Record<string, unknown>)[key],
      ) !== JSON.stringify((delivered as unknown as Record<string, unknown>)[key]));
    /**
     * The declared transforms in buildOperatorApprovedPreviewSiteConfig's comment. If this list
     * grows, either the new transform is invisible to the customer and belongs in that comment,
     * or it changes what they approved and does not belong in delivery at all.
     */
    /**
     * `pages` is deliberately absent: delivery is now purely additive. It attaches locale, motion
     * and the operator's connectors, and touches nothing the customer looked at.
     */
    assert.deepEqual(changed.sort(), ['connectors', 'meta', 'motion']);
  });

  test('승인본이 없으면 배송도 없다 — 두 번째 컴파일로 대체하지 않는다', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'src/app/api/admin/clients/[id]/sites/route.ts'),
      'utf8',
    );
    assert.match(route, /mode: z\.literal\('approved-preview'\)/u);
    assert.match(route, /APPROVED_PREVIEW_NOT_FOUND/u);
    // A revoked or expired preview is not an approved artefact and must not silently recompile.
    assert.match(route, /preview\.revokedAt/u);
  });
});
