import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // A package.json also exists in the user's home directory. Pinning this
  // prevents Turbopack dev cache from resolving app imports against ~/node_modules.
  turbopack: {
    root: appRoot,
  },
  /**
   * Dev-only. Next refuses to serve dev client assets to a host it does not recognise, and the
   * refusal is silent in the page: the HTML and inline scripts arrive intact, so the site looks
   * right, but React never hydrates and every client component is inert. Anyone verifying a
   * preview at 127.0.0.1 instead of localhost therefore measures a page whose motion runtime,
   * view tracker and sticky booking never start, and concludes the feature is broken.
   */
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [
      {
        source: "/preview/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
