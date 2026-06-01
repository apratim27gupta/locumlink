'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  FileCheck,
  Shield,
  Users,
} from 'lucide-react';
import { adminApiBase } from '@/lib/adminApi';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  adminGetNotifications,
  adminMarkNotificationRead,
  type AdminNotificationItem,
} from '@/lib/adminApi';
import { useAdminStats } from '@/components/AdminStatsContext';
import Logo from '@/components/Logo';
import '@/styles/admin-portal.css';

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  badge?: number;
};

function fmtAdminNotifTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  const hrs = Math.floor(diff / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function adminInitials(email: string): string {
  const local = email.split('@')[0] ?? 'AD';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  return local.slice(0, 2).toUpperCase() || 'AD';
}

function AdminLayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { stats, adminEmail } = useAdminStats();
  const pendingCount = stats?.pendingVerifications ?? 0;

  const nav: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      href: '/admin',
      icon: <BarChart3 size={20} />,
    },
    {
      id: 'credentials',
      label: 'Credential Queue',
      href: '/admin/verifications',
      icon: <Shield size={20} />,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      id: 'users',
      label: 'User Management',
      href: '/admin/users',
      icon: <Users size={20} />,
    },
    {
      id: 'audit',
      label: 'Audit Log',
      href: '/admin/audit-logs',
      icon: <FileCheck size={20} />,
    },
    {
      id: 'analytics',
      label: 'Analytics',
      href: '/admin/analytics',
      icon: <Activity size={20} />,
    },
  ];

  function isActive(href: string): boolean {
    if (href === '/admin') return pathname === '/admin' || pathname === '/admin/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function logout() {
    const apiBase = adminApiBase().replace(/\/$/, '');
    try {
      await fetch(`${apiBase}/api/admin-auth/logout`, { method: 'GET', credentials: 'include' });
    } finally {
      window.location.href = '/admin/login';
    }
  }

  const displayName = adminEmail.includes('@')
    ? `Admin (${adminEmail.split('@')[0]})`
    : 'Admin User';

  const [adminNotifs, setAdminNotifs] = useState<AdminNotificationItem[]>([]);
  const [adminNotifTotal, setAdminNotifTotal] = useState(0);
  const [adminBellOpen, setAdminBellOpen] = useState(false);
  const adminBellRef = useRef<HTMLDivElement>(null);
  const prevAdminTotal = useRef(0);
  const fetchAdminNotifs = useCallback(async () => {
    try {
      const data = await adminGetNotifications();
      setAdminNotifs(data.notifications);
      setAdminNotifTotal(data.total);
    } catch {}
  }, []);
  useEffect(() => { void fetchAdminNotifs(); }, [fetchAdminNotifs]);
  useEffect(() => {
    const id = setInterval(() => void fetchAdminNotifs(), 12000);
    return () => clearInterval(id);
  }, [fetchAdminNotifs]);
  useEffect(() => {
    if (adminNotifTotal > prevAdminTotal.current && prevAdminTotal.current !== 0) {
      const ctx = new AudioContext();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.4);
    }
    prevAdminTotal.current = adminNotifTotal;
  }, [adminNotifTotal]);
  useEffect(() => {
    if (!adminBellOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (adminBellRef.current?.contains(e.target as Node)) return;
      setAdminBellOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [adminBellOpen]);

  return (
    <div className="admin-portal">
      <div className="admin-container">
        <aside className="sidebar">


          <nav className="sidebar-nav">
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`nav-item${active ? ' active' : ''}`}
                >
                  <span className="nav-item-content">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined ? (
                    <span className="nav-badge">{item.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="admin-info">
              <div className="admin-avatar">{adminInitials(adminEmail)}</div>
              <div className="admin-details">
                <div className="admin-name">{displayName}</div>
                <div className="admin-email">{adminEmail}</div>
              </div>
            </div>
            <button type="button" className="sidebar-logout" onClick={() => logout()}>
              Log out
            </button>
          </div>
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ height: 64, borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: '#ffffff', gap: 16, boxShadow: '0 1px 4px rgba(15,42,122,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Logo size="md" />
              <div style={{ width: 1, height: 24, background: '#E5E7EB' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0F2A7A', fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em' }}>Admin Portal</span>
            </div>
            <div ref={adminBellRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setAdminBellOpen((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: '#38C6C6',
                  position: 'relative',
                }}
                title="Notifications"
                aria-label="Notifications"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {adminNotifTotal > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      background: '#DC2626',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 16,
                      height: 16,
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1.5px solid #fff',
                    }}
                  >
                    {adminNotifTotal > 9 ? '9+' : adminNotifTotal}
                  </span>
                )}
              </button>
              {adminBellOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 40,
                    right: 0,
                    width: 360,
                    maxHeight: 440,
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: 12,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
                    zIndex: 100,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      padding: '14px 16px 10px',
                      borderBottom: '1px solid #F3F4F6',
                      fontWeight: 700,
                      fontSize: 14,
                      color: '#0f1523',
                    }}
                  >
                    Notifications
                    {adminNotifTotal > 0 && (
                      <span style={{ color: '#6B7280', fontWeight: 400 }}>
                        {' '}
                        · {adminNotifTotal} unread
                      </span>
                    )}
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {adminNotifs.length === 0 ? (
                      <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38C6C6" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 8 }}>
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <div style={{ fontSize: 14, color: '#9CA3AF' }}>No new notifications</div>
                      </div>
                    ) : (
                      adminNotifs.map((notif) => {
                        const isCritical = notif.priority === 'CRITICAL';
                        const isHigh = notif.priority === 'HIGH';
                        const isMedium = notif.priority === 'MEDIUM';
                        const isElevated = isCritical || isHigh || isMedium;
                        const isUnread = !notif.read;
                        const rowBg = isCritical ? '#FEF2F2' : isHigh ? '#FFF7ED' : isMedium ? '#FEFCE8' : '#fff';
                        const borderColor = isCritical ? '#DC2626' : isHigh ? '#EA580C' : isMedium ? '#CA8A04' : 'transparent';
                        return (
                          <div
                            key={notif.id}
                            role="button"
                            tabIndex={0}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid #F9FAFB',
                              cursor: 'pointer',
                              display: 'flex',
                              gap: 10,
                              alignItems: 'flex-start',
                              background: rowBg,
                              borderLeft: isElevated ? `3px solid ${borderColor}` : '3px solid transparent',
                            }}
                            onClick={() => {
                              setAdminBellOpen(false);
                              if (!notif.read) {
                                void adminMarkNotificationRead(notif.id).then(() => {
                                  setAdminNotifs((prev) =>
                                    prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
                                  );
                                  setAdminNotifTotal((t) => Math.max(0, t - 1));
                                });
                              }
                              window.location.href = notif.href;
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#0B0F1F', lineHeight: 1.4 }}>
                                  {notif.title}
                                </span>
                                {isCritical && (
                                  <span style={{ fontSize: 10, fontWeight: 700, background: '#FCA5A5', padding: '2px 6px', borderRadius: 4 }}>
                                    Critical
                                  </span>
                                )}
                                {isHigh && (
                                  <span style={{ fontSize: 10, fontWeight: 700, background: '#FDBA74', padding: '2px 6px', borderRadius: 4 }}>
                                    High
                                  </span>
                                )}
                                {isMedium && (
                                  <span style={{ fontSize: 10, fontWeight: 700, background: '#FDE047', padding: '2px 6px', borderRadius: 4 }}>
                                    Medium
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: isCritical ? '#7F1D1D' : isHigh ? '#9A3412' : isMedium ? '#854D0E' : '#6B7280',
                                  lineHeight: 1.45,
                                  whiteSpace: isElevated ? 'normal' : 'nowrap',
                                  overflow: isElevated ? undefined : 'hidden',
                                  textOverflow: isElevated ? undefined : 'ellipsis',
                                }}
                              >
                                {notif.body}
                              </div>
                              {notif.actionLabel && (
                                <div style={{ fontSize: 12, fontWeight: 600, color: borderColor || '#38C6C6', marginTop: 6 }}>
                                  {notif.actionLabel}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                                {fmtAdminNotifTime(notif.createdAt)}
                              </div>
                            </div>
                            {isUnread && (
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: borderColor || '#38C6C6',
                                  flexShrink: 0,
                                  marginTop: 4,
                                }}
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <main className="main-content" style={{ background: '#F7F8FA' }}>{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutInner>{children}</AdminLayoutInner>;
}
