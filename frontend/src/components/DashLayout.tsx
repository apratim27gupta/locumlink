'use client';
import { ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';
import { onPwaRefresh } from '@/lib/pwaEvents';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { useAuth } from '@/providers/AuthProvider';
import { computeAvatarInitials, initialsFromSupabaseUser, } from '@/lib/avatarInitials';
import { clearProfileCompleteCookies, getRole, getToken, syncCookies } from '@/lib/auth';
import { authApi, hostApi, locumApi, messageApi, notificationsApi, uploadFile, type NotificationItem, } from '@/lib/api';
import { notifCategory } from '@/lib/relativeTime';
import { getSupabase } from '@/lib/supabaseClient';
import { useTrackLastPath } from '../hooks/useTrackLastPath';
import { subscribeProfileUpdated } from '@/lib/profileUpdatedEvent';
import { subscribeMessagesUpdated } from '@/lib/messagesUpdatedEvent';
import { beforeClientNavigation } from '@/lib/topLoader';
import { isExternalNotificationHref, resolveNotificationAction, resolveNotificationTitle } from '@/lib/notificationActions';
import { CountBadge } from '@/components/CountBadge';
import { isNativeShell } from '@/lib/nativeShell';
import { SupportLegalLinks } from '@/components/SupportLegalLinks';
import SidebarFeedback from '@/components/SidebarFeedback';
import AppStoreInstallButton from '@/components/AppStoreInstallButton';
interface NavItem {
    label: string;
    href: string;
    icon: ReactNode;
    badgeCount?: number;
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
const SIDEBAR_ACTIVE = '#38C6C6';

function isAccountNavItem(item: NavItem) {
    const { href, label } = item;
    return (
        label === 'Profile'
        || label === 'Settings'
        || href.endsWith('/profile')
        || href.endsWith('/settings')
    );
}

const ICON: Record<string, string> = {
    browse: 'M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19ZM21 21L16.65 16.65',
    postings: 'M4 6h16M4 10h16M4 14h10',
    profile: 'M12 12c2.7 0 4-1.79 4-4s-1.3-4-4-4-4 1.79-4 4 1.3 4 4 4zm0 2c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z',
    messages: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    resources: 'M12 6.25278V19.2528M12 6.25278C10.8321 5.47686 9.24649 5 7.5 5C5.75351 5 4.16789 5.47686 3 6.25278V19.2528C4.16789 18.4769 5.75351 18 7.5 18C9.24649 18 10.8321 18.4769 12 19.2528M12 6.25278C13.1679 5.47686 14.7535 5 16.5 5C18.2465 5 19.8321 5.47686 21 6.25278V19.2528C19.8321 18.4769 18.2465 18 16.5 18C14.7535 18 13.1679 18.4769 12 19.2528',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
};
function NavIcon({ name }: {
    name: string;
}) {
    const d = ICON[name] ?? ICON.profile;
    return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d={d}/>
    </svg>);
}
function NotifIcon({ type }: {
    type: NotificationItem['type'];
}) {
    const stroke = '#0F2A7A';
    const bg = '#EEF0FB';
    if (type === 'message') return (
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
        </span>
    );
    if (type === 'application') return (
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
        </span>
    );
    if (type === 'reminder') return (
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
        </span>
    );
    if (type === 'cancellation') return (
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
        </span>
    );
    return (
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
        </span>
    );
}
function fmtNotifTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diff < 1)
        return 'Just now';
    if (diff < 60)
        return `${diff}m ago`;
    const hrs = Math.floor(diff / 60);
    if (hrs < 24)
        return `${hrs}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function readNotifPrefs(): Record<string, boolean> | null {
    try {
        const s = localStorage.getItem('notifPrefs');
        return s ? (JSON.parse(s) as Record<string, boolean>) : null;
    }
    catch {
        return null;
    }
}
function applyNotifPrefs(items: NotificationItem[], prefs: Record<string, boolean> | null): NotificationItem[] {
    if (!prefs)
        return items;
    return items.filter((n) => {
        if (n.priority === 'CRITICAL' || n.priority === 'HIGH' || n.priority === 'MEDIUM')
            return true;
        const cat = n.category ?? notifCategory(n.type);
        if (cat === 'cancellations')
            return true;
        return prefs[cat] !== false;
    });
}
export default function DashLayout({ navItems, activeHref, topbarRight, topbarFirstName, topbarLastName, topbarAvatarText, children, }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const { logout, userId } = useAuth();
    const sidebarNavItems = navItems.filter((n) => !isAccountNavItem(n));
    const accountNavItems = navItems.filter(isAccountNavItem);
    const activeNavIndex = sidebarNavItems.findIndex((n) => n.href === activeHref);
    const NAV_PADDING_TOP = 8;
    const NAV_INNER_TOP = 8;
    const NAV_LEFT_INSET = 10;
    const NAV_ITEM_H = 44;
    const NAV_GAP = 18;
    const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => {
        setMobileNavOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!mobileNavOpen)
            return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape')
                setMobileNavOpen(false);
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [mobileNavOpen]);

    const avatarMenuRef = useRef<HTMLDivElement>(null);
    const avatarFileInputRef = useRef<HTMLInputElement>(null);
    const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null);
    const [avatarUploadBusy, setAvatarUploadBusy] = useState(false);
    const [avatarRemoveBusy, setAvatarRemoveBusy] = useState(false);
    const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
    const [deactivateBusy, setDeactivateBusy] = useState(false);
    const [authAvatarInitials, setAuthAvatarInitials] = useState<string | null>(null);
    const [apiFirstName, setApiFirstName] = useState<string | null>(null);
    const [apiLastName, setApiLastName] = useState<string | null>(null);
    const [bellOpen, setBellOpen] = useState(false);
    const [showAllNotifications, setShowAllNotifications] = useState(false);
    const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [notifTotal, setNotifTotal] = useState(0);
    const [messageUnreadTotal, setMessageUnreadTotal] = useState(0);
    const bellRef = useRef<HTMLDivElement>(null);
    /** IDs dismissed locally after open; kept until server reports read (avoids poll flash-back). */
    const dismissedNotifIdsRef = useRef<Set<string>>(new Set());
    useTrackLastPath();
    useEffect(() => {
        let cancelled = false;
        getSupabase()
            .auth.getUser()
            .then(({ data: { user } }) => {
            if (cancelled || !user)
                return;
            const from = initialsFromSupabaseUser(user);
            if (from)
                setAuthAvatarInitials(from);
        })
            .catch(() => { });
        return () => {
            cancelled = true;
        };
    }, [userId]);
    const refreshDashProfileNames = useCallback(async () => {
        const role = getRole();
        if (!role || !getToken())
            return;
        try {
            if (role === 'locum') {
                const data = await locumApi.getProfile();
                if (data.exists && data.profile) {
                    setApiFirstName(data.profile.firstName ?? null);
                    setApiLastName(data.profile.lastName ?? null);
                }
            }
            else {
                const p = await hostApi.getProfile();
                if (p) {
                    setApiFirstName(p.contactFirstName ?? null);
                    setApiLastName(p.contactLastName ?? null);
                }
            }
        }
        catch {
        }
    }, []);
    useEffect(() => {
        void refreshDashProfileNames();
    }, [userId, refreshDashProfileNames]);
    useEffect(() => {
        return subscribeProfileUpdated(() => {
            void refreshDashProfileNames();
        });
    }, [refreshDashProfileNames]);
    useEffect(() => {
        if (!avatarMenuOpen)
            return;
        function onMouseDown(e: MouseEvent) {
            if (avatarMenuRef.current?.contains(e.target as Node))
                return;
            setAvatarMenuOpen(false);
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape')
                setAvatarMenuOpen(false);
        }
        document.addEventListener('mousedown', onMouseDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [avatarMenuOpen]);
    useEffect(() => {
        if (!bellOpen)
            return;
        function onMouseDown(e: MouseEvent) {
            if (bellRef.current?.contains(e.target as Node))
                return;
            setBellOpen(false);
            setShowAllNotifications(false);
        }
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [bellOpen]);
    const fetchNotifications = useCallback(async () => {
        if (!getToken())
            return;
        try {
            const data = await notificationsApi.get({ skipTopLoader: true });
            const dismissed = dismissedNotifIdsRef.current;
            for (const n of data.items) {
                if (n.read)
                    dismissed.delete(n.id);
            }
            const active = data.items.filter((n) => !dismissed.has(n.id));
            setNotifications(active.map((n) => {
                const resolved = resolveNotificationAction(n);
                return {
                    ...n,
                    href: resolved.href ?? n.href,
                    actionLabel: resolved.actionLabel ?? n.actionLabel,
                };
            }));
            setNotifTotal(active.filter((n) => n.read !== true).length);
        }
        catch {
        }
    }, []);
    const fetchMessageUnread = useCallback(async () => {
        if (!getToken())
            return;
        try {
            const { conversations } = await messageApi.getConversations({ skipTopLoader: true });
            const total = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
            setMessageUnreadTotal(total);
        }
        catch {
        }
    }, []);
    useEffect(() => {
        void fetchNotifications();
        void fetchMessageUnread();
    }, [fetchNotifications, fetchMessageUnread, userId]);
    const prevNotifTotal = useRef(0);
    useEffect(() => {
        if (notifTotal > prevNotifTotal.current && prevNotifTotal.current !== 0) {
            const ctx = new AudioContext();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.setValueAtTime(880, ctx.currentTime);
            o.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
            g.gain.setValueAtTime(0.3, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            o.start(); o.stop(ctx.currentTime + 0.4);
        }
        prevNotifTotal.current = notifTotal;
    }, [notifTotal]);
    useEffect(() => {
        if (isNativeShell()) return;
        if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return;
        if (!getToken() || typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        let cancelled = false;
        (async () => {
            try {
                const reg = await navigator.serviceWorker.ready;
                const existing = await reg.pushManager.getSubscription();
                if (existing) {
                    if (!cancelled) await notificationsApi.subscribe(existing.toJSON());
                    return;
                }
                const permission = await Notification.requestPermission();
                if (permission !== 'granted' || cancelled) return;
                const vapidKey = await notificationsApi.getVapidKey();
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: vapidKey,
                });
                if (!cancelled) await notificationsApi.subscribe(sub.toJSON());
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [userId]);
    useVisibilityPolling(() => {
        void fetchNotifications();
        void fetchMessageUnread();
    }, 12_000, Boolean(getToken()));
    useEffect(() => {
        if (!getToken()) return;
        return onPwaRefresh(() => {
            void fetchNotifications();
            void fetchMessageUnread();
        });
    }, [fetchNotifications, fetchMessageUnread]);
    useEffect(() => {
        return subscribeMessagesUpdated(() => {
            void fetchMessageUnread();
        });
    }, [fetchMessageUnread]);
    useEffect(() => {
        if (pathname?.includes('/messages'))
            void fetchMessageUnread();
    }, [pathname, fetchMessageUnread]);
    useEffect(() => {
        if (!getToken())
            return;
        let cancelled = false;
        void (async () => {
            try {
                const me = await authApi.getMe();
                if (!cancelled)
                    setAvatarPhotoUrl(me.avatarUrl ?? null);
            }
            catch {
                if (!cancelled)
                    setAvatarPhotoUrl(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userId]);
    function handleLogout() {
        logout();
        // Hard redirect prevents middleware "next=/host/setup" bounce after logout.
        window.location.replace('/');
    }
    async function handleDeactivateAccount() {
        if (!getToken() || deactivateBusy)
            return;
        setDeactivateBusy(true);
        try {
            await authApi.deactivateAccount();
            setDeactivateConfirmOpen(false);
            setAvatarMenuOpen(false);
            clearProfileCompleteCookies();
            logout();
            window.location.replace('/');
        }
        catch (err) {
            window.alert(err instanceof Error
                ? err.message
                : 'Could not deactivate your account. Try again.');
        }
        finally {
            setDeactivateBusy(false);
        }
    }
    function dismissNotification(notif: NotificationItem) {
        dismissedNotifIdsRef.current.add(notif.id);
        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
        if (notif.read !== true)
            setNotifTotal((t) => Math.max(0, t - 1));
    }
    function markNotifRead(notif: NotificationItem) {
        void notificationsApi
            .markRead(notif.id)
            .catch(() => {
                dismissedNotifIdsRef.current.delete(notif.id);
                void fetchNotifications();
            });
    }
    function notificationHref(notif: NotificationItem): string | null {
        return resolveNotificationAction(notif).href;
    }
    function notificationActionLabel(notif: NotificationItem): string | null {
        return resolveNotificationAction(notif).actionLabel;
    }
    function followNotification(notif: NotificationItem): boolean {
        const href = notificationHref(notif);
        if (!href)
            return false;
        dismissNotification(notif);
        markNotifRead(notif);
        setBellOpen(false);
        setShowAllNotifications(false);
        setSelectedNotif(null);
        if (isExternalNotificationHref(href)) {
            window.location.href = href;
            return true;
        }
        beforeClientNavigation(href);
        router.push(href);
        return true;
    }
    function openNotification(notif: NotificationItem) {
        setSelectedNotif(notif);
        setBellOpen(false);
    }
    function handleNotifClick(notif: NotificationItem) {
        openNotification(notif);
    }
    const notifPrefs = readNotifPrefs();
    const visibleNotifications = applyNotifPrefs(notifications, notifPrefs);
    const unreadNotifications = visibleNotifications.filter((n) => n.read !== true);
    const bellListNotifications = showAllNotifications
        ? visibleNotifications
        : unreadNotifications;
    const bellListPreview = showAllNotifications
        ? bellListNotifications
        : bellListNotifications.slice(0, 3);
    const mergedFirst = apiFirstName?.trim() || topbarFirstName?.trim() || '';
    const mergedLast = apiLastName?.trim() || topbarLastName?.trim() || '';
    const initialsFromContactNames = computeAvatarInitials(mergedFirst || undefined, mergedLast || undefined, topbarAvatarText);
    const avatarText = initialsFromContactNames !== 'N'
        ? initialsFromContactNames
        : (authAvatarInitials ?? 'N');
    const sidebarNavItemsWithBadges = sidebarNavItems.map((item) => {
        const isMessagesNav = item.href === '/locum/messages'
            || item.href === '/host/messages'
            || item.label === 'Messages';
        return isMessagesNav
            ? { ...item, badgeCount: messageUnreadTotal }
            : item;
    });
    return (<div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
            fontFamily: 'var(--font-family-body, DM Sans, sans-serif)',
            background: '#F1F3F7',
        }}>
      
      <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 56,
            padding: '0 14px',
            background: '#fff',
            borderBottom: '1px solid #e2e5ee',
            flexShrink: 0,
            boxSizing: 'border-box',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="dash-hamburger"
            onClick={() => setMobileNavOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#0F2A7A' }}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileNavOpen}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <Link href="/home" style={{ textDecoration: 'none' }}>
            <Logo size="md" />
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {topbarRight}

          
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button onClick={() => setBellOpen((v) => !v)} id="header-notifications" style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            color: '#38C6C6',
            position: 'relative',
        }} title="Notifications">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              
              {notifTotal > 0 && (<span style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: '#DC2626',
                color: '#fff',
                borderRadius: '50%',
                width: 16,
                height: 16,
                fontSize: 'var(--font-small)',
                fontWeight: 'var(--font-weight-bold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                border: '1.5px solid #fff',
            }}>
                  {notifTotal > 9 ? '9+' : notifTotal}
                </span>)}
            </button>

            
            {bellOpen && (<div className="dash-notifications-dropdown" style={{
                position: 'absolute',
                top: 36,
                right: 0,
                width: 340,
                maxHeight: showAllNotifications ? 640 : 440,
                background: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
                zIndex: 100,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}>
                
                <div style={{
                padding: '14px 16px 10px',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                  <span style={{ fontSize: 'var(--font-heading)', fontWeight: 'var(--font-weight-bold)', color: '#0f1523' }}>
                    Notifications
                  </span>
                  {notifTotal > 0 && (<span style={{ fontSize: 'var(--font-small)', color: '#6B7280' }}>
                      {notifTotal} unread
                    </span>)}
                </div>

                
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {(() => {
                    if (bellListNotifications.length === 0) return <div style={{ padding: '36px 20px', textAlign: 'center' }}><div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div><div style={{ fontSize: 'var(--font-body)', color: '#9CA3AF' }}>No new notifications</div></div>;
                    return bellListPreview.map((notif) => {
                    const isUnread = notif.read !== true;
                    const rowBg = '#fff';
                    const rowHover = '#F5F6FF';
                    return (<div key={notif.id} onClick={() => handleNotifClick(notif)} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #F9FAFB',
                    borderLeft: '3px solid transparent',
                    background: rowBg,
                    transition: 'background 0.1s',
                }} onMouseEnter={(e) => (e.currentTarget.style.background = rowHover)} onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}>
                        
                        <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: '#EEF0FB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                          <NotifIcon type={notif.type}/>
                        </div>

                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginBottom: 2,
                }}>
                            <span style={{
                    fontSize: 'var(--font-heading)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: '#0f1523',
                    lineHeight: 1.4,
                }}>
                              {resolveNotificationTitle(notif)}
                            </span>
                          </div>
                          <div style={{
                    fontSize: 'var(--font-small)',
                    color: '#6B7280',
                    lineHeight: 1.45,
                    whiteSpace: 'normal' as const,
                }}>
                            {notif.body}
                          </div>
                          {(() => {
                            const actionLabel = notificationActionLabel(notif);
                            const href = notificationHref(notif);
                            if (!actionLabel || !href) return null;
                            return (<button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        followNotification(notif);
                    }}
                    style={{
                    fontSize: 'var(--font-small)',
                    color: '#3B4FD8',
                    fontWeight: 600,
                    marginTop: 6,
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                }}>
                            {actionLabel}
                          </button>);
                          })()}
                          <div style={{
                    fontSize: 'var(--font-small)',
                    color: '#9CA3AF',
                    marginTop: 4,
                }}>
                            {fmtNotifTime(notif.createdAt)}
                          </div>
                        </div>

                        
                        {isUnread && (<div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#3B4FD8',
                    flexShrink: 0,
                    marginTop: 4,
                }}/>)}
                      </div>);
                    });
                  })()} 
                </div>

                
                {(() => {
                  const hasMoreThanThree = unreadNotifications.length > 3;
                  if (!hasMoreThanThree || showAllNotifications) return null;
                  return (
                    <div style={{
                    padding: '10px 16px',
                    borderTop: '1px solid #F3F4F6',
                    textAlign: 'center',
                }}>
                    <button onClick={() => {
                    setShowAllNotifications(true);
                }} style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 'var(--font-small)',
                    color: '#3B4FD8',
                    fontWeight: 'var(--font-weight-bold)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                }}>
                      Show all notifications →
                    </button>
                  </div>
                  );
                })()}
              </div>)}
          </div>

          
          <div ref={avatarMenuRef} style={{ position: 'relative' }}>
            <input ref={avatarFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file)
                return;
            if (!getToken())
                return;
            const maxBytes = 5 * 1024 * 1024;
            if (file.size > maxBytes) {
                window.alert('Image must be 5 MB or smaller.');
                return;
            }
            setAvatarUploadBusy(true);
            void (async () => {
                try {
                    const { path, signedUrl } = await uploadFile(file, 'avatars');
                    await authApi.updateAvatar(path);
                    setAvatarPhotoUrl(signedUrl);
                    setAvatarMenuOpen(false);
                }
                catch (err) {
                    window.alert(err instanceof Error
                        ? err.message
                        : 'Could not upload photo.');
                }
                finally {
                    setAvatarUploadBusy(false);
                }
            })();
        }}/>
            <div id="nav-account-menu" role="button" tabIndex={0} onClick={() => setAvatarMenuOpen((v) => !v)} onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ')
                setAvatarMenuOpen((v) => !v);
        }} aria-label="Account menu" aria-expanded={avatarMenuOpen} style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: avatarPhotoUrl ? 'transparent' : '#3B4FD8',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-body)',
            fontWeight: 'var(--font-weight-bold)',
            cursor: 'pointer',
            userSelect: 'none',
            overflow: 'hidden',
            border: avatarPhotoUrl ? '1px solid #e2e5ee' : 'none',
            flexShrink: 0,
        }}>
              {avatarPhotoUrl ? (<img src={avatarPhotoUrl} alt="" width={32} height={32} style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
            }}/>) : (avatarText)}
            </div>

            {avatarMenuOpen && (() => {
                const avatarMenuRow: React.CSSProperties = {
                    width: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 40,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontFamily: 'inherit',
                    fontSize: 'var(--font-body)',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    textAlign: 'left',
                    cursor: 'pointer',
                };
                const avatarMenuIcon: React.CSSProperties = {
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                };
                const menuDisabled = avatarUploadBusy || avatarRemoveBusy || !getToken();
                return (
              <div style={{
                position: 'absolute',
                top: 40,
                right: 0,
                width: 240,
                background: '#fff',
                border: '1px solid #e2e5ee',
                borderRadius: 10,
                boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)',
                padding: 8,
                zIndex: 50,
                boxSizing: 'border-box',
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    width: '100%',
                    gap: 4,
                }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: avatarPhotoUrl ? 'transparent' : '#3B4FD8',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 700,
                    border: avatarPhotoUrl ? '1px solid #e2e5ee' : 'none',
                    alignSelf: 'center',
                    marginBottom: 4,
                  }}>
                    {avatarPhotoUrl ? (
                      <img src={avatarPhotoUrl} alt="" width={56} height={56} style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }} />
                    ) : (
                      avatarText
                    )}
                  </div>
                  {accountNavItems.map((item) => (
                    <Link
                      key={item.href}
                      id={
                        item.label === 'Profile'
                          ? 'nav-profile'
                          : item.label === 'Settings'
                            ? 'nav-settings'
                            : undefined
                      }
                      href={item.href}
                      onClick={() => {
                        syncCookies();
                        beforeClientNavigation(item.href);
                        setAvatarMenuOpen(false);
                        setMobileNavOpen(false);
                      }}
                      style={{
                        ...avatarMenuRow,
                        textDecoration: 'none',
                        color: activeHref === item.href ? '#3B4FD8' : '#0f1523',
                        background: activeHref === item.href ? '#EEF0FB' : 'transparent',
                      }}
                      onMouseOver={(e) => {
                        if (activeHref !== item.href)
                          e.currentTarget.style.background = '#F3F4F6';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background =
                          activeHref === item.href ? '#EEF0FB' : 'transparent';
                      }}
                    >
                      <span style={avatarMenuIcon}>{item.icon}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
                    </Link>
                  ))}
                  <button
                    type="button"
                    disabled={menuDisabled}
                    onClick={() => avatarFileInputRef.current?.click()}
                    style={{
                      ...avatarMenuRow,
                      background: 'transparent',
                      color: '#0f1523',
                      opacity: menuDisabled ? 0.55 : 1,
                      cursor: menuDisabled ? 'default' : 'pointer',
                    }}
                    onMouseOver={(e) => {
                      if (!menuDisabled)
                        e.currentTarget.style.background = '#F3F4F6';
                    }}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={avatarMenuIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {avatarUploadBusy
                        ? 'Uploading…'
                        : avatarPhotoUrl
                          ? 'Change profile photo'
                          : 'Add profile photo'}
                    </span>
                  </button>
                  {avatarPhotoUrl ? (
                    <button
                      type="button"
                      disabled={menuDisabled}
                      onClick={() => {
                        void (async () => {
                          if (!getToken())
                            return;
                          setAvatarRemoveBusy(true);
                          try {
                            await authApi.clearAvatar();
                            setAvatarPhotoUrl(null);
                            try {
                              const me = await authApi.getMe();
                              setAvatarPhotoUrl(me.avatarUrl ?? null);
                            }
                            catch {
                              setAvatarPhotoUrl(null);
                            }
                            await refreshDashProfileNames();
                            setAvatarMenuOpen(false);
                          }
                          catch (err) {
                            window.alert(err instanceof Error
                              ? err.message
                              : 'Could not remove profile photo.');
                          }
                          finally {
                            setAvatarRemoveBusy(false);
                          }
                        })();
                      }}
                      style={{
                        ...avatarMenuRow,
                        background: 'transparent',
                        color: '#92400E',
                        opacity: menuDisabled ? 0.55 : 1,
                        cursor: menuDisabled ? 'default' : 'pointer',
                      }}
                      onMouseOver={(e) => {
                        if (!menuDisabled)
                          e.currentTarget.style.background = '#FFFBEB';
                      }}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={avatarMenuIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 6h18"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {avatarRemoveBusy ? 'Removing…' : 'Remove profile photo'}
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={avatarRemoveBusy || avatarUploadBusy || deactivateBusy}
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      handleLogout();
                    }}
                    style={{
                      ...avatarMenuRow,
                      background: 'transparent',
                      color: '#dc2626',
                      opacity: avatarRemoveBusy || avatarUploadBusy || deactivateBusy ? 0.55 : 1,
                      cursor: avatarRemoveBusy || avatarUploadBusy || deactivateBusy ? 'default' : 'pointer',
                      marginTop: 4,
                      borderTop: '1px solid #F3F4F6',
                      borderRadius: '0 0 8px 8px',
                      paddingTop: 12,
                    }}
                    onMouseOver={(e) => {
                      if (!avatarRemoveBusy && !avatarUploadBusy && !deactivateBusy)
                        e.currentTarget.style.background = '#FEF2F2';
                    }}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={avatarMenuIcon}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>Logout</span>
                  </button>
                </div>
              </div>
                );
            })()}
          </div>
        </div>
      </header>

      
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {mobileNavOpen && (
          <button
            type="button"
            className="dash-sidebar-overlay"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <aside className={mobileNavOpen ? 'dash-sidebar dash-sidebar--open' : 'dash-sidebar'} style={{
            position: 'relative',
            width: 242,
            flexShrink: 0,
            background: 'linear-gradient(180deg, #0F2A7A 0%, #1E3FAF 100%)',
            boxShadow: '4px 0 24px rgba(15,42,122,0.18)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflowY: 'auto',
            boxSizing: 'border-box',
            padding: '8px 12px 28px',
            gap: 14,
        }}>
          {activeNavIndex >= 0 && (
            <div style={{
              position: 'absolute',
              left: NAV_LEFT_INSET,
              top: NAV_PADDING_TOP +
                  NAV_INNER_TOP +
                  activeNavIndex * (NAV_ITEM_H + NAV_GAP),
              width: 6,
              height: NAV_ITEM_H,
              background: SIDEBAR_ACTIVE,
              borderRadius: '0px 8px 8px 0px',
              transition: 'top 0.2s ease',
            }}/>
          )}

          <nav style={{ flex: 1, paddingTop: NAV_INNER_TOP }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {sidebarNavItemsWithBadges.map(({ label, href, icon, badgeCount }) => {
            const active = activeHref === href;
            const isBrowseOpportunities = href === '/locum/browse' || label === 'Browse Opportunities';
            const isLocumDashboard = href === '/locum/dashboard' || label === 'My Applications';
            const isHostPostings = href === '/host/dashboard' || label === 'My Postings';
            const isMessages = href === '/locum/messages' || href === '/host/messages' || label === 'Messages';
            const isResources = href === '/locum/resources' || href === '/host/resources' || label === 'Resources';
            const sidebarIconName = isBrowseOpportunities
                ? 'browse'
                : isLocumDashboard || isHostPostings
                    ? 'postings'
                    : isMessages
                        ? 'messages'
                        : isResources
                            ? 'resources'
                            : null;
            const navId = isBrowseOpportunities
                ? 'nav-browse-opportunities'
                : isHostPostings
                    ? 'nav-my-postings'
                    : isLocumDashboard
                        ? 'nav-my-applications'
                        : isMessages
                            ? 'nav-messages'
                            : isResources
                                ? 'nav-resources'
                                : undefined;
            return (<Link key={href} href={href} style={{ textDecoration: 'none' }} onClick={() => {
                    syncCookies();
                    beforeClientNavigation(href);
                    setMobileNavOpen(false);
                }}>
                    <div id={navId} style={{
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    maxWidth: 212,
                    height: 44,
                    padding: '10px 12px 10px 8px',
                    background: active
                        ? 'rgba(56, 198, 198, 0.15)'
                        : 'transparent',
                    borderRadius: 10,
                    cursor: 'pointer',
                    color: active ? SIDEBAR_ACTIVE : 'rgba(255,255,255,0.85)',
                    transition: 'background 0.15s, color 0.15s',
                }}>
                      <span style={{
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}>
                        {sidebarIconName ? <NavIcon name={sidebarIconName}/> : icon}
                      </span>
                      <span style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: 'Gilroy-Medium, Inter, sans-serif',
                    fontSize: 'var(--font-heading)',
                    lineHeight: '20px',
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: active ? SIDEBAR_ACTIVE : 'rgba(255,255,255,0.85)',
                    fontWeight: active ? 600 : 400,
                }}>
                        {label}
                      </span>
                      <CountBadge count={badgeCount ?? 0} variant="sidebar" />
                    </div>
                  </Link>);
        })}
            </div>
          </nav>

          <SidebarFeedback onNavigate={() => setMobileNavOpen(false)} />
          <SupportLegalLinks
            variant="sidebar"
            onNavigate={() => setMobileNavOpen(false)}
          />
          <div className="dash-sidebar-app-store">
            <AppStoreInstallButton variant="dashboard" />
          </div>
        </aside>

        <div
            className="dash-content-column"
            style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            height: '100%',
            overflow: 'hidden',
        }}>
          <main className="dash-main-content" style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: 28,
            overflowY: 'auto',
            overflowX: 'hidden',
            background: '#F7F8FA',
            boxSizing: 'border-box',
        }}>
            {children}
          </main>
        </div>
      </div>
      {selectedNotif && typeof document !== 'undefined' && createPortal((() => {
        const actionLabel = notificationActionLabel(selectedNotif);
        const href = notificationHref(selectedNotif);
        return (<div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedNotif(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 100030,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #E5E7EB',
              boxShadow: '0 18px 60px rgba(0,0,0,0.22)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 16px 10px',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0B0F1F', lineHeight: 1.3 }}>
                  {resolveNotificationTitle(selectedNotif)}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#9CA3AF' }}>
                  {fmtNotifTime(selectedNotif.createdAt)}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close notification"
                onClick={() => setSelectedNotif(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: 22,
                  lineHeight: 1,
                  color: '#6B7280',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '14px 16px 16px' }}>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {selectedNotif.body}
              </div>
              {actionLabel && href ? (
                <button
                  type="button"
                  onClick={() => followNotification(selectedNotif)}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#1C32D2',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {actionLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>);
      })(), document.body)}
    </div>);
}
export { NavIcon };
