import withPWA from 'next-pwa';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },

  async rewrites() {
    // Internal Nest URL for server-side proxy only (not exposed to the browser).
    const apiBase = (
      process.env.API_INTERNAL_URL ??
      process.env.NEST_INTERNAL_URL ??
      'http://127.0.0.1:3000'
    ).replace(/\/$/, '');
    return [
      { source: '/favicon.ico', destination: '/icon-192.png' },
      { source: '/api/admin-auth/:path*', destination: `${apiBase}/api/admin-auth/:path*` },
      { source: '/api/admin/stats', destination: `${apiBase}/api/admin/stats` },
      {
        source: '/api/admin/analytics/summary',
        destination: `${apiBase}/api/admin/analytics/summary`,
      },
      {
        source: '/api/admin/analytics/export',
        destination: `${apiBase}/api/admin/analytics/export`,
      },
      { source: '/api/admin/notifications', destination: `${apiBase}/api/admin/notifications` },
      {
        source: '/api/admin/notifications/:id/read',
        destination: `${apiBase}/api/admin/notifications/:id/read`,
      },
      {
        source: '/api/admin/users/:id/profile',
        destination: `${apiBase}/api/admin/users/:id/profile`,
      },
      { source: '/api/auth/:path*',       destination: `${apiBase}/api/auth/:path*` },
      { source: '/api/public/:path*',     destination: `${apiBase}/api/public/:path*` },
      { source: '/api/host/stats',        destination: `${apiBase}/api/host/stats` },
      { source: '/api/host/:path*',       destination: `${apiBase}/api/host/:path*` },
      { source: '/api/locum/stats',       destination: `${apiBase}/api/locum/stats` },
      { source: '/api/locum/:path*',      destination: `${apiBase}/api/locum/:path*` },
      { source: '/api/messages/:path*',   destination: `${apiBase}/api/messages/:path*` },
      { source: '/api/upload/:path*',     destination: `${apiBase}/api/upload/:path*` },
      { source: '/api/notifications/:path*', destination: `${apiBase}/api/notifications/:path*` },
      { source: '/api/health',            destination: `${apiBase}/api/health` },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.output = config.output ?? {};
      config.output.chunkLoadTimeout = 300000;
    }
    return config;
  },
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  customWorkerDir: 'worker',
  disable: process.env.NODE_ENV === 'development',
  fallbacks: { document: '/offline' },
  workboxOptions: {
    // Admin auth must always hit the network — never substitute /offline or a stale shell.
    navigateFallbackDenylist: [/^\/admin/, /^\/api/, /^\/_next/],
  },
  runtimeCaching: [
    {
      urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkOnly',
      method: 'GET',
      options: {},
    },
    {
      urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'document-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
  ],
})(nextConfig);
