'use client';

import { ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import {
  computeAvatarInitials,
  initialsFromSupabaseUser,
} from '@/lib/avatarInitials';
import { getRole, getToken } from '@/lib/auth';
import {
  hostApi,
  locumApi,
  notificationsApi,
  type NotificationItem,
} from '@/lib/api';
import { getSupabase } from '@/lib/supabaseClient';
import { useTrackLastPath } from '../hooks/useTrackLastPath';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

interface Props {
  navItems: NavItem[];
  activeHref: string;
  topbarRight?: ReactNode;
  topbarFirstName?: string | null;
  topbarLastName?: string | null;
  topbarAvatarText?: string;
  children: ReactNode;
}

const ICON: Record<string, string> = {
  browse:
    'M10 21C15.5228 21 20 16.5228 20 11C20 5.47715 15.5228 1 10 1C4.47715 1 0 5.47715 0 11C0 16.5228 4.47715 21 10 21ZM20.9142 18.5L24.7071 22.2929',
  postings: 'M4 6h16M4 10h16M4 14h10',
  profile:
    'M12 12c2.7 0 4-1.79 4-4s-1.3-4-4-4-4 1.79-4 4 1.3 4 4 4zm0 2c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z',
  messages: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  resources:
    'M12 6.25278V19.2528M12 6.25278C10.8321 5.47686 9.24649 5 7.5 5C5.75351 5 4.16789 5.47686 3 6.25278V19.2528C4.16789 18.4769 5.75351 18 7.5 18C9.24649 18 10.8321 18.4769 12 19.2528M12 6.25278C13.1679 5.47686 14.7535 5 16.5 5C18.2465 5 19.8321 5.47686 21 6.25278V19.2528C19.8321 18.4769 18.2465 18 16.5 18C14.7535 18 13.1679 18.4769 12 19.2528',
};

function NavIcon({ name }: { name: string }) {
  const d = ICON[name] ?? ICON.profile;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// ── Notification type icon ────────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotificationItem['type'] }) {
  if (type === 'message') return <span style={{ fontSize: 16 }}>💬</span>;
  if (type === 'application') return <span style={{ fontSize: 16 }}>📋</span>;
  return <span style={{ fontSize: 16 }}>🎉</span>;
}

function fmtNotifTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 60_000); // minutes
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  const hrs = Math.floor(diff / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashLayout({
  navItems,
  activeHref,
  topbarRight,
  topbarFirstName,
  topbarLastName,
  topbarAvatarText,
  children,
}: Props) {
  const router = useRouter();
  const { logout } = useAuth();

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  const [authAvatarInitials, setAuthAvatarInitials] = useState<string | null>(
    null,
  );
  const [apiFirstName, setApiFirstName] = useState<string | null>(null);
  const [apiLastName, setApiLastName] = useState<string | null>(null);

  // ── Notifications state ───────────────────────────────────────────────────
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifTotal, setNotifTotal] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useTrackLastPath();

  // ── Avatar initials ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (cancelled || !user) return;
        const from = initialsFromSupabaseUser(user);
        if (from) setAuthAvatarInitials(from);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const role = getRole();
    if (!role) return;
    (async () => {
      try {
        if (role === 'locum') {
          const data = await locumApi.getProfile();
          if (cancelled) return;
          if (data.exists && data.profile) {
            setApiFirstName(data.profile.firstName ?? null);
            setApiLastName(data.profile.lastName ?? null);
          }
        } else {
          const p = await hostApi.getProfile();
          if (cancelled) return;
          if (p) {
            setApiFirstName(p.contactFirstName ?? null);
            setApiLastName(p.contactLastName ?? null);
          }
        }
      } catch {
        /* offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Close avatar menu on outside click ───────────────────────────────────
  useEffect(() => {
    if (!avatarMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (avatarMenuRef.current?.contains(e.target as Node)) return;
      setAvatarMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setAvatarMenuOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [avatarMenuOpen]);

  // ── Close bell on outside click ───────────────────────────────────────────
  useEffect(() => {
    if (!bellOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (bellRef.current?.contains(e.target as Node)) return;
      setBellOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [bellOpen]);

  // ── Fetch notifications ───────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!getToken()) return;
    try {
      const data = await notificationsApi.get();
      setNotifications(data.notifications);
      setNotifTotal(data.total);
    } catch {
      /* silently fail */
    }
  }, []);

  // Poll every 7 seconds
  useEffect(() => {
    void fetchNotifications();
    pollRef.current = setInterval(() => {
      void fetchNotifications();
    }, 7_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchNotifications]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleLogout() {
    logout();
    router.replace('/home');
  }

  function handleNotifClick(notif: NotificationItem) {
    setBellOpen(false);
    router.push(notif.href);
  }

  const mergedFirst = topbarFirstName?.trim() || apiFirstName?.trim() || '';
  const mergedLast = topbarLastName?.trim() || apiLastName?.trim() || '';
  const fromProfile = computeAvatarInitials(
    mergedFirst || undefined,
    mergedLast || undefined,
    topbarAvatarText,
  );
  const avatarText =
    fromProfile !== 'N' ? fromProfile : (authAvatarInitials ?? fromProfile);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: 'var(--font-family-body, DM Sans, sans-serif)',
        background: '#F1F3F7',
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 24px',
          background: '#fff',
          borderBottom: '1px solid #e2e5ee',
          flexShrink: 0,
        }}
      >
        <Link
          href="/home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
          }}
        >
          <Image
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            priority
            style={{ objectFit: 'contain' }}
          />
          <span
            style={{
              fontFamily: 'Gilroy-Black, Outfit, sans-serif',
              fontWeight: 400,
              fontSize: 27,
              lineHeight: '27px',
              textTransform: 'capitalize',
            }}
          >
            <span style={{ color: '#0F2A7A' }}>Locum </span>
            <span style={{ color: '#30C6C6' }}>Link</span>
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {topbarRight}

          {/* ── Bell button ── */}
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setBellOpen((v) => !v)}
              id="header-notifications"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: '#5a6478',
                position: 'relative',
              }}
              title="Notifications"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {/* Red badge */}
              {notifTotal > 0 && (
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
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    border: '1.5px solid #fff',
                  }}
                >
                  {notifTotal > 9 ? '9+' : notifTotal}
                </span>
              )}
            </button>

            {/* ── Dropdown ── */}
            {bellOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 36,
                  right: 0,
                  width: 340,
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
                {/* Header */}
                <div
                  style={{
                    padding: '14px 16px 10px',
                    borderBottom: '1px solid #F3F4F6',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{ fontSize: 14, fontWeight: 700, color: '#0f1523' }}
                  >
                    Notifications
                  </span>
                  {notifTotal > 0 && (
                    <span style={{ fontSize: 11, color: '#6B7280' }}>
                      {notifTotal} unread
                    </span>
                  )}
                </div>

                {/* List */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                      <div style={{ fontSize: 13, color: '#9CA3AF' }}>
                        No new notifications
                      </div>
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotifClick(notif)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '12px 16px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #F9FAFB',
                          background: '#fff',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = '#F5F6FF')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = '#fff')
                        }
                      >
                        {/* Icon */}
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background:
                              notif.type === 'message'
                                ? '#EEF0FB'
                                : notif.type === 'application'
                                  ? '#F0FDF4'
                                  : '#FFF7ED',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <NotifIcon type={notif.type} />
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#0f1523',
                              marginBottom: 2,
                              lineHeight: 1.4,
                            }}
                          >
                            {notif.title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#6B7280',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {notif.body}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: '#9CA3AF',
                              marginTop: 4,
                            }}
                          >
                            {fmtNotifTime(notif.createdAt)}
                          </div>
                        </div>

                        {/* Unread dot */}
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#3B4FD8',
                            flexShrink: 0,
                            marginTop: 4,
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                  <div
                    style={{
                      padding: '10px 16px',
                      borderTop: '1px solid #F3F4F6',
                      textAlign: 'center',
                    }}
                  >
                    <button
                      onClick={() => {
                        setBellOpen(false);
                        const role = getRole();
                        router.push(
                          role === 'clinic'
                            ? '/host/messages'
                            : '/locum/messages',
                        );
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 12,
                        color: '#3B4FD8',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      View all messages →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Avatar menu ── */}
          <div ref={avatarMenuRef} style={{ position: 'relative' }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setAvatarMenuOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  setAvatarMenuOpen((v) => !v);
              }}
              aria-label="Account menu"
              aria-expanded={avatarMenuOpen}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#3B4FD8',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              {avatarText}
            </div>

            {avatarMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 40,
                  right: 0,
                  minWidth: 160,
                  background: '#fff',
                  border: '1px solid #e2e5ee',
                  borderRadius: 10,
                  boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)',
                  padding: 6,
                  zIndex: 50,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    handleLogout();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 10px',
                    cursor: 'pointer',
                    color: '#dc2626',
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: 'left',
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = '#FEF2F2')
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: 212,
            flexShrink: 0,
            background: '#fff',
            borderRight: '1px solid #e2e5ee',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <nav style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#8892a4',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                padding: '18px 18px 4px',
              }}
            >
              Locum Management
            </div>
            {navItems.map(({ label, href, icon }) => {
              const active = activeHref === href;
              const isBrowseOpportunities =
                href === '/locum/browse' || label === 'Browse Opportunities';
              const isMyApplications =
                href === '/locum/dashboard' || label === 'My Applications';
              const isProfile = href === '/locum/profile' || label === 'Profile';
              const isMessages =
                href === '/locum/messages' || label === 'Messages';
              const isResources =
                href === '/locum/resources' || label === 'Resources';
              const navId = isBrowseOpportunities
                ? 'nav-browse-opportunities'
                : isMyApplications
                  ? 'nav-my-applications'
                  : isProfile
                    ? 'nav-profile'
                    : isMessages
                      ? 'nav-messages'
                      : isResources
                        ? 'nav-resources'
                        : undefined;
              return (
                <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                  <div
                    id={navId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 18px',
                      fontSize: 13,
                      fontWeight: active ? 500 : 400,
                      color: active ? '#3B4FD8' : '#5a6478',
                      background: active ? '#eef0fb' : 'transparent',
                      borderLeft: `3px solid ${active ? '#3B4FD8' : 'transparent'}`,
                      transition: 'all .12s',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ color: active ? '#3B4FD8' : '#8892a4' }}>
                      {isBrowseOpportunities ? (
                        <Image
                          src="/browse-opportunities.png"
                          alt=""
                          width={20}
                          height={20}
                          style={{
                            objectFit: 'contain',
                            display: 'block',
                            opacity: active ? 1 : 0.9,
                          }}
                        />
                      ) : isMyApplications ? (
                        <Image
                          src="/my-applications.png"
                          alt=""
                          width={20}
                          height={20}
                          style={{
                            objectFit: 'contain',
                            display: 'block',
                            opacity: active ? 1 : 0.9,
                          }}
                        />
                      ) : isProfile ? (
                        <Image
                          src="/basic-information.png"
                          alt=""
                          width={20}
                          height={20}
                          style={{
                            objectFit: 'contain',
                            display: 'block',
                            opacity: active ? 1 : 0.9,
                          }}
                        />
                      ) : isMessages ? (
                        <Image
                          src="/messages.png"
                          alt=""
                          width={20}
                          height={20}
                          style={{
                            objectFit: 'contain',
                            display: 'block',
                            opacity: active ? 1 : 0.9,
                          }}
                        />
                      ) : isResources ? (
                        <Image
                          src="/resources.png"
                          alt=""
                          width={20}
                          height={20}
                          style={{
                            objectFit: 'contain',
                            display: 'block',
                            opacity: active ? 1 : 0.9,
                          }}
                        />
                      ) : (
                        icon
                      )}
                    </span>
                    {label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <main
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              overflowY: 'auto',
              overflowX: 'hidden',
              background: '#fff',
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export { NavIcon };
