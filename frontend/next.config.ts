import type { NextConfig } from 'next';

/**
 * IMPORTANT: Delete next.config.mjs — Next.js errors if both .ts and .mjs exist.
 * next.js already auto-loads frontend/.env.local so manual dotenv is not needed here.
 * Root .env values are loaded by the backend. Only NEXT_PUBLIC_* keys need to be in
 * frontend/.env.local which Next.js handles automatically.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Browsers request /favicon.ico by default; we reuse the app logo. */
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/logo.png' }];
  },
  /** Dev: large route chunks can exceed the default chunk load wait and throw ChunkLoadError. */
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.output = config.output ?? {};
      config.output.chunkLoadTimeout = 300_000;
    }
    return config;
  },
};

export default nextConfig;
