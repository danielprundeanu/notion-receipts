import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshots are posted as base64 JSON to /api/parse; the default 1 MB
  // body limit is too small for a couple of phone screenshots.
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
