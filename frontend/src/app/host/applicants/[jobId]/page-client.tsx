'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { hostApi, type ApplicationRecord } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useAuth } from '@/providers/AuthProvider';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';

const NAV = [
  {
    label: 'My Postings',
    href: '/host/dashboard',
    icon: <NavIcon name="postings" />,
  },
  { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile" /> },
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
] as const;

const STATUS_COLOR: Record<string, string> = {
  APPLIED: '#3B82F6',
  SHORTLISTED: '#10B981',
  CONFIRMED: '#6366F1',
  REJECTED: '#EF4444',
  WITHDRAWN: '#9CA3AF',
};

function displayName(a: ApplicationRecord): string {
  const f = a.locumProfile.firstName?.trim() || '';
  const l = a.locumProfile.lastName?.trim() || '';
  const base = `${f} ${l}`.trim();
  return base || a.locumProfile.user.email || 'Applicant';
}

export default function HostApplicantsPage(props: {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const router = useRouter();
  const { isLoading: authLoading, userId } = useAuth();

  const [jobId, setJobId] = useState<string | null>(null);
  const [apps, setApps] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track which app IDs are currently being actioned (shortlist/reject)
  const [actioning, setActioning] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void props.params.then((p) => {
      if (!cancelled) setJobId(p.jobId);
    });
    return () => {
      cancelled = true;
    };
  }, [props.params]);

  useEffect(() => {
    if (!jobId || authLoading) return;
    if (!getToken()) {
      setApps([]);
      setLoading(false);
      setError('You are not logged in.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    hostApi
      .getApplications(jobId)
      .then((res) => {
        if (!cancelled) setApps(res.applications ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load applicants.');
        setApps([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, authLoading, userId]);

  const byStatus = useMemo(() => {
    const groups: Record<string, ApplicationRecord[]> = {};
    for (const a of apps) {
      groups[a.status] = groups[a.status] ?? [];
      groups[a.status].push(a);
    }
    return groups;
  }, [apps]);

  // ── Shortlist → then open Messages with that locum ───────────────────────
  async function handleShortlistAndMessage(a: ApplicationRecord) {
    if (!jobId) return;
    setActioning((prev) => new Set(prev).add(a.id));
    try {
      await hostApi.updateApplication(jobId, a.id, 'SHORTLISTED');
      // Update local state so the status badge changes immediately
      setApps((prev) =>
        prev.map((app) =>
          app.id === a.id ? { ...app, status: 'SHORTLISTED' } : app,
        ),
      );
      // Navigate to messages with this locum pre-selected
      router.push(`/host/messages?partnerId=${a.locumProfile.userId}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not shortlist applicant.',
      );
    } finally {
      setActioning((prev) => {
        const next = new Set(prev);
        next.delete(a.id);
        return next;
      });
    }
  }

  // ── Reject only ───────────────────────────────────────────────────────────
  async function handleReject(a: ApplicationRecord) {
    if (!jobId) return;
    setActioning((prev) => new Set(prev).add(a.id));
    try {
      await hostApi.updateApplication(jobId, a.id, 'REJECTED');
      setApps((prev) =>
        prev.map((app) =>
          app.id === a.id ? { ...app, status: 'REJECTED' } : app,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reject applicant.');
    } finally {
      setActioning((prev) => {
        const next = new Set(prev);
        next.delete(a.id);
        return next;
      });
    }
  }

  return (
    <DashLayout navItems={[...NAV]} activeHref="/host/dashboard">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            border: '1px solid #D0D5DD',
            background: '#fff',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ← Back
        </button>
        <h1
          style={{ fontSize: 18, margin: 0, fontWeight: 700, color: '#0f1523' }}
        >
          Applicants
        </h1>
        {jobId && (
          <span style={{ fontSize: 12, color: '#6B7280' }}>Job: {jobId}</span>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: '#8892a4' }}>Loading…</div>
      ) : apps.length === 0 ? (
        <div style={{ fontSize: 13, color: '#8892a4' }}>No applicants yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Object.entries(byStatus).map(([status, list]) => (
            <div
              key={status}
              style={{
                border: '1px solid #e2e5ee',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              {/* Section header */}
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_COLOR[status] ?? '#9CA3AF',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: '#0f1523' }}
                >
                  {status}
                </span>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                  · {list.length}
                </span>
              </div>

              {/* Applicant rows */}
              {list.map((a) => {
                const busy = actioning.has(a.id);
                const canShortlist = a.status === 'APPLIED';
                const canMessage =
                  a.status === 'SHORTLISTED' || a.status === 'CONFIRMED';

                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      borderTop: '1px solid #f8fafc',
                      gap: 12,
                    }}
                  >
                    {/* Applicant info */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#0f1523',
                        }}
                      >
                        {displayName(a)}
                      </div>
                      <div
                        style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}
                      >
                        {a.locumProfile.specialty?.replace(/_/g, ' ') ?? ''}
                        {a.locumProfile.yearsOfExperience != null
                          ? ` · ${a.locumProfile.yearsOfExperience} yrs exp`
                          : ''}
                      </div>
                      <div
                        style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}
                      >
                        {a.locumProfile.user.email}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {/* APPLIED → show Shortlist + Message button */}
                      {canShortlist && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleShortlistAndMessage(a)}
                          style={{
                            border: 'none',
                            background: busy
                              ? '#D1D5DB'
                              : 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                            color: '#fff',
                            borderRadius: 8,
                            padding: '8px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: busy ? 'default' : 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {busy ? 'Shortlisting…' : '✓ Shortlist & Message'}
                        </button>
                      )}

                      {/* APPLIED → also show Reject button */}
                      {canShortlist && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleReject(a)}
                          style={{
                            border: '1px solid #FCA5A5',
                            background: '#FEF2F2',
                            color: '#DC2626',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: busy ? 'default' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Reject
                        </button>
                      )}

                      {/* SHORTLISTED / CONFIRMED → show Message button */}
                      {canMessage && (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/host/messages?partnerId=${a.locumProfile.userId}`,
                            )
                          }
                          style={{
                            border: 'none',
                            background:
                              'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                            color: '#fff',
                            borderRadius: 8,
                            padding: '8px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          💬 Message
                        </button>
                      )}

                      {/* REJECTED / WITHDRAWN → greyed out label */}
                      {(a.status === 'REJECTED' ||
                        a.status === 'WITHDRAWN') && (
                        <span
                          style={{
                            fontSize: 12,
                            color: '#9CA3AF',
                            padding: '8px 12px',
                            border: '1px solid #E5E7EB',
                            borderRadius: 8,
                          }}
                        >
                          {a.status === 'REJECTED' ? 'Rejected' : 'Withdrawn'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </DashLayout>
  );
}
