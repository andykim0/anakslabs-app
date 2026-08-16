import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { Section, SiteConfig } from '@/lib/types/site';
import { compileUsMedicalDemo } from '@/lib/us-demo/source-compiler';
import { buildOperatorApprovedPreviewSiteConfig } from './site-generation';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');
const artifact = (name: string) => JSON.parse(
  readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8'),
) as CrawlArtifactPayload;
const approvedConfig = (name: string) => compileUsMedicalDemo(
  artifact(name),
  { renderMode: 'preview-full' },
).config;

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
       * Copy is compared separately below, because the medical-ad screen is permitted to rewrite
       * a sentence and that is a named exception rather than a silent one.
       */
      const { text: approvedText, ...approvedRest } = visibleShape(approved);
      const { text: deliveredText, ...deliveredRest } = visibleShape(delivered);
      assert.deepEqual(deliveredRest, approvedRest);
      assert.equal(deliveredText.length, approvedText.length);
    });
  }

  test('의료광고 스크린이 승인된 문장을 바꿔치기한다 — 이름 붙은 예외이자 실재하는 갭', () => {
    /**
     * MEASURED, and it is the one place the customer does not get what they approved: the screen
     * replaces treatment-effect copy with a safe sentence AT DELIVERY, after they said yes. On
     * cameods that is exactly one sentence of 262 — "This is the cornerstone of our practice…"
     * becomes "Review the available services and how to prepare for your visit."
     *
     * This test does not bless it. It pins the size of the gap so it cannot grow unnoticed, and
     * so that whoever runs the screen at issuance instead can delete this test outright — at
     * which point approved and delivered become identical, because the rewrite would already
     * have happened before the prospect ever saw it.
     */
    const approved = approvedConfig('cameods');
    const delivered = buildOperatorApprovedPreviewSiteConfig(approved, 'premium', {});
    const textOf = (c: SiteConfig) => c.pages.flatMap((p) => p.sections)
      .flatMap((s) => s.elements).flatMap((e) => (e.kind === 'text' ? [e.text] : []));
    const before = textOf(approved);
    const after = textOf(delivered);
    const removed = before.filter((t) => !after.includes(t));
    const added = after.filter((t) => !before.includes(t));
    assert.equal(removed.length, 1, `screen rewrote ${removed.length} sentences, not 1`);
    assert.equal(added.length, 1);
    assert.match(removed[0], /cornerstone of our practice/u);
    assert.match(added[0], /Review the available services/u);
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
     * `pages` is in this list ONLY because of the medical-ad rewrite pinned above. If that screen
     * moves to issuance, pages drops out and delivery becomes purely additive.
     */
    assert.deepEqual(changed.sort(), ['connectors', 'meta', 'motion', 'pages']);
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
