'use client';
import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
type Row = {
    id: string;
    email: string;
    role: 'LOCUM' | 'HOST' | 'ADMIN';
    status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DEACTIVATED';
    createdAt: string;
    lastLoginAt: string;
};
function Pill({ text, tone }: { text: string; tone: 'blue' | 'green' | 'red' | 'gray' }) {
    const t: Record<typeof tone, React.CSSProperties> = {
        blue: { background: 'rgba(59,79,216,0.10)', border: 'rgba(59,79,216,0.22)', color: '#1B31D2' },
        green: { background: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.22)', color: '#166534' },
        red: { background: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.18)', color: '#991B1B' },
        gray: { background: '#F3F4F6', border: '#E5E7EB', color: '#6B7280' },
    };
    const s = t[tone];
    return (<span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 800,
            border: `1px solid ${s.border}`,
            background: s.background,
            color: s.color,
            lineHeight: 1,
            whiteSpace: 'nowrap',
        }}>
      {text}
    </span>);
}
export default function AdminUsersPage() {
    const [q, setQ] = useState('');
    const rows = useMemo<Row[]>(() => ([
        {
            id: 'usr_1',
            email: 'locum.one@example.com',
            role: 'LOCUM',
            status: 'ACTIVE',
            createdAt: '2026-04-02',
            lastLoginAt: '2026-04-26',
        },
        {
            id: 'usr_2',
            email: 'clinic.manager@example.com',
            role: 'HOST',
            status: 'PENDING',
            createdAt: '2026-04-18',
            lastLoginAt: '—',
        },
        {
            id: 'usr_3',
            email: 'admin@locumlink.ca',
            role: 'ADMIN',
            status: 'ACTIVE',
            createdAt: '2026-03-10',
            lastLoginAt: '2026-04-26',
        },
        {
            id: 'usr_4',
            email: 'suspended.user@example.com',
            role: 'LOCUM',
            status: 'SUSPENDED',
            createdAt: '2026-01-11',
            lastLoginAt: '2026-02-04',
        },
    ]), []);
    const filtered = rows.filter((r) => r.email.toLowerCase().includes(q.trim().toLowerCase()));
    return (<AdminLayout title="Users" subtitle="Search, review, and manage user roles/status. (UI-only; wiring to /api/admin/users comes next.)" right={(<div style={{ display: 'flex', gap: 10 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email…" style={{
            width: 280,
            height: 40,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: '#fff',
            fontSize: 13,
            outline: 'none',
            fontFamily: 'inherit',
        }}/>
          <button type="button" style={{
            height: 40,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: '#fff',
            fontSize: 13,
            fontWeight: 800,
            color: '#0f1523',
            cursor: 'pointer',
            fontFamily: 'inherit',
        }}>
            Export
          </button>
        </div>)}>
      <div style={{
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            overflow: 'hidden',
        }}>
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 0.7fr 0.9fr 0.7fr 0.7fr',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid #F3F4F6',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.08em',
            color: '#9CA3AF',
            textTransform: 'uppercase',
        }}>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>Created</div>
          <div>Last login</div>
        </div>

        {filtered.map((r) => {
            const roleTone = r.role === 'ADMIN' ? 'blue' : r.role === 'HOST' ? 'gray' : 'green';
            const statusTone = r.status === 'ACTIVE'
                ? 'green'
                : r.status === 'PENDING'
                    ? 'gray'
                    : 'red';
            return (<div key={r.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 0.7fr 0.9fr 0.7fr 0.7fr',
                    gap: 10,
                    padding: '12px 14px',
                    borderBottom: '1px solid #F9FAFB',
                    alignItems: 'center',
                }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f1523', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.email}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{r.id}</div>
              </div>
              <div><Pill text={r.role} tone={roleTone as any} /></div>
              <div><Pill text={r.status} tone={statusTone as any} /></div>
              <div style={{ fontSize: 13, color: '#374151' }}>{r.createdAt}</div>
              <div style={{ fontSize: 13, color: '#374151' }}>{r.lastLoginAt}</div>
            </div>);
        })}
      </div>
    </AdminLayout>);
}

