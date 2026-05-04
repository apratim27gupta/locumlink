import type { Metadata } from 'next';
import { Outfit, Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AuthSync } from '@/components/AuthSync';
import { PathTracker } from '@/components/PathTracker';
import GuidedTourGate from '@/components/GuidedTourGate';
import TopLoadingBar from '@/components/ui/TopLoadingBar';
import RouteTransitionLoader from '@/components/ui/RouteTransitionLoader';
const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
});
const outfit = Outfit({
    subsets: ['latin'],
    variable: '--font-display',
    display: 'swap',
});
export const metadata: Metadata = {
    title: 'Locum Link - Connect. Cover. Care.',
    description: 'Find a Locum within 2 days, without agencies or endless calls.',
    icons: {
        icon: '/logo1.png',
        apple: '/logo1.png',
    },
};
export default function RootLayout({ children, }: {
    children: React.ReactNode;
}) {
    return (<html lang="en" className={`app-html ${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
      <body className="app-body" suppressHydrationWarning>
        <div id="app-root">
          <TopLoadingBar />
          <RouteTransitionLoader />
          <AuthSync />
          <PathTracker />
          <GuidedTourGate />
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>);
}
