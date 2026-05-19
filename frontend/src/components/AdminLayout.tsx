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
import { useAdminStats } from '@/components/AdminStatsContext';
import '@/styles/admin-portal.css';

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  badge?: number;
};

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

  return (
    <div className="admin-portal">
      <div className="admin-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>LocumLink</h1>
            <p>Admin Portal</p>
          </div>

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

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutInner>{children}</AdminLayoutInner>;
}
