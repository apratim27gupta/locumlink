import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
    reactStrictMode: true,
    async rewrites() {
        return [{ source: '/favicon.ico', destination: '/logo1.png' }];
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
