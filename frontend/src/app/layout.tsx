import { GoogleAnalytics } from '@next/third-parties/google';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AuthSync } from '@/components/AuthSync';
import { PathTracker } from '@/components/PathTracker';
import GuidedTourGate from '@/components/GuidedTourGate';
import TopLoadingBar from '@/components/ui/TopLoadingBar';
import RouteTransitionLoader from '@/components/ui/RouteTransitionLoader';
import PageLoader from '@/components/ui/PageLoader';
import { Suspense } from 'react';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
});
export const metadata: Metadata = {
    title: 'Locum Link - Connect. Cover. Care.',
    description: 'Find a Locum within 2 days, without agencies or endless calls.',
    manifest: '/manifest.json',
    applicationName: 'Locum Link',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Locum Link',
    },
    other: {
        'mobile-web-app-capable': 'yes',
    },
    icons: {
        icon: [{ url: '/logo.png', sizes: '192x192', type: 'image/png' }],
        apple: [{ url: '/apple.png', sizes: '180x180', type: 'image/png' }],
    },
};
export const viewport: Viewport = {
    themeColor: '#1a56db',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
};
export default function RootLayout({ children, }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`app-html ${inter.variable}`} suppressHydrationWarning>
            <body className="app-body" suppressHydrationWarning>
                <div id="app-root">
                    <TopLoadingBar />
                    <PageLoader />
                    <Suspense fallback={null}><RouteTransitionLoader /></Suspense>
                    <AuthSync />
                    <PathTracker />
                    <GuidedTourGate />
                    <Providers>{children}</Providers>
                </div>
<GoogleAnalytics gaId="G-JLBQZSQFW3" />
            </body>
        </html>
    );
}
