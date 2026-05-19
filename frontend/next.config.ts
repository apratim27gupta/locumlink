import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
    reactStrictMode: true,
    async rewrites() {
        const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
        return [
            { source: '/favicon.ico', destination: '/logo1.png' },
            // Nest API (do not proxy /api/admin/* — those use Next route handlers + Prisma)
            { source: '/api/admin-auth/:path*', destination: `${apiBase}/api/admin-auth/:path*` },
            { source: '/api/auth/:path*', destination: `${apiBase}/api/auth/:path*` },
            { source: '/api/host/:path*', destination: `${apiBase}/api/host/:path*` },
            { source: '/api/locum/:path*', destination: `${apiBase}/api/locum/:path*` },
            { source: '/api/messages/:path*', destination: `${apiBase}/api/messages/:path*` },
            { source: '/api/upload/:path*', destination: `${apiBase}/api/upload/:path*` },
            { source: '/api/notifications/:path*', destination: `${apiBase}/api/notifications/:path*` },
            { source: '/api/health', destination: `${apiBase}/api/health` },
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
export default nextConfig;
