import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isPathAllowed, parseRobotsTxt, robotsAllows } from '@/lib/scan/robots';

describe('robots.txt parser', () => {
  test('collects grouped agents and absolute sitemap declarations', () => {
    const parsed = parseRobotsTxt(`
User-agent: Yeti
User-agent: Googlebot
Disallow: /private/
Allow: /private/public$
Sitemap: https://example.com/sitemap.xml
`);

    assert.equal(parsed.groups.length, 1);
    assert.deepEqual(parsed.groups[0].agents, ['yeti', 'googlebot']);
    assert.deepEqual(parsed.sitemaps, ['https://example.com/sitemap.xml']);
  });

  test('most specific rule wins and Allow wins an equal-length tie', () => {
    const parsed = parseRobotsTxt(`
User-agent: *
Disallow: /private/
Allow: /private/public
Disallow: /same
Allow: /same
`);

    assert.equal(isPathAllowed(parsed, 'Yeti', '/private/report'), false);
    assert.equal(isPathAllowed(parsed, 'Yeti', '/private/public'), true);
    assert.equal(isPathAllowed(parsed, 'Yeti', '/same'), true);
  });

  test('specific crawler group overrides wildcard policy', () => {
    const body = `
User-agent: *
Disallow: /

User-agent: OAI-SearchBot
Allow: /
`;

    assert.equal(robotsAllows(body, 'OAI-SearchBot', new URL('https://example.com/guide')), true);
    assert.equal(robotsAllows(body, 'PerplexityBot', new URL('https://example.com/guide')), false);
  });
});
