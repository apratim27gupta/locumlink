import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
    reactStrictMode: true,
    async rewrites() {
<<<<<<< HEAD
        const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
        return [
            { source: '/favicon.ico', destination: '/logo.png' },
            // Proxy browser requests to Nest API (avoids CORS/network issues)
            { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
        ];
=======
        return [{ source: '/favicon.ico', destination: '/logo1.png' }];
>>>>>>> origin/bhumi
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
