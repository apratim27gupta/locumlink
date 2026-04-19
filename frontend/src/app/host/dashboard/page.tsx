import dynamic from 'next/dynamic';

/**
 * Heavy client dashboard — load as a separate async chunk so the
 * route shell `page.js` stays small and dev/HMR is less likely to hit ChunkLoadError timeouts.
 */
const HostDashboard = dynamic(() => import('./host-dashboard-page'), {
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        background: '#fff',
        color: '#64748b',
        fontSize: 14,
      }}
    >
      Loading dashboard…
    </div>
  ),
});

type PageProps = {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function HostDashboardPage(props: PageProps) {
  return <HostDashboard {...props} />;
}
