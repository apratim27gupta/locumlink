'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminListDemoRequests } from '@/lib/adminApi';

type DemoRow = {
  id: string;
  email: string;
  phone: string;
  notes: string | null;
  createdAt: string;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDemoRequestsPage() {
  const [items, setItems] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListDemoRequests();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load demo requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminLayout>
      <div className="page-header">
        <h1 className="page-title">Demo requests</h1>
        <p style={{ margin: '6px 0 0', color: '#6B7280', fontSize: 14 }}>
          Leads from the About us “Request a demo” form.
        </p>
      </div>

      {error ? (
        <div className="card" style={{ color: '#B91C1C', marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, color: '#6B7280' }}>Loading…</div>
        ) : error ? null : items.length === 0 ? (
          <div style={{ padding: 24, color: '#6B7280' }}>No demo requests yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>Email</th>
                  <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>Phone</th>
                  <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>Notes</th>
                  <th style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #F3F4F6',
                        verticalAlign: 'top',
                        fontWeight: 600,
                      }}
                    >
                      <a href={`mailto:${row.email}`} style={{ color: '#1B31D2' }}>
                        {row.email}
                      </a>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #F3F4F6',
                        verticalAlign: 'top',
                        color: '#4B5563',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <a href={`tel:${row.phone}`} style={{ color: 'inherit' }}>
                        {row.phone}
                      </a>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #F3F4F6',
                        verticalAlign: 'top',
                        whiteSpace: 'pre-wrap',
                        maxWidth: 360,
                        color: '#4B5563',
                      }}
                    >
                      {row.notes || '—'}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #F3F4F6',
                        verticalAlign: 'top',
                        color: '#6B7280',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fmtDate(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
