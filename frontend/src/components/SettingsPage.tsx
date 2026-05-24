'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashLayout from '@/components/DashLayout';
import { NavIcon } from '@/components/DashLayout';
import { useAuth } from '@/providers/AuthProvider';
import { authApi } from '@/lib/api';
import { getRole, clearProfileCompleteCookies } from '@/lib/auth';
import { beforeClientNavigation } from '@/lib/topLoader';

const HOST_NAV = [
  { label: 'My Postings', href: '/host/dashboard', icon: <NavIcon name="postings" /> },
  { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile" /> },
  { label: 'Messages', href: '/host/messages', icon: <NavIcon name="messages" /> },
  { label: 'Resources', href: '/host/resources', icon: <NavIcon name="resources" /> },
  { label: 'Settings', href: '/host/settings', icon: <NavIcon name="settings" /> },
];
const LOCUM_NAV = [
  { label: 'Browse Opportunities', href: '/locum/browse', icon: <NavIcon name="browse" /> },
  { label: 'My Applications', href: '/locum/dashboard', icon: <NavIcon name="postings" /> },
  { label: 'Profile', href: '/locum/profile', icon: <NavIcon name="profile" /> },
  { label: 'Messages', href: '/locum/messages', icon: <NavIcon name="messages" /> },
  { label: 'Resources', href: '/locum/resources', icon: <NavIcon name="resources" /> },
  { label: 'Settings', href: '/locum/settings', icon: <NavIcon name="settings" /> },
];

type DeactivateModal = null | 'temporary' | 'permanent';

export default function SettingsPage({ role }: { role: 'host' | 'locum' }) {
  const router = useRouter();
  const { logout } = useAuth();
  const nav = role === 'host' ? HOST_NAV : LOCUM_NAV;
  const activeHref = role === 'host' ? '/host/settings' : '/locum/settings';

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [deactivateModal, setDeactivateModal] = useState<DeactivateModal>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    authApi.getMe().then((me) => setEmail(me.email ?? '')).catch(() => {});
  }, []);

  function handleLogout() {
    logout();
    beforeClientNavigation('/home');
    router.replace('/home');
  }

  async function handleTemporaryDeactivate() {
    setBusy(true);
    try {
      await authApi.deactivateAccount();
      clearProfileCompleteCookies();
      logout();
      beforeClientNavigation('/home');
      router.replace('/home');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not deactivate. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePermanentDelete() {
    setBusy(true);
    try {
      await (authApi as any).permanentDeleteAccount();
      clearProfileCompleteCookies();
      logout();
      beforeClientNavigation('/home');
      router.replace('/home');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete account. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );

  const row = (children: React.ReactNode, borderTop = true) => (
    <div style={{ padding: '16px 20px', borderTop: borderTop ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      {children}
    </div>
  );

  return (
    <DashLayout navItems={nav} activeHref={activeHref}>
      <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 48 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0B0F1F', margin: 0 }}>Settings</h1>
          <p style={{ fontSize: 14, color: '#6B7280', margin: '4px 0 0' }}>Manage your account preferences</p>
        </div>

        {/* Account */}
        {section('Account', <>
          {row(<>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>Email address</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{email || 'Loading…'}</div>
            </div>
            <button
              onClick={() => { beforeClientNavigation('/auth'); router.push('/auth?mode=signin'); }}
              style={{ fontSize: 13, fontWeight: 600, color: '#1B31D2', background: 'none', border: '1px solid #C7D2FE', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Change email
            </button>
          </>, false)}
        </>)}

        {/* Notifications */}
        {section('Notifications', <>
          {row(<>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>Push notifications</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Receive alerts for messages and updates</div>
            </div>
            <button
              role="switch"
              aria-checked={notifEnabled}
              onClick={() => setNotifEnabled(v => !v)}
              style={{
                position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none',
                background: notifEnabled ? 'linear-gradient(270deg,#3A65DB,#1B31D2)' : '#D1D5DB',
                cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
              }}>
              <span style={{
                position: 'absolute', top: 3, left: notifEnabled ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
              }} />
            </button>
          </>, false)}
        </>)}

        {/* Danger Zone */}
        {section('Account Management', <>
          {row(<>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#B45309' }}>Temporarily deactivate</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Disable your account for up to 30 days</div>
            </div>
            <button
              onClick={() => setDeactivateModal('temporary')}
              style={{ fontSize: 13, fontWeight: 600, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties}>
              Deactivate
            </button>
          </>, false)}
          {row(<>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626' }}>Permanently delete account</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>All data will be erased and cannot be recovered</div>
            </div>
            <button
              onClick={() => setDeactivateModal('permanent')}
              style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Delete
            </button>
          </>)}
        </>)}

        {/* Logout */}
        {section('Session', <>
          {row(<>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0F1F' }}>Sign out</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Sign out of your account on this device</div>
            </div>
            <button
              onClick={handleLogout}
              style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Logout
            </button>
          </>, false)}
        </>)}
      </div>

      {/* Temporary Deactivate Modal */}
      {deactivateModal === 'temporary' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDeactivateModal(null); }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0B0F1F', margin: '0 0 8px' }}>Temporarily deactivate?</h2>
            <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, margin: '0 0 24px' }}>
              Your account will be temporarily disabled. You can reactivate it within <strong>30 days</strong> by signing in again. After 30 days, your account will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button disabled={busy} onClick={() => setDeactivateModal(null)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button disabled={busy} onClick={() => void handleTemporaryDeactivate()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#B45309', color: '#fff', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Deactivating…' : 'Yes, deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Modal */}
      {deactivateModal === 'permanent' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDeactivateModal(null); }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0B0F1F', margin: '0 0 8px' }}>Permanently delete account?</h2>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: '#991B1B', margin: 0, lineHeight: 1.5 }}>
                ⚠️ This action is <strong>irreversible</strong>. All your data including profile, applications, messages and history will be permanently erased and can never be recovered.
              </p>
            </div>
            <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, margin: '0 0 24px' }}>
              Are you absolutely sure you want to permanently delete your account?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button disabled={busy} onClick={() => setDeactivateModal(null)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button disabled={busy} onClick={() => void handlePermanentDelete()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashLayout>
  );
}
