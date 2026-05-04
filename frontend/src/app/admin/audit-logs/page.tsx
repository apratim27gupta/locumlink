'use client';
import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
type LogRow = {
    id: string;
    actor: string;
    action: string;
    entity: string;
    createdAt: string;
    detail: string;
};
export default function AdminAuditLogsPage() {
    const [q, setQ] = useState('');
    const rows = useMemo<LogRow[]>(() => ([
        {
            id: 'aud_1',
            actor: 'admin@locumlink.ca',
            action: 'UPDATE',
            entity: 'LocumProfile',
            createdAt: '2026-04-26 18:55',
            detail: 'verificationStatus: PENDING_REVIEW → VERIFIED',
        },
        {
            id: 'aud_2',
            actor: 'admin@locumlink.ca',
            action: 'UPDATE',
            entity: 'User',
            createdAt: '2026-04-26 17:21',
            detail: 'role: LOCUM → HOST',
        },
        {
            id: 'aud_3',
            actor: 'admin@locumlink.ca',
            action: 'UPDATE',
            entity: 'User',
            createdAt: '2026-04-25 09:02',
            detail: 'status: ACTIVE → SUSPENDED',
        },
    ]), []);
    const filtered = rows.filter((r) => {
        const hay = `${r.actor} ${r.action} ${r.entity} ${r.detail}`.toLowerCase();
        return hay.includes(q.trim().toLowerCase());
    });
    return (<AdminLayout title="Audit Logs" subtitle="Every admin change should be traceable. (UI-only; wiring to /api/admin/audit-logs comes next.)" right={(<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search logs…" style={{
            width: 320,
            height: 40,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: '#fff',
            fontSize: 13,
            outline: 'none',
            fontFamily: 'inherit',
        }}/>)}>
      <div style={{
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            overflow: 'hidden',
        }}>
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 0.7fr 0.8fr 0.9fr 1.5fr',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid #F3F4F6',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.08em',
            color: '#9CA3AF',
            textTransform: 'uppercase',
        }}>
          <div>Actor</div>
          <div>Action</div>
          <div>Entity</div>
          <div>Timestamp</div>
          <div>Detail</div>
        </div>

        {filtered.map((r) => (<div key={r.id} style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 0.7fr 0.8fr 0.9fr 1.5fr',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid #F9FAFB',
            alignItems: 'center',
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#0f1523', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.actor}
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#1B31D2' }}>{r.action}</div>
          <div style={{ fontSize: 13, color: '#374151' }}>{r.entity}</div>
          <div style={{ fontSize: 13, color: '#374151' }}>{r.createdAt}</div>
          <div style={{ fontSize: 13, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.detail}</div>
        </div>))}
      </div>
    </AdminLayout>);
}

