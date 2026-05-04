'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';

type AdminStats = {
  totalUsers: number;
  pendingVerifications: number;
};

export default function AdminDashboardPage() {
  const apiBase = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    return raw.replace(/\\/$/, '');
  }, []);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/admin/stats`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        if (!cancelled) setStats(json?.stats ?? null);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Protected admin route. This page reads real data from the backend using the admin cookie."
      right={
        <a
          href="/admin"
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: '#fff',
            fontSize: 13,
            fontWeight: 700,
            color: '#0f1523',
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Go to Overview
        </a>
      }
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f1523', marginBottom: 8 }}>
          API status
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: '#6B7280' }}>Loading…</div>
        ) : stats ? (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#0f1523', fontWeight: 700 }}>
              Total users: <span style={{ color: '#1B31D2' }}>{stats.totalUsers}</span>
            </div>
            <div style={{ fontSize: 13, color: '#0f1523', fontWeight: 700 }}>
              Pending verifications:{' '}
              <span style={{ color: '#1B31D2' }}>{stats.pendingVerifications}</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#991B1B', fontWeight: 700 }}>
            Could not load admin stats. (Make sure backend is running and admin OAuth is configured.)
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

