import dynamic from 'next/dynamic';

const ApplicantsPage = dynamic(() => import('./page-client'), {
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
      Loading applicants…
    </div>
  ),
});

type PageProps = {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function HostApplicantsRoute(props: PageProps) {
  return <ApplicantsPage {...props} />;
}

