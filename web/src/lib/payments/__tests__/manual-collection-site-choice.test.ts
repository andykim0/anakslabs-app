import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { resolveManualCollectionSiteChoice } from '../manual-collection-core';

describe('OPS O4 manual collection optional-site selection', () => {
  const sites = ['site-one', 'site-two'] as const;

  test('optional products preserve an explicit no-site choice', () => {
    assert.equal(resolveManualCollectionSiteChoice({
      selectedSiteId: '',
      availableSiteIds: sites,
      siteRequired: false,
    }), '');
    assert.equal(resolveManualCollectionSiteChoice({
      selectedSiteId: null,
      availableSiteIds: sites,
      siteRequired: false,
    }), '');
  });

  test('required products default to a valid first site and retain a valid choice', () => {
    assert.equal(resolveManualCollectionSiteChoice({
      selectedSiteId: '',
      availableSiteIds: sites,
      siteRequired: true,
    }), 'site-one');
    assert.equal(resolveManualCollectionSiteChoice({
      selectedSiteId: 'site-two',
      availableSiteIds: sites,
      siteRequired: true,
    }), 'site-two');
  });

  test('a stale site from another client fails closed instead of being submitted', () => {
    assert.equal(resolveManualCollectionSiteChoice({
      selectedSiteId: 'old-client-site',
      availableSiteIds: sites,
      siteRequired: false,
    }), '');
    assert.equal(resolveManualCollectionSiteChoice({
      selectedSiteId: 'old-client-site',
      availableSiteIds: sites,
      siteRequired: true,
    }), 'site-one');
  });

  test('the admin form distinguishes untouched from explicit no-site and disables stale detail', () => {
    const component = readFileSync(
      join(process.cwd(), 'src/components/admin/manual-collection-panel.tsx'),
      'utf8',
    );
    assert.match(component, /useState<string \| null>\(null\)/);
    assert.match(component, /setSiteId\(null\)/);
    assert.match(component, /resolveManualCollectionSiteChoice\(\{/);
    assert.match(component, /detailMatchesClient/);
    assert.match(component, /<option value="">사이트 귀속 없음<\/option>/);
  });
});
