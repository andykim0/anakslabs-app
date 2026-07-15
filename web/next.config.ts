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
};

export default nextConfig;
