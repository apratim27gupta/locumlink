'use client';
import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
type VerificationRow = {
    id: string;
    email: string;
    name: string;
    cpsns: string;
    submittedAt: string;
    status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
};
function StatusTag({ status }: { status: VerificationRow['status'] }) {
    const map: Record<VerificationRow['status'], { label: string; bg: string; border: string; color: string }> = {
        PENDING_REVIEW: { label: 'Pending', bg: 'rgba(59,79,216,0.10)', border: 'rgba(59,79,216,0.22)', color: '#1B31D2' },
        VERIFIED: { label: 'Verified', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.22)', color: '#166534' },
        REJECTED: { label: 'Rejected', bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.18)', color: '#991B1B' },
    };
    const s = map[status];
    return (<span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 900,
            border: `1px solid ${s.border}`,
            background: s.bg,
            color: s.color,
            whiteSpace: 'nowrap',
            lineHeight: 1,
        }}>
      {s.label}
    </span>);
}
export default function AdminVerificationsPage() {
    const [filter, setFilter] = useState<'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'>('PENDING_REVIEW');
    const rows = useMemo<VerificationRow[]>(() => ([
        { id: 'ver_1', email: 'locum.one@example.com', name: 'Dr Alex Singh', cpsns: '895874638', submittedAt: '2026-04-26 10:14', status: 'PENDING_REVIEW' },
        { id: 'ver_2', email: 'locum.two@example.com', name: 'Dr Priya Patel', cpsns: '152364789', submittedAt: '2026-04-26 09:02', status: 'PENDING_REVIEW' },
        { id: 'ver_3', email: 'locum.verified@example.com', name: 'Dr Sam Lee', cpsns: '741258963', submittedAt: '2026-04-25 16:40', status: 'VERIFIED' },
        { id: 'ver_4', email: 'locum.rejected@example.com', name: 'Dr T. Rao', cpsns: '000000000', submittedAt: '2026-04-24 12:21', status: 'REJECTED' },
    ]), []);
    const filtered = rows.filter((r) => r.status === filter);
    return (<AdminLayout title="Verifications" subtitle="Review and approve/reject CPSNS verification. (UI-only; wiring to /api/admin/verifications comes next.)" right={(<div style={{ display: 'flex', gap: 10 }}>
          {(['PENDING_REVIEW', 'VERIFIED', 'REJECTED'] as const).map((k) => {
            const active = filter === k;
            return (<button key={k} type="button" onClick={() => setFilter(k)} style={{
                height: 40,
                padding: '0 12px',
                borderRadius: 999,
                border: `1px solid ${active ? 'rgba(59,79,216,0.30)' : '#E5E7EB'}`,
                background: active ? 'rgba(59,79,216,0.10)' : '#fff',
                color: active ? '#1B31D2' : '#374151',
                fontSize: 13,
                fontWeight: 900,
                cursor: 'pointer',
                fontFamily: 'inherit',
            }}>
              {k === 'PENDING_REVIEW' ? 'Pending' : k === 'VERIFIED' ? 'Verified' : 'Rejected'}
            </button>);
        })}
        </div>)}>
      <div style={{
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            overflow: 'hidden',
        }}>
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 0.7fr 0.9fr 0.6fr',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid #F3F4F6',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.08em',
            color: '#9CA3AF',
            textTransform: 'uppercase',
        }}>
          <div>Locum</div>
          <div>Email</div>
          <div>CPSNS</div>
          <div>Submitted</div>
          <div>Status</div>
        </div>

        {filtered.map((r) => (<div key={r.id} style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 0.7fr 0.9fr 0.6fr',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid #F9FAFB',
            alignItems: 'center',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#0f1523', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.name}
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>{r.id}</div>
          </div>
          <div style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f1523' }}>{r.cpsns}</div>
          <div style={{ fontSize: 13, color: '#374151' }}>{r.submittedAt}</div>
          <div><StatusTag status={r.status} /></div>
        </div>))}
      </div>
    </AdminLayout>);
}

