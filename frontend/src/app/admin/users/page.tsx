'use client';
import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminFetchJson, adminDownloadUsersCsv } from '@/lib/adminApi';

type Row = {
    id: string;
    email: string;
    role: 'LOCUM' | 'HOST' | 'ADMIN';
    status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DEACTIVATED';
    createdAt: string;
    lastLoginAt: string | null;
};

const selectStyle: React.CSSProperties = {
    height: 32,
    padding: '0 8px',
    borderRadius: 8,
    border: '1px solid #E5E7EB',
    background: '#fff',
    fontSize: 12,
    fontWeight: 700,
    color: '#374151',
    fontFamily: 'inherit',
    cursor: 'pointer',
    maxWidth: '100%',
};

export default function AdminUsersPage() {
    const [q, setQ] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(q), 300);
        return () => clearTimeout(t);
    }, [q]);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const qs = new URLSearchParams({
                page: '1',
                pageSize: '100',
            });
            if (debouncedQ.trim()) qs.set('q', debouncedQ.trim());
            const data = await adminFetchJson<{ users: Row[] }>(
                `/api/admin/users?${qs.toString()}`,
            );
            setRows(data.users ?? []);
        }
 catch (e) {
            setErr(e instanceof Error ? e.message : 'Failed to load users');
            setRows([]);
        }
 finally {
            setLoading(false);
        }
    }, [debouncedQ]);

    useEffect(() => {
        load();
    }, [load]);

    async function patchUser(id: string, patch: Partial<Pick<Row, 'role' | 'status'>>) {
        setSavingId(id);
        setErr(null);
        try {
            await adminFetchJson(`/api/admin/users/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(patch),
            });
            await load();
        }
 catch (e) {
            setErr(e instanceof Error ? e.message : 'Update failed');
        }
 finally {
            setSavingId(null);
        }
    }

    function fmtDate(iso: string): string {
        try {
            return new Date(iso).toISOString().slice(0, 10);
        }
 catch {
            return iso;
        }
    }

    return (
        <AdminLayout
            title="Users"
            subtitle="Data from the users table. Changes are audited."
            right={
                <div style={{ display: 'flex', gap: 10 }}>
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by email…"
                        style={{
                            width: 280,
                            height: 40,
                            padding: '0 12px',
                            borderRadius: 10,
                            border: '1px solid #E5E7EB',
                            background: '#fff',
                            fontSize: 13,
                            outline: 'none',
                            fontFamily: 'inherit',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => adminDownloadUsersCsv(debouncedQ).catch((e) => setErr(String(e)))}
                        style={{
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
                        }}
                    >
                        Export CSV
                    </button>
                </div>
            }
        >
            {err ? (
                <div
                    style={{
                        marginBottom: 12,
                        padding: 12,
                        borderRadius: 10,
                        background: 'rgba(220,38,38,0.08)',
                        border: '1px solid rgba(220,38,38,0.22)',
                        color: '#991B1B',
                        fontSize: 13,
                        fontWeight: 700,
                    }}
                >
                    {err}
                </div>
            ) : null}

            <div
                style={{
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: 12,
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 0.85fr 1fr 0.75fr 0.75fr',
                        gap: 10,
                        padding: '12px 14px',
                        borderBottom: '1px solid #F3F4F6',
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                        color: '#9CA3AF',
                        textTransform: 'uppercase',
                    }}
                >
                    <div>Email</div>
                    <div>Role</div>
                    <div>Status</div>
                    <div>Created</div>
                    <div>Last login</div>
                </div>

                {loading ? (
                    <div style={{ padding: 20, fontSize: 13, color: '#6B7280' }}>Loading…</div>
                ) : (
                    filteredRows(rows, q).map((r) => {
                        return (
                            <div
                                key={r.id}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1.4fr 0.85fr 1fr 0.75fr 0.75fr',
                                    gap: 10,
                                    padding: '12px 14px',
                                    borderBottom: '1px solid #F9FAFB',
                                    alignItems: 'center',
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 800,
                                            color: '#0f1523',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {r.email}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>{r.id}</div>
                                </div>
                                <div>
                                    <select
                                        value={r.role}
                                        disabled={savingId === r.id}
                                        onChange={(e) =>
                                            patchUser(r.id, {
                                                role: e.target.value as Row['role'],
                                            })
                                        }
                                        style={selectStyle}
                                    >
                                        <option value="ADMIN">ADMIN</option>
                                        <option value="HOST">HOST</option>
                                        <option value="LOCUM">LOCUM</option>
                                    </select>
                                </div>
                                <div>
                                    <select
                                        value={r.status}
                                        disabled={savingId === r.id}
                                        onChange={(e) =>
                                            patchUser(r.id, {
                                                status: e.target.value as Row['status'],
                                            })
                                        }
                                        style={selectStyle}
                                    >
                                        <option value="ACTIVE">ACTIVE</option>
                                        <option value="PENDING">PENDING</option>
                                        <option value="SUSPENDED">SUSPENDED</option>
                                        <option value="DEACTIVATED">DEACTIVATED</option>
                                    </select>
                                </div>
                                <div style={{ fontSize: 13, color: '#374151' }}>{fmtDate(r.createdAt)}</div>
                                <div style={{ fontSize: 13, color: '#374151' }}>
                                    {r.lastLoginAt ? fmtDate(r.lastLoginAt) : '—'}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </AdminLayout>
    );
}

function filteredRows(rows: Row[], liveQ: string): Row[] {
    const t = liveQ.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.email.toLowerCase().includes(t));
}
