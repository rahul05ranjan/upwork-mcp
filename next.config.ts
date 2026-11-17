import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone, which the desktop app bundles.
  output: "standalone",
  // No image optimizer, so the bundled server needs no native sharp binary.
  images: { unoptimized: true },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
