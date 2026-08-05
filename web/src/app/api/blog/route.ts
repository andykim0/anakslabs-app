/**
 * GET /api/blog — the posts on my own site, in customer language.
 *
 * Ownership is proven before anything is read: the published-posts repository is a service-role
 * global read, so it is never exposed directly to a customer session.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { loadCustomerBlogView } from '@/lib/content-fulfillment/customer-view';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../_lib/guards';
import { withApiHandler } from '../_lib/http';

export const GET = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const requestedSiteId = new URL(request.url).searchParams.get('siteId');
  const site = requestedSiteId
    ? await getOwnedSite(requestedSiteId, client.id)
    // Operator model: one client, one site. The screen resolves it rather than listing it.
    : (await getDataServices().sites.listByClient(client.id))[0] ?? null;
  if (!site) return siteNotFound();

  return NextResponse.json(await loadCustomerBlogView(site));
});
