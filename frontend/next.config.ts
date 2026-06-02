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
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return [
      { source: '/favicon.ico', destination: '/logo1.png' },
      { source: '/api/admin-auth/:path*', destination: `${apiBase}/api/admin-auth/:path*` },
      { source: '/api/admin/stats', destination: `${apiBase}/api/admin/stats` },
      { source: '/api/admin/analytics/summary', destination: `${apiBase}/api/admin/analytics/summary` },
      { source: '/api/admin/analytics/export', destination: `${apiBase}/api/admin/analytics/export` },
      { source: '/api/auth/:path*',       destination: `${apiBase}/api/auth/:path*` },
      { source: '/api/host/:path*',       destination: `${apiBase}/api/host/:path*` },
      { source: '/api/locum/profile', destination: `${apiBase}/api/locum/profile` },
      { source: '/api/locum/jobs', destination: `${apiBase}/api/locum/jobs` },
      { source: '/api/locum/jobs/:jobId/apply', destination: `${apiBase}/api/locum/jobs/:jobId/apply` },
      { source: '/api/locum/applications', destination: `${apiBase}/api/locum/applications` },
      { source: '/api/locum/applications/:applicationId/respond', destination: `${apiBase}/api/locum/applications/:applicationId/respond` },
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
    runtimeCaching: [
      {
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
    ],
  },
})(nextConfig);
