// PATH:   frontend/src/components/DashLayout.tsx
// ACTION: REPLACE your existing file completely

'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import {
  computeAvatarInitials,
  initialsFromSupabaseUser,
} from '@/lib/avatarInitials';
import { getRole } from '@/lib/auth';
import { hostApi, locumApi } from '@/lib/api';
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
  /** Preferred: first + last name from profile (e.g. contact or locum fields). */
  topbarFirstName?: string | null;
  topbarLastName?: string | null;
  /** Fallback: pre-computed initials or a full name string to parse. */
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
  const pathname = usePathname();
  const { logout } = useAuth();
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const [authAvatarInitials, setAuthAvatarInitials] = useState<string | null>(
    null,
  );
  const [apiFirstName, setApiFirstName] = useState<string | null>(null);
  const [apiLastName, setApiLastName] = useState<string | null>(null);

  useTrackLastPath();

  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (cancelled || !user) return;
        const fromAuth = initialsFromSupabaseUser(user);
        if (fromAuth) setAuthAvatarInitials(fromAuth);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Names from Nest when a page does not pass `topbarFirstName` / `topbarLastName` (e.g. Messages). */
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
        /* offline / 401 — keep initials from props or Supabase */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      const el = avatarMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
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

  function handleLogout() {
    logout();
    router.replace('/home');
  }

  const mergedFirst =
    topbarFirstName?.trim() || apiFirstName?.trim() || '';
  const mergedLast = topbarLastName?.trim() || apiLastName?.trim() || '';

  const fromProfile = computeAvatarInitials(
    mergedFirst || undefined,
    mergedLast || undefined,
    topbarAvatarText,
  );
  const avatarText =
    fromProfile !== 'N' ? fromProfile : authAvatarInitials ?? fromProfile;

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
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: '#5a6478',
            }}
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
          </button>
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

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
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
              return (
                <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                  <div
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
                      {icon}
                    </span>
                    {label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
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
          {/* Only this scrolls */}
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
