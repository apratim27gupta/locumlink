'use client';
import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';
type AdminNavItem = {
    label: string;
    href: string;
    icon: ReactNode;
};
const NAV: AdminNavItem[] = [
    {
        label: 'Overview',
        href: '/admin',
        icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3h8v6h-8V3zM3 17h8v4H3v-4z"/>
      </svg>),
    },
    {
        label: 'Users',
        href: '/admin/users',
        icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>),
    },
    {
        label: 'Verifications',
        href: '/admin/verifications',
        icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z"/>
        <path d="M9 12l2 2 4-5"/>
      </svg>),
    },
    {
        label: 'Audit Logs',
        href: '/admin/audit-logs',
        icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11h6M9 15h6"/>
        <path d="M7 3h10a2 2 0 0 1 2 2v16l-4-3-3 3-3-3-4 3V5a2 2 0 0 1 2-2z"/>
      </svg>),
    },
];
function Chip({ tone, children }: { tone: 'blue' | 'gray'; children: ReactNode }) {
    const styles: Record<string, React.CSSProperties> = {
        blue: {
            background: 'rgba(59, 79, 216, 0.10)',
            color: '#1B31D2',
            border: '1px solid rgba(59, 79, 216, 0.25)',
        },
        gray: {
            background: '#F3F4F6',
            color: '#6B7280',
            border: '1px solid #E5E7EB',
        },
    };
    return (<span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            ...styles[tone],
        }}>
      {children}
    </span>);
}
export default function AdminLayout({ children, title, subtitle, right }: {
    children: ReactNode;
    title: string;
    subtitle?: string;
    right?: ReactNode;
}) {
    const pathname = usePathname();
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    return (<div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
            background: '#F1F3F7',
            fontFamily: 'var(--font-family-body, DM Sans, sans-serif)',
        }}>
      <header style={{
            height: 76,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            background: '#fff',
            borderBottom: '1px solid #e2e5ee',
        }}>
        <Link href="/home" style={{ textDecoration: 'none' }}>
          <Logo size="md" />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Chip tone="blue">Admin Panel</Chip>
          <Chip tone="gray">Staging</Chip>
          <button type="button" onClick={async () => {
            try {
              await fetch(`${apiBase.replace(/\/$/, '')}/api/admin-auth/logout`, { method: 'GET', credentials: 'include' });
            }
            finally {
              window.location.href = '/admin/login';
            }
          }} style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: '#fff',
            fontSize: 13,
            fontWeight: 700,
            color: '#0f1523',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Logout
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{
            width: 252,
            flexShrink: 0,
            background: '#F4F6FB',
            borderRight: '1px solid #e2e5ee',
            padding: '16px 12px',
            boxSizing: 'border-box',
            overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {NAV.map((item) => {
            const active = pathname === item.href || (item.href === '/admin' && pathname === '/admin/dashboard');
            return (<Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    height: 44,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: active ? 'rgba(130,173,237,0.22)' : 'transparent',
                    border: active ? '1px solid rgba(59,79,216,0.20)' : '1px solid transparent',
                    color: active ? '#1B31D2' : 'rgba(2,7,27,0.86)',
                    boxSizing: 'border-box',
                    transition: 'background 0.12s ease, border-color 0.12s ease',
                }}>
                    <span style={{
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}>
                      {item.icon}
                    </span>
                    <span style={{
                    fontFamily: 'Gilroy-Medium, Inter, sans-serif',
                    fontSize: 16,
                    fontWeight: 400,
                    lineHeight: '20px',
                    whiteSpace: 'nowrap',
                }}>
                      {item.label}
                    </span>
                  </div>
                </Link>);
        })}
          </div>
        </aside>

        <div style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
          <div style={{
            padding: '20px 24px',
            background: '#fff',
            borderBottom: '1px solid #e2e5ee',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
        }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#0f1523',
                lineHeight: 1.2,
                marginBottom: subtitle ? 4 : 0,
            }}>
                {title}
              </div>
              {subtitle ? (<div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.35 }}>
                  {subtitle}
                </div>) : null}
            </div>
            {right ? <div style={{ flexShrink: 0 }}>{right}</div> : null}
          </div>

          <main style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '24px',
            boxSizing: 'border-box',
        }}>
            {children}
          </main>
        </div>
      </div>
    </div>);
}

