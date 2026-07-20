'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { LocumBrowseJobDetail } from '@/components/locum/LocumBrowseJobDetail';
import { hostApi, normalizeHostJob, type Job } from '@/lib/api';
import { useHostProfile } from '@/hooks/useHostProfile';
import { beforeClientNavigation } from '@/lib/topLoader';
import { toBrowseJobPreview } from '@/lib/toBrowseJobPreview';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';

const HOST_DASH_NAV = [
  {
    label: 'My Postings',
    href: '/host/dashboard',
    icon: <NavIcon name="postings" />,
  },
  {
    label: 'Profile',
    href: '/host/profile',
    icon: <NavIcon name="profile" />,
  },
  {
    label: 'Messages',
    href: '/host/messages',
    icon: <NavIcon name="messages" />,
  },
  {
    label: 'Resources',
    href: '/host/resources',
    icon: <NavIcon name="resources" />,
  },
  {
    label: 'Settings',
    href: '/host/settings',
    icon: <NavIcon name="settings" />,
  },
];

export default function HostJobPreviewPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const params = useParams();
  const jobId = typeof params?.jobId === 'string' ? params.jobId : '';
  const router = useRouter();
  const { profile, loading: profileLoading } = useHostProfile();
  const [job, setJob] = useState<Job | null>(null);
  const [loadBusy, setLoadBusy] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!jobId) {
      setLoadBusy(false);
      setErr('Job not found.');
      return;
    }
    let cancelled = false;
    setLoadBusy(true);
    setErr('');
    hostApi
      .getJob(jobId)
      .then((res) => {
        if (cancelled) return;
        setJob(normalizeHostJob(res.job));
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : 'Could not load this job.');
        setJob(null);
      })
      .finally(() => {
        if (!cancelled) setLoadBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const browseJob = useMemo(
    () => (job ? toBrowseJobPreview(job, profile) : null),
    [job, profile],
  );

  const goDashboard = () => {
    beforeClientNavigation('/host/dashboard');
    router.push('/host/dashboard');
  };

  return (
    <DashLayout navItems={HOST_DASH_NAV} activeHref="/host/dashboard">
      <div
        style={{
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#F7F8FA',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '14px 20px',
            background: '#fff',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--font-heading)',
                fontWeight: 'var(--font-weight-bold)',
                color: '#0B0F1F',
              }}
            >
              Preview as locum
            </div>
            <div
              style={{
                fontSize: 'var(--font-small)',
                color: '#6B7280',
                marginTop: 2,
              }}
            >
              This is how signed-in locums see your posting.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={goDashboard}
              style={{
                height: 34,
                padding: '0 14px',
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                background: '#fff',
                color: '#374151',
                fontSize: 'var(--font-body)',
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Back to postings
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            justifyContent: 'center',
            padding: '16px 16px 24px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              minHeight: 0,
              height: '100%',
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 10,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(15, 21, 35, 0.06)',
            }}
          >
            {loadBusy || profileLoading ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#8892a4',
                  fontSize: 'var(--font-body)',
                }}
              >
                Loading preview…
              </div>
            ) : err || !browseJob ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  padding: 24,
                  color: '#6B7280',
                  fontSize: 'var(--font-body)',
                  textAlign: 'center',
                }}
              >
                <div>{err || 'Job not found.'}</div>
                <button
                  type="button"
                  onClick={goDashboard}
                  style={{
                    height: 34,
                    padding: '0 14px',
                    border: '1px solid #E5E7EB',
                    borderRadius: 6,
                    background: '#fff',
                    color: '#374151',
                    fontSize: 'var(--font-body)',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  Back to postings
                </button>
              </div>
            ) : (
              <LocumBrowseJobDetail
                job={browseJob}
                revealHostDetails
                open
              />
            )}
          </div>
        </div>
      </div>
    </DashLayout>
  );
}
