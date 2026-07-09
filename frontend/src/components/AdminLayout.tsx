'use client';

import { ReactNode, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  FileCheck,
  Shield,
  Users,
} from 'lucide-react';
import { adminApiBase } from '@/lib/adminApi';
import { useEffect, useRef } from 'react';
import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';
import { onPwaRefresh } from '@/lib/pwaEvents';
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
  const router = useRouter();
  const { stats, adminEmail } = useAdminStats();
  const pendingCount = stats?.pendingVerifications ?? 0;
  const openReports = stats?.openReports ?? 0;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileNavOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

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
      id: 'reports',
      label: 'Reports',
      href: '/admin/reports',
      icon: <AlertTriangle size={20} />,
      badge: openReports > 0 ? openReports : undefined,
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
  const [selectedAdminNotif, setSelectedAdminNotif] =
    useState<AdminNotificationItem | null>(null);
  const adminBellRef = useRef<HTMLDivElement>(null);
  const prevAdminTotal = useRef(0);
  const [adminNotifErr, setAdminNotifErr] = useState<string | null>(null);
  const fetchAdminNotifs = useCallback(async () => {
    try {
      const data = await adminGetNotifications();
      setAdminNotifs(data.notifications);
      setAdminNotifTotal(data.total);
      setAdminNotifErr(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load notifications';
      setAdminNotifErr(msg);
    }
  }, []);
  useEffect(() => { void fetchAdminNotifs(); }, [fetchAdminNotifs]);
  useVisibilityPolling(() => {
    void fetchAdminNotifs();
  }, 12_000);
  useEffect(() => onPwaRefresh(() => { void fetchAdminNotifs(); }), [fetchAdminNotifs]);
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

  const markAdminNotifRead = useCallback((notif: AdminNotificationItem) => {
    if (notif.read) return;
    void adminMarkNotificationRead(notif.id).then(() => {
      setAdminNotifs((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      );
      setAdminNotifTotal((t) => Math.max(0, t - 1));
    });
  }, []);

  function openAdminNotification(notif: AdminNotificationItem) {
    setSelectedAdminNotif(notif);
    setAdminBellOpen(false);
  }

  function followAdminNotification(notif: AdminNotificationItem) {
    markAdminNotifRead(notif);
    setSelectedAdminNotif(null);
    const href = notif.href?.trim() || '/admin';
    router.push(href);
  }

  return (
    <div className="admin-portal">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <button
            type="button"
            className="dash-hamburger admin-hamburger"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileNavOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Logo size="md" />
          <div className="admin-topbar-divider" />
          <span className="admin-topbar-title">Admin Portal</span>
        </div>
        <div className="admin-topbar-actions">
          <div ref={adminBellRef} className="admin-bell-menu">
            <button
              type="button"
              onClick={() => setAdminBellOpen((v) => !v)}
              className="admin-bell-btn"
              title="Notifications"
              aria-label="Notifications"
              aria-expanded={adminBellOpen}
              aria-haspopup="true"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {adminNotifTotal > 0 && (
                <span className="admin-bell-badge">
                  {adminNotifTotal > 9 ? '9+' : adminNotifTotal}
                </span>
              )}
            </button>
            {adminBellOpen && (
              <div className="admin-bell-dropdown" role="menu">
              <div className="admin-bell-dropdown-header">
                Notifications
                {adminNotifTotal > 0 && (
                  <span className="admin-bell-dropdown-unread">
                    {' '}
                    · {adminNotifTotal} unread
                  </span>
                )}
              </div>
              <div className="admin-bell-dropdown-list">
                {adminNotifErr ? (
                  <div className="admin-bell-empty">
                    <div>{adminNotifErr}</div>
                  </div>
                ) : adminNotifs.length === 0 ? (
                  <div className="admin-bell-empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38C6C6" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <div>No notifications yet</div>
                  </div>
                ) : (
                  adminNotifs.map((notif) => {
                    const isUnread = !notif.read;
                    return (
                      <div
                        key={notif.id}
                        role="button"
                        tabIndex={0}
                        className="admin-bell-item"
                        onClick={() => openAdminNotification(notif)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openAdminNotification(notif);
                          }
                        }}
                      >
                        <div className="admin-bell-item-content">
                          <div className="admin-bell-item-title">{notif.title}</div>
                          <div className="admin-bell-item-body">{notif.body}</div>
                          {notif.actionLabel && notif.href ? (
                            <button
                              type="button"
                              className="admin-bell-item-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                followAdminNotification(notif);
                              }}
                            >
                              {notif.actionLabel}
                            </button>
                          ) : null}
                          <div className="admin-bell-item-time">
                            {fmtAdminNotifTime(notif.createdAt)}
                          </div>
                        </div>
                        {isUnread ? <div className="admin-bell-item-dot" aria-hidden /> : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </header>

      <div className="admin-shell">
        {mobileNavOpen && (
          <button
            type="button"
            className="admin-sidebar-overlay"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <aside className={mobileNavOpen ? 'sidebar sidebar--open' : 'sidebar'}>
          <nav className="sidebar-nav">
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`nav-item${active ? ' active' : ''}`}
                  onClick={() => setMobileNavOpen(false)}
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

        <main className="main-content">{children}</main>
      </div>

      {selectedAdminNotif &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="admin-notif-modal-backdrop"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedAdminNotif(null);
            }}
          >
            <div className="admin-notif-modal">
              <div className="admin-notif-modal-header">
                <div>
                  <h2 className="admin-notif-modal-title">
                    {selectedAdminNotif.title}
                  </h2>
                  <div className="admin-notif-modal-time">
                    {fmtAdminNotifTime(selectedAdminNotif.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-notif-modal-close"
                  aria-label="Close notification"
                  onClick={() => setSelectedAdminNotif(null)}
                >
                  ×
                </button>
              </div>
              <div className="admin-notif-modal-body">
                <p className="admin-notif-modal-text">{selectedAdminNotif.body}</p>
                {selectedAdminNotif.actionLabel && selectedAdminNotif.href ? (
                  <button
                    type="button"
                    className="admin-notif-modal-action"
                    onClick={() => followAdminNotification(selectedAdminNotif)}
                  >
                    {selectedAdminNotif.actionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutInner>{children}</AdminLayoutInner>;
}
