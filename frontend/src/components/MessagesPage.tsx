'use client';
import EmojiPicker from 'emoji-picker-react';
import { useEffect, useState, useRef, useCallback, useMemo, Suspense, type MouseEvent as ReactMouseEvent, } from 'react';
import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { hostApi, locumApi, messageApi, uploadFile, type ApplicationRecord, type Conversation, type MyApplication, type ThreadMessage, type ThreadPartner, } from '@/lib/api';
import { getEmail, getToken } from '@/lib/auth';
import { beforeClientNavigation } from '@/lib/topLoader';
import { useAuth } from '@/providers/AuthProvider';
import { NameWithVerifiedShield } from '@/components/NameWithVerifiedShield';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
const HOST_NAV = [
    {
        label: 'My Postings',
        href: '/host/dashboard',
        icon: <NavIcon name="postings"/>,
    },
    { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile"/> },
    {
        label: 'Messages',
        href: '/host/messages',
        icon: <NavIcon name="messages"/>,
    },
    {
        label: 'Resources',
        href: '/host/resources',
        icon: <NavIcon name="resources"/>,
    },
    {
        label: 'Settings',
        href: '/host/settings',
        icon: <NavIcon name="settings"/>,
    },
];
const LOCUM_NAV = [
    {
        label: 'Browse Opportunities',
        href: '/locum/browse',
        icon: <NavIcon name="browse"/>,
    },
    {
        label: 'My Applications',
        href: '/locum/dashboard',
        icon: <NavIcon name="postings"/>,
    },
    {
        label: 'Profile',
        href: '/locum/profile',
        icon: <NavIcon name="profile"/>,
    },
    {
        label: 'Messages',
        href: '/locum/messages',
        icon: <NavIcon name="messages"/>,
    },
    {
        label: 'Resources',
        href: '/locum/resources',
        icon: <NavIcon name="resources"/>,
    },
    {
        label: 'Settings',
        href: '/locum/settings',
        icon: <NavIcon name="settings"/>,
    },
];
const MESSAGES_LIST_WIDTH_KEY = 'll-messages-list-width';
const MESSAGES_LIST_MIN = 260;
const MESSAGES_LIST_MAX = 560;
const MESSAGES_LIST_DEFAULT = 360;
function readStoredMessagesListWidth(): number {
    if (typeof window === 'undefined')
        return MESSAGES_LIST_DEFAULT;
    const n = parseInt(localStorage.getItem(MESSAGES_LIST_WIDTH_KEY) ?? '', 10);
    if (!Number.isFinite(n))
        return MESSAGES_LIST_DEFAULT;
    return Math.min(MESSAGES_LIST_MAX, Math.max(MESSAGES_LIST_MIN, n));
}
type AnyUser = {
    id: string;
    email: string;
    role: string;
    locumProfile: {
        firstName: string | null;
        lastName: string | null;
    } | null;
    hostProfile: {
        contactFirstName: string | null;
        contactLastName: string | null;
        practiceName: string;
    } | null;
};
function getDisplayName(user: AnyUser): string {
    if (user.locumProfile?.firstName)
        return `Dr ${user.locumProfile.firstName} ${user.locumProfile.lastName ?? ''}`.trim();
    if (user.hostProfile?.contactFirstName)
        return `Dr ${user.hostProfile.contactFirstName} ${user.hostProfile.contactLastName ?? ''}`.trim();
    if (user.hostProfile?.practiceName)
        return user.hostProfile.practiceName;
    return user.email.split('@')[0];
}
function getClinicName(user: AnyUser): string {
    return user.hostProfile?.practiceName ?? '';
}
function getSpecializations(partner: ThreadPartner | null): string[] {
    if (!partner)
        return [];
    if (partner.locumProfile?.specializationText)
        return partner.locumProfile.specializationText
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
            .slice(0, 4);
    if (partner.locumProfile?.specialty)
        return [partner.locumProfile.specialty.replace(/_/g, ' ')];
    return [];
}
function getLocation(partner: ThreadPartner | null): string {
    if (!partner)
        return '';
    const city = partner.locumProfile?.city ?? partner.hostProfile?.city ?? '';
    const prov = partner.locumProfile?.province ?? partner.hostProfile?.province ?? '';
    return [city, prov].filter(Boolean).join(', ');
}
function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
    });
}
function fmtDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff === 0)
        return 'Today';
    if (diff === 1)
        return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtConvDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff === 0)
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function isImageMime(mime: string): boolean {
    return /^image\//i.test(mime);
}
const MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MESSAGE_ATTACHMENT_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const DOCUMENT_ATTACH_ACCEPT = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.doc,.docx';
const IMAGE_ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
function messageAttachmentError(file: File): string | null {
    if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES)
        return 'File must be 10 MB or smaller.';
    if (file.type && !MESSAGE_ATTACHMENT_MIME.has(file.type))
        return 'Only PDF, JPG, PNG, WEBP, GIF, DOC, or DOCX files are allowed.';
    return null;
}
const AVATAR_GLYPH_PX = 16;
function AvatarGlyph({ variant, size = AVATAR_GLYPH_PX, }: {
    variant: 'locum' | 'clinic';
    size?: number;
}) {
    const src = variant === 'locum' ? '/avatar-locum.png' : '/avatar-clinic.png';
    return (<Image src={src} alt={variant === 'locum' ? 'Locum' : 'Clinic'} width={size} height={size} draggable={false} style={{
            display: 'block',
            width: size,
            height: size,
            objectFit: 'contain',
            opacity: 1,
        }}/>);
}
function isLocumUser(user: AnyUser): boolean {
    const r = String(user.role ?? '').toUpperCase();
    if (r === 'HOST')
        return false;
    if (r === 'LOCUM')
        return true;
    if (user.hostProfile != null)
        return false;
    if (user.locumProfile != null)
        return true;
    return false;
}
function SearchIcon() {
    return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="#9CA3AF" strokeWidth="1.4"/>
      <path d="M10 10l3.5 3.5" stroke="#9CA3AF" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>);
}
function AttachFileIcon() {
    return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="#6B7280" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function AttachImagesIcon() {
    return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="#6B7280" strokeWidth="1.75"/>
      <circle cx="8.75" cy="8.75" r="1.6" fill="#6B7280"/>
      <path d="M21 17l-4.25-4.25a2 2 0 0 0-2.71-.08L6 21" stroke="#6B7280" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function Avatar({ user, size = AVATAR_GLYPH_PX, variant, }: {
    user: AnyUser;
    size?: number;
    variant?: 'locum' | 'clinic';
}) {
    const locum = variant != null ? variant === 'locum' : isLocumUser(user);
    return (<div style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: '#F3F4F6',
            border: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            padding: 0,
            boxSizing: 'border-box',
        }}>
      <AvatarGlyph variant={locum ? 'locum' : 'clinic'} size={size}/>
    </div>);
}
function DeleteModal({ onDeleteForEveryone, onDeleteForMe, onCancel, }: {
    onDeleteForEveryone: () => void;
    onDeleteForMe: () => void;
    onCancel: () => void;
}) {
    return (<>
      <div onClick={onCancel} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 500,
        }}/>
      <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#fff',
            borderRadius: 12,
            padding: '24px 28px',
            width: 320,
            zIndex: 501,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            fontFamily: 'Inter, sans-serif',
        }}>
        <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#0f1523',
            marginBottom: 20,
        }}>
          Delete message?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onDeleteForEveryone} style={{
            padding: '10px 16px',
            background: '#DC2626',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
        }}>
            Delete for everyone
          </button>
          <button onClick={onDeleteForMe} style={{
            padding: '10px 16px',
            background: '#F3F4F6',
            color: '#374151',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
        }}>
            Delete for me
          </button>
          <button onClick={onCancel} style={{
            padding: '8px',
            background: 'none',
            border: 'none',
            color: '#9CA3AF',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
        }}>
            Cancel
          </button>
        </div>
      </div>
    </>);
}
export interface MessagesPageProps {
    role: 'host' | 'locum';
}
function MessagesPageInner({ role }: MessagesPageProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { isLoading: authLoading, userId } = useAuth();
    const navItems = role === 'host' ? HOST_NAV : LOCUM_NAV;
    const activeHref = role === 'host' ? '/host/messages' : '/locum/messages';
    const partnerAvatarVariant: 'locum' | 'clinic' = role === 'locum' ? 'clinic' : 'locum';
    const myAvatarVariant: 'locum' | 'clinic' = role === 'locum' ? 'locum' : 'clinic';
    const urlPartnerId = searchParams.get('partnerId');
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(urlPartnerId);
    const [thread, setThread] = useState<ThreadMessage[]>([]);
    const [partner, setPartner] = useState<ThreadPartner | null>(null);
    const [messageText, setMessageText] = useState('');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [search, setSearch] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [loadingThread, setLoadingThread] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBody, setEditBody] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ThreadMessage | null>(null);
    const [myApplications, setMyApplications] = useState<MyApplication[]>([]);
    const [myListPreviewName, setMyListPreviewName] = useState<string | null>(null);
    const [myCpsnsVerified, setMyCpsnsVerified] = useState(false);
    const [listPanelWidth, setListPanelWidth] = useState(readStoredMessagesListWidth);
    useEffect(() => {
        setMyListPreviewName(null);
        setMyCpsnsVerified(false);
    }, [pathname]);
    useEffect(() => {
        if (authLoading || !getToken())
            return;
        let cancelled = false;
        void (async () => {
            try {
                if (role === 'host') {
                    const p = await hostApi.getProfile();
                    if (cancelled || !p)
                        return;
                    setMyCpsnsVerified(
                        isCpsnsVerificationApproved(p.cpsnsVerificationStatus),
                    );
                    if (p.contactFirstName?.trim()) {
                        setMyListPreviewName(`Dr ${p.contactFirstName} ${p.contactLastName ?? ''}`.trim());
                    }
                    else if (p.clinicName?.trim()) {
                        setMyListPreviewName(p.clinicName.trim());
                    }
                }
                else {
                    const { exists, profile } = await locumApi.getProfile();
                    if (cancelled || !exists || !profile?.firstName?.trim())
                        return;
                    setMyCpsnsVerified(
                        isCpsnsVerificationApproved(profile.cpsnsVerificationStatus),
                    );
                    setMyListPreviewName(`Dr ${profile.firstName} ${profile.lastName ?? ''}`.trim());
                }
            }
            catch {
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [authLoading, role, userId, pathname]);
    const [composeJobPostingId, setComposeJobPostingId] = useState<string | null>(null);
    const [threadHostApplication, setThreadHostApplication] = useState<{
        id: string;
        status: ApplicationRecord['status'];
    } | null>(null);
    const [confirmLocumBusy, setConfirmLocumBusy] = useState(false);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const threadScrollRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const filePickRef = useRef<HTMLInputElement>(null);
    const imagePickRef = useRef<HTMLInputElement>(null);
    const threadSinceRef = useRef<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!menuOpenId)
            return;
        function onClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpenId(null);
            }
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [menuOpenId]);
    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearchQuery(search.trim()), 280);
        return () => window.clearTimeout(t);
    }, [search]);
    const loadConversations = useCallback(async (opts?: {
        skipTopLoader?: boolean;
    }) => {
        try {
            const q = debouncedSearchQuery || undefined;
            const { conversations: data } = await messageApi.getConversations({
                skipTopLoader: opts?.skipTopLoader,
                q,
            });
            setConversations(data);
            if (!urlPartnerId && !selectedPartnerId && data.length > 0) {
                const first = data[0];
                setSelectedPartnerId(first.partnerId);
                setComposeJobPostingId(first.lastMessage.jobPosting?.id ?? null);
            }
        }
        catch {
        }
        finally {
            setLoadingConvs(false);
        }
    }, [urlPartnerId, debouncedSearchQuery, selectedPartnerId]);
    useEffect(() => {
        if (authLoading)
            return;
        if (!getToken()) {
            setLoadingConvs(false);
            beforeClientNavigation('/auth');
            router.replace('/auth');
            return;
        }
        void loadConversations();
    }, [authLoading, router, loadConversations, debouncedSearchQuery]);
    useEffect(() => {
        const pid = searchParams.get('partnerId');
        const jid = searchParams.get('jobPostingId');
        if (pid)
            setSelectedPartnerId(pid);
        if (role === 'host' && jid)
            setComposeJobPostingId(jid);
    }, [searchParams, role]);
    useEffect(() => {
        if (authLoading || role !== 'locum' || !getToken())
            return;
        void locumApi
            .getMyApplications()
            .then(({ applications }) => setMyApplications(applications))
            .catch(() => setMyApplications([]));
    }, [authLoading, role]);
    const loadThread = useCallback(async (partnerId: string) => {
        setLoadingThread(true);
        try {
            const { messages, partner: p } = await messageApi.getThread(partnerId);
            const hiddenIds = new Set(JSON.parse(localStorage.getItem('deleted-for-me') || '[]'));
            const visible = messages.filter((m: ThreadMessage) => !hiddenIds.has(m.id));
            setThread(visible);
            const last = visible[visible.length - 1];
            threadSinceRef.current = last?.sentAt ?? null;
            setPartner(p);
            setConversations((prev) => prev.map((c) => c.partnerId === partnerId ? { ...c, unreadCount: 0 } : c));
        }
        catch {
        }
        finally {
            setLoadingThread(false);
        }
    }, []);
    useEffect(() => {
        if (!selectedPartnerId || authLoading || !getToken())
            return;
        void loadThread(selectedPartnerId);
    }, [selectedPartnerId, loadThread, authLoading]);
    useEffect(() => {
        stickToBottomRef.current = true;
    }, [selectedPartnerId]);
    function onThreadScroll() {
        const el = threadScrollRef.current;
        if (!el)
            return;
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottomRef.current = dist < 80;
    }
    useEffect(() => {
        if (!stickToBottomRef.current)
            return;
        const el = threadScrollRef.current;
        if (!el)
            return;
        if (loadingThread || thread.length === 0)
            return;
        const id = window.requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });
        return () => window.cancelAnimationFrame(id);
    }, [thread, loadingThread]);
    useEffect(() => {
        threadSinceRef.current = null;
    }, [selectedPartnerId]);
    const pollMessages = useCallback(async () => {
        if (!selectedPartnerId || !getToken())
            return;
        const since = threadSinceRef.current ?? undefined;
        try {
            const [threadResult, { conversations: convs }] = await Promise.all([
                since
                    ? messageApi.getThread(selectedPartnerId, { skipTopLoader: true, since })
                    : Promise.resolve({ messages: [] as ThreadMessage[], partner: null }),
                messageApi.getConversations({
                    skipTopLoader: true,
                    q: debouncedSearchQuery || undefined,
                }),
            ]);
            const hiddenIds2 = new Set(JSON.parse(localStorage.getItem('deleted-for-me') || '[]'));
            const incoming = threadResult.messages.filter((m: ThreadMessage) => !hiddenIds2.has(m.id));
            if (incoming.length > 0) {
                const lastIncoming = incoming[incoming.length - 1];
                threadSinceRef.current = lastIncoming.sentAt;
                setThread((prev) => {
                    const byId = new Map(prev.map((m) => [m.id, m]));
                    for (const m of incoming)
                        byId.set(m.id, m);
                    return [...byId.values()].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
                });
            }
            setConversations(convs.map((c) => c.partnerId === selectedPartnerId ? { ...c, unreadCount: 0 } : c));
        }
        catch {
        }
    }, [selectedPartnerId, debouncedSearchQuery]);
    useVisibilityPolling(() => {
        void pollMessages();
    }, 10_000, Boolean(selectedPartnerId) && !authLoading && Boolean(getToken()));
    useEffect(() => {
        if (role !== 'host' || !selectedPartnerId || !composeJobPostingId) {
            setThreadHostApplication(null);
            return;
        }
        let cancelled = false;
        void hostApi
            .getApplications(composeJobPostingId)
            .then(({ applications }) => {
            if (cancelled)
                return;
            const app = applications.find((a) => a.locumProfile.userId === selectedPartnerId);
            setThreadHostApplication(app
                ? { id: app.id, status: app.status }
                : null);
        })
            .catch(() => {
            if (!cancelled)
                setThreadHostApplication(null);
        });
        return () => {
            cancelled = true;
        };
    }, [role, selectedPartnerId, composeJobPostingId]);
    async function handleSend() {
        const body = messageText.trim();
        if (!selectedPartnerId || sending)
            return;
        if (!body && pendingFiles.length === 0)
            return;
        setSending(true);
        setSendError(null);
        setMessageText('');
        try {
            const attachments = pendingFiles.length > 0
                ? await Promise.all(pendingFiles.map(async (f) => {
                    const folder = `messages/${selectedPartnerId}`;
                    const up = await uploadFile(f, folder);
                    return {
                        storagePath: up.path,
                        fileName: up.fileName,
                        mimeType: up.mimeType,
                        size: up.size,
                    };
                }))
                : [];
            const { message } = await messageApi.sendMessage(selectedPartnerId, body, composeJobPostingId ?? undefined, attachments);
            stickToBottomRef.current = true;
            setThread((prev) => [...prev, message as ThreadMessage]);
            threadSinceRef.current = message.sentAt;
            setPendingFiles([]);
            void loadConversations();
        }
        catch (e: unknown) {
            setMessageText(body);
            setSendError(e instanceof Error ? e.message : 'Could not send message. Please try again.');
        }
        finally {
            setSending(false);
            inputRef.current?.focus();
        }
    }
    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.nativeEvent.isComposing)
            return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    }
    function appendPendingAttachments(files: File[]) {
        const next: File[] = [];
        for (const f of files) {
            const err = messageAttachmentError(f);
            if (err) {
                window.alert(`${f.name}: ${err}`);
                continue;
            }
            next.push(f);
        }
        if (next.length)
            setPendingFiles((prev) => [...prev, ...next]);
    }
    async function handleConfirmLocumFromThread() {
        if (role !== 'host' || !composeJobPostingId || !threadHostApplication || confirmLocumBusy)
            return;
        if (threadHostApplication.status === 'CONFIRMED' ||
            threadHostApplication.status === 'REJECTED' ||
            threadHostApplication.status === 'WITHDRAWN')
            return;
        setConfirmLocumBusy(true);
        try {
            await hostApi.updateApplication(composeJobPostingId, threadHostApplication.id, 'CONFIRMED');
            setThreadHostApplication((prev) => prev ? { ...prev, status: 'CONFIRMED' } : null);
            void loadConversations();
        }
        catch (e: unknown) {
            window.alert(e instanceof Error ? e.message : 'Could not confirm this applicant.');
        }
        finally {
            setConfirmLocumBusy(false);
        }
    }
    function startEdit(msg: ThreadMessage) {
        setEditingId(msg.id);
        setEditBody(msg.body);
        setMenuOpenId(null);
    }
    async function saveEdit() {
        if (!editingId || !editBody.trim())
            return;
        setSavingEdit(true);
        try {
            const { message: updated } = await messageApi.editMessage(editingId, editBody.trim());
            setThread((prev) => prev.map((m) => (m.id === editingId ? { ...m, ...updated } : m)));
            setEditingId(null);
        }
        catch {
        }
        finally {
            setSavingEdit(false);
        }
    }
    function cancelEdit() {
        setEditingId(null);
        setEditBody('');
    }
    async function confirmDeleteForEveryone() {
        if (!deleteTarget)
            return;
        try {
            const { message: updated } = await messageApi.deleteMessage(deleteTarget.id);
            setThread((prev) => prev.map((m) => (m.id === deleteTarget.id ? { ...m, ...updated } : m)));
        }
        catch {
        }
        finally {
            setDeleteTarget(null);
        }
    }
    const hostIdsWithConvs = useMemo(() => new Set(conversations.map((c) => c.partnerId)), [conversations]);
    const locumApplicationSidebarRows = useMemo(() => {
        if (role !== 'locum')
            return [];
        const rows = myApplications.filter((a) => (a.status === 'SHORTLISTED' || a.status === 'APPLIED') &&
            !hostIdsWithConvs.has(a.jobPosting.hostProfile.userId));
        const rank = (s: MyApplication['status']) => s === 'SHORTLISTED' ? 0 : s === 'APPLIED' ? 1 : 2;
        return [...rows].sort((a, b) => {
            const d = rank(a.status) - rank(b.status);
            if (d !== 0)
                return d;
            return (new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
        });
    }, [role, myApplications, hostIdsWithConvs]);
    const filteredLocumAppRows = useMemo(() => {
        if (!debouncedSearchQuery)
            return locumApplicationSidebarRows;
        const q = debouncedSearchQuery.toLowerCase();
        return locumApplicationSidebarRows.filter((a) => {
            const jp = a.jobPosting;
            const hp = jp.hostProfile;
            const title = jp.title.toLowerCase();
            const practice = hp.practiceName.toLowerCase();
            const city = (hp.city ?? '').toLowerCase();
            const province = (hp.province ?? '').toLowerCase();
            const desc = (jp.description ?? '').toLowerCase();
            const cover = (a.coverNote ?? '').toLowerCase();
            return (title.includes(q) ||
                practice.includes(q) ||
                city.includes(q) ||
                province.includes(q) ||
                desc.includes(q) ||
                cover.includes(q));
        });
    }, [locumApplicationSidebarRows, debouncedSearchQuery]);
    useEffect(() => {
        if (authLoading || role !== 'locum')
            return;
        if (urlPartnerId)
            return;
        if (selectedPartnerId)
            return;
        if (loadingConvs)
            return;
        if (conversations.length > 0)
            return;
        if (locumApplicationSidebarRows.length === 0)
            return;
        const first = locumApplicationSidebarRows[0];
        setSelectedPartnerId(first.jobPosting.hostProfile.userId);
        setComposeJobPostingId(first.jobPosting.id);
    }, [
        authLoading,
        role,
        urlPartnerId,
        selectedPartnerId,
        loadingConvs,
        conversations.length,
        locumApplicationSidebarRows,
    ]);
    const specializations = getSpecializations(partner);
    const location = getLocation(partner);
    const partnerName = partner ? getDisplayName(partner as AnyUser) : '';
    const clinicName = partner ? getClinicName(partner as AnyUser) : '';
    const showHostThreadConfirm = role === 'host' &&
        partner?.locumProfile != null &&
        composeJobPostingId != null &&
        threadHostApplication != null &&
        threadHostApplication.status !== 'REJECTED' &&
        threadHostApplication.status !== 'WITHDRAWN';
    const hostThreadNeedsConfirm = Boolean(showHostThreadConfirm &&
        (threadHostApplication?.status === 'APPLIED' || threadHostApplication?.status === 'SHORTLISTED'));
    const hostThreadAlreadyConfirmed = Boolean(showHostThreadConfirm && threadHostApplication?.status === 'CONFIRMED');
    function onListPanelResizeMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = listPanelWidth;
        let latest = startW;
        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            latest = Math.min(MESSAGES_LIST_MAX, Math.max(MESSAGES_LIST_MIN, startW + dx));
            setListPanelWidth(latest);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            try {
                localStorage.setItem(MESSAGES_LIST_WIDTH_KEY, String(latest));
            }
            catch { /* ignore */ }
        };
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }
    return (<DashLayout navItems={navItems} activeHref={activeHref} topbarFirstName={undefined} topbarLastName={undefined}>
      <h1 style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#0f1523',
            marginBottom: 4,
        }}>
        Messaging
      </h1>
      <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 16 }}>
      </p>

      <div style={{
            display: 'flex',
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fff',
            height: 'calc(100vh - 200px)',
            minHeight: 500,
        }}>
        
        <div style={{
            width: listPanelWidth,
            flexShrink: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #E5E7EB',
        }}>
          
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid #F3F4F6',
            flexShrink: 0,
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            padding: '8px 12px',
        }}>
              <SearchIcon />
              <input type="text" placeholder="Search names, jobs, or any message…" value={search} onChange={(e) => setSearch(e.target.value)} style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 13,
            color: '#374151',
            fontFamily: 'inherit',
        }}/>
            </div>
          </div>

          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {loadingConvs ? (<div style={{
                padding: 24,
                textAlign: 'center',
                fontSize: 12,
                color: '#9CA3AF',
            }}>
                Loading…
              </div>) : (<>
                {conversations.map((conv) => {
                const isSelected = conv.partnerId === selectedPartnerId;
                const name = getDisplayName(conv.partner);
                const jobTitle = conv.lastMessage.jobPosting?.title ?? null;
                const isDeleted = !!conv.lastMessage.deletedAt;
                const lastPreviewFromPartner = conv.lastMessage.senderId === conv.partnerId;
                const listPreviewSenderLabel = lastPreviewFromPartner
                    ? name
                    : (myListPreviewName ?? getEmail()?.split('@')[0] ?? '');
                return (<div key={conv.partnerId} onClick={() => {
                        setSelectedPartnerId(conv.partnerId);
                        setComposeJobPostingId(conv.lastMessage.jobPosting?.id ?? null);
                    }} style={{
                        padding: '14px',
                        borderBottom: '1px solid #F3F4F6',
                        cursor: 'pointer',
                        background: isSelected ? '#EEF0FB' : '#fff',
                        borderLeft: isSelected
                            ? '3px solid #3B4FD8'
                            : '3px solid transparent',
                        transition: 'background 0.1s',
                    }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                    }}>
                      <Avatar user={conv.partner} variant={partnerAvatarVariant}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 2,
                    }}>
                          <span style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#0f1523',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: Math.max(80, listPanelWidth - 120),
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                    }}>
                            {!lastPreviewFromPartner ? (
                              <NameWithVerifiedShield
                                verified={myCpsnsVerified}
                                shieldSize={14}
                                gap={4}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {listPreviewSenderLabel}
                                </span>
                              </NameWithVerifiedShield>
                            ) : (
                              name
                            )}
                          </span>
                          <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexShrink: 0,
                    }}>
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                              {fmtConvDate(conv.lastMessage.sentAt)}
                            </span>
                            {conv.unreadCount > 0 && (<span style={{
                            background: '#3B4FD8',
                            color: '#fff',
                            borderRadius: '50%',
                            width: 18,
                            height: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 700,
                            flexShrink: 0,
                        }}>
                                {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                              </span>)}
                          </div>
                        </div>
                        <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        minWidth: 0,
                        fontSize: 12,
                        fontStyle: isDeleted ? 'italic' : 'normal',
                        marginBottom: jobTitle ? 6 : 0,
                    }}>
                          {isDeleted ? (<span style={{ color: '#9CA3AF' }}>
                              Message deleted
                            </span>) : listPreviewSenderLabel ? (<>
                              <span style={{
                            flexShrink: 0,
                            fontWeight: 600,
                            color: '#374151',
                        }}>
                                {listPreviewSenderLabel}:
                              </span>
                              <span style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: '#6B7280',
                            marginLeft: 4,
                        }}>
                                {conv.lastMessage.body}
                              </span>
                            </>) : (<span style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: '#6B7280',
                        }}>
                              {conv.lastMessage.body}
                            </span>)}
                        </div>
                        {jobTitle && (<div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#F3F4F6',
                            border: '1px solid #E5E7EB',
                            borderRadius: 6,
                            padding: '3px 8px',
                            maxWidth: '100%',
                            overflow: 'hidden',
                        }}>
                            <Image src="/brief-case.svg" alt="" width={18} height={18} style={{
                            flexShrink: 0,
                            display: 'block',
                        }}/>
                            <span style={{
                            fontSize: 11,
                            color: '#374151',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                        }}>
                              {jobTitle}
                            </span>
                          </div>)}
                      </div>
                    </div>
                  </div>);
            })}
                {role === 'locum' &&
                filteredLocumAppRows.map((app) => {
                    const hostId = app.jobPosting.hostProfile.userId;
                    const isSelected = selectedPartnerId === hostId;
                    const practice = app.jobPosting.hostProfile.practiceName;
                    const jobTitle = app.jobPosting.title;
                    const isShortlisted = app.status === 'SHORTLISTED';
                    return (<div key={app.id} onClick={() => {
                            setSelectedPartnerId(hostId);
                            setComposeJobPostingId(app.jobPosting.id);
                        }} style={{
                            padding: '14px',
                            borderBottom: '1px solid #F3F4F6',
                            cursor: 'pointer',
                            background: isSelected ? '#EEF0FB' : '#fff',
                            borderLeft: isSelected
                                ? '3px solid #3B4FD8'
                                : '3px solid transparent',
                            transition: 'background 0.1s',
                        }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                        }}>
                          <div style={{
                            width: AVATAR_GLYPH_PX,
                            height: AVATAR_GLYPH_PX,
                            borderRadius: '50%',
                            background: '#309BB7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            overflow: 'hidden',
                            padding: 0,
                            boxSizing: 'border-box',
                        }}>
                            <AvatarGlyph variant="clinic"/>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 2,
                            gap: 8,
                        }}>
                              <span style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#0f1523',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                        }}>
                                {practice}
                              </span>
                              <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: isShortlisted ? '#059669' : '#1D4ED8',
                            background: isShortlisted ? '#ECFDF5' : '#EFF6FF',
                            padding: '2px 6px',
                            borderRadius: 4,
                            flexShrink: 0,
                        }}>
                                {isShortlisted ? 'Shortlisted' : 'Applied'}
                              </span>
                            </div>
                            <div style={{
                            fontSize: 12,
                            color: '#6B7280',
                            marginBottom: 6,
                        }}>
                              Tap to message about this job
                            </div>
                            <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#F3F4F6',
                            border: '1px solid #E5E7EB',
                            borderRadius: 6,
                            padding: '3px 8px',
                            maxWidth: '100%',
                            overflow: 'hidden',
                        }}>
                              <Image src="/brief-case.svg" alt="" width={24} height={24} style={{
                            flexShrink: 0,
                            display: 'block',
                        }}/>
                              <span style={{
                            fontSize: 11,
                            color: '#374151',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                        }}>
                                {jobTitle}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>);
                })}
                {conversations.length === 0 &&
                filteredLocumAppRows.length === 0 && (<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
                      {urlPartnerId ? (<>
                          <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: 6,
                    }}>
                            Start the conversation
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Type a message below to reach out
                          </div>
                        </>) : debouncedSearchQuery ? (<>
                          <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: 6,
                    }}>
                            No matching conversations
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Try a name, practice, job title, or a word from any message
                          </div>
                        </>) : role === 'locum' &&
                    locumApplicationSidebarRows.length === 0 &&
                    myApplications.length > 0 ? (<>
                          <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: 6,
                    }}>
                            No active applications to show
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Confirmed or closed applications are not listed here
                          </div>
                        </>) : role === 'locum' ? (<>
                          <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: 6,
                    }}>
                            No messages yet
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            
                          </div>
                        </>) : (<>
                          <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: 6,
                    }}>
                            No messages yet
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Messages will appear here
                          </div>
                        </>)}
                    </div>)}
              </>)}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize conversation list"
            title="Drag to resize"
            onMouseDown={onListPanelResizeMouseDown}
            style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 6,
                zIndex: 3,
                cursor: 'ew-resize',
                background: 'transparent',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 79, 216, 0.12)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
            }}
          />
        </div>

        
        {!selectedPartnerId ? (<div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9CA3AF',
                gap: 12,
            }}>
            <div style={{ fontSize: 13 }}>
              Select a conversation to start messaging
            </div>
          </div>) : (<div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 0,
                position: 'relative',
            }}>
            
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #E5E7EB',
                flexShrink: 0,
            }}>
              {loadingThread ? (<div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</div>) : (<div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                    width: '100%',
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    flex: '1',
                    minWidth: 0,
                    maxWidth: 705,
                    fontFamily: 'Inter, sans-serif',
                }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    
                    {clinicName ? (<div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        background: 'rgba(209, 213, 219, 0.2)',
                        borderRadius: 40,
                        width: 'fit-content',
                    }}>
                        <span style={{
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: '142%',
                        color: 'rgba(11, 15, 31, 0.7)',
                        textTransform: 'capitalize',
                    }}>
                          {clinicName}
                        </span>
                      </div>) : null}

                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                    fontSize: 17,
                    fontWeight: 600,
                    lineHeight: '100%',
                    color: '#151414',
                }}>
                        {partnerName}
                      </span>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                        style={{ flexShrink: 0, verticalAlign: 'middle' }}
                      >
                        <path
                          d="M12 3.25 19 5.9v5.25c0 4.45-2.82 7.95-7 9.6-4.18-1.65-7-5.15-7-9.6V5.9l7-2.65Z"
                          stroke="#1B31D2"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8.6 12.1 10.9 14.4 15.7 9.6"
                          stroke="#1B31D2"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>

                    
                    {location ? (<span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        width: 'fit-content',
                        padding: '4px 10px',
                        borderRadius: 40,
                        background: 'rgba(171, 230, 234, 0.35)',
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: '142%',
                        color: '#309BB7',
                        textTransform: 'capitalize',
                    }}>
                        {location}
                      </span>) : null}
                  </div>

                  
                  {specializations.length > 0 ? (<div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                    }}>
                      {specializations.map((s) => (<div key={s} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '5px 10px',
                            background: 'rgba(58, 101, 219, 0.07)',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 500,
                            lineHeight: '142%',
                            color: 'rgba(58, 101, 219, 0.8)',
                            textTransform: 'capitalize',
                            whiteSpace: 'nowrap',
                        }}>
                          {s}
                        </div>))}
                    </div>) : null}
                  </div>
                  {(hostThreadNeedsConfirm || hostThreadAlreadyConfirmed) ? (<div style={{ flexShrink: 0, paddingTop: 2 }}>
                      {hostThreadNeedsConfirm ? (<button type="button" onClick={() => void handleConfirmLocumFromThread()} disabled={confirmLocumBusy} style={{
                        padding: '8px 18px',
                        borderRadius: 8,
                        border: 'none',
                        cursor: confirmLocumBusy ? 'default' : 'pointer',
                        background: confirmLocumBusy ? '#94D3AF' : 'linear-gradient(180deg,#22C55E 0%,#16A34A 100%)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        whiteSpace: 'nowrap',
                        boxShadow: confirmLocumBusy ? 'none' : '0 1px 2px rgba(22,163,74,0.35)',
                    }}>
                          {confirmLocumBusy ? 'Confirming…' : 'Confirm'}
                        </button>) : (<span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '8px 16px',
                        borderRadius: 8,
                        background: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        color: '#047857',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                    }}>
                          Confirmed
                        </span>)}
                    </div>) : null}
                </div>)}
            </div>

            
            <div ref={threadScrollRef} onScroll={onThreadScroll} style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
            }}>
              {loadingThread ? (<div style={{
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#9CA3AF',
                    paddingTop: 40,
                }}>
                  Loading messages…
                </div>) : thread.length === 0 ? (<div style={{
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#9CA3AF',
                    paddingTop: 40,
                }}>
                  No messages yet. Say hello!
                </div>) : (thread.map((msg, idx) => {
                const isMine = msg.senderId !== selectedPartnerId;
                const isDeleted = !!msg.deletedAt;
                const isEdited = !!msg.editedAt && !isDeleted;
                const isEditing = editingId === msg.id;
                const hasMenu = menuOpenId === msg.id;
                const showDate = idx === 0 ||
                    fmtDate(msg.sentAt) !== fmtDate(thread[idx - 1].sentAt);
                return (<div key={msg.id}>
                      {showDate && (<div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            margin: '16px 0 12px',
                        }}>
                          <div style={{
                            flex: 1,
                            height: 1,
                            background: '#F3F4F6',
                        }}/>
                          <span style={{
                            fontSize: 11,
                            color: '#9CA3AF',
                            whiteSpace: 'nowrap',
                        }}>
                            {fmtDate(msg.sentAt)}
                          </span>
                          <div style={{
                            flex: 1,
                            height: 1,
                            background: '#F3F4F6',
                        }}/>
                        </div>)}

                      <div style={{
                        marginBottom: 16,
                        position: 'relative',
                    }}>
                        <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 4,
                    }}>
                          <Avatar user={msg.sender as AnyUser} variant={isMine ? myAvatarVariant : partnerAvatarVariant}/>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 0,
                        gap: 8,
                    }}>
                            <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                    }}>
                              {isMine ? (
                                <NameWithVerifiedShield
                                  verified={myCpsnsVerified}
                                  shieldSize={16}
                                  gap={6}
                                  style={{ minWidth: 0 }}
                                >
                                  <span style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: '#0f1523',
                                  }}>
                                    {myListPreviewName ?? getDisplayName(msg.sender as AnyUser)}
                                  </span>
                                </NameWithVerifiedShield>
                              ) : (
                                <span style={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: '#0f1523',
                                }}>
                                  {getDisplayName(msg.sender as AnyUser)}
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                                {fmtTime(msg.sentAt)}
                              </span>
                            </div>
                            <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexShrink: 0,
                    }}>
                              <span style={{
                        fontSize: 11,
                        color: '#9CA3AF',
                    }}>
                                {fmtDate(msg.sentAt)}
                              </span>
                              {isMine && !isDeleted && !isEditing && (<div style={{
                            position: 'relative',
                            flexShrink: 0,
                        }} ref={hasMenu ? menuRef : undefined}>
                                  <button type="button" aria-label="Message options" onClick={() => setMenuOpenId(hasMenu ? null : msg.id)} style={{
                            background: '#F9FAFB',
                            border: '1px solid #E5E7EB',
                            borderRadius: 6,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 16,
                            color: '#374151',
                            lineHeight: 1,
                            minWidth: 32,
                        }} title="Edit or delete message">
                                    ⋮
                                  </button>
                                  {hasMenu && (<div style={{
                                position: 'absolute',
                                right: 0,
                                top: '100%',
                                marginTop: 4,
                                background: '#fff',
                                border: '1px solid #E5E7EB',
                                borderRadius: 8,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                zIndex: 100,
                                minWidth: 130,
                                overflow: 'hidden',
                            }}>
                                      <button type="button" onClick={() => startEdit(msg)} style={{
                                display: 'block',
                                width: '100%',
                                padding: '10px 14px',
                                background: 'none',
                                border: 'none',
                                textAlign: 'left',
                                fontSize: 13,
                                color: '#374151',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }} onMouseEnter={(e) => (e.currentTarget.style.background =
                                '#F9FAFB')} onMouseLeave={(e) => (e.currentTarget.style.background =
                                'none')}>
                                        Edit
                                      </button>
                                      <div style={{
                                height: 1,
                                background: '#F3F4F6',
                            }}/>
                                      <button type="button" onClick={() => {
                                setDeleteTarget(msg);
                                setMenuOpenId(null);
                            }} style={{
                                display: 'block',
                                width: '100%',
                                padding: '10px 14px',
                                background: 'none',
                                border: 'none',
                                textAlign: 'left',
                                fontSize: 13,
                                color: '#DC2626',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }} onMouseEnter={(e) => (e.currentTarget.style.background =
                                '#FEF2F2')} onMouseLeave={(e) => (e.currentTarget.style.background =
                                'none')}>
                                        Delete
                                      </button>
                                    </div>)}
                                </div>)}
                            </div>
                          </div>
                          </div>
                        </div>

                        <div style={{
                        paddingLeft: AVATAR_GLYPH_PX + 10,
                    }}>
                          {isDeleted ? (<span style={{
                            fontSize: 13,
                            color: '#9CA3AF',
                            fontStyle: 'italic',
                        }}>
                              This message was deleted
                            </span>) : isEditing ? (<div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}>
                              <textarea autoFocus value={editBody} onChange={(e) => setEditBody(e.target.value)} onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void saveEdit();
                            }
                            if (e.key === 'Escape')
                                cancelEdit();
                        }} rows={2} style={{
                            width: '100%',
                            border: '1px solid #3B4FD8',
                            borderRadius: 8,
                            padding: '8px 10px',
                            fontSize: 14,
                            fontFamily: 'inherit',
                            color: '#374151',
                            resize: 'none',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}/>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => void saveEdit()} disabled={savingEdit || !editBody.trim()} style={{
                            padding: '5px 14px',
                            background: '#3B4FD8',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}>
                                  {savingEdit ? 'Saving…' : 'Save'}
                                </button>
                                <button onClick={cancelEdit} style={{
                            padding: '5px 14px',
                            background: '#F3F4F6',
                            color: '#374151',
                            border: '1px solid #E5E7EB',
                            borderRadius: 6,
                            fontSize: 13,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}>
                                  Cancel
                                </button>
                              </div>
                            </div>) : (<div style={{
                            fontSize: 14,
                            color: '#374151',
                            lineHeight: 1.6,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                        }}>
                              {msg.body}
                              {msg.attachments && msg.attachments.length > 0 && (<div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                                  {msg.attachments.map((a) => (<a key={a.id} href={a.signedUrl || '#'} target={a.signedUrl ? '_blank' : undefined} rel={a.signedUrl ? 'noopener noreferrer' : undefined} style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 10px',
                                    borderRadius: 10,
                                    border: '1px solid #E5E7EB',
                                    background: '#fff',
                                    color: '#111827',
                                    textDecoration: 'none',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                }} title={a.storagePath}>
                                      <span style={{ fontSize: 12, color: '#6B7280' }}>
                                        {isImageMime(a.mimeType) ? 'Image' : 'File'}
                                      </span>
                                      <span style={{
                                    fontSize: 12,
                                    color: '#374151',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                }}>
                                        {a.fileName}
                                      </span>
                                    </a>))}
                                </div>)}
                              {isEdited && (<span style={{
                                fontSize: 10,
                                color: '#9CA3AF',
                                marginLeft: 6,
                                fontStyle: 'italic',
                            }}>
                                  edited
                                </span>)}
                            </div>)}
                        </div>
                      </div>
                    </div>);
            }))}
            </div>

            
            <div style={{
                borderTop: '1px solid #E5E7EB',
                padding: '12px 16px',
                flexShrink: 0,
            }}>
              {sendError && (<div role="alert" style={{
                    marginBottom: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    fontSize: 12,
                    color: '#991B1B',
                }}>
                  {sendError}
                </div>)}
              {pendingFiles.length > 0 && (<div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 10,
                }}>
                  {pendingFiles.map((f, idx) => (<div key={`${f.name}-${f.size}-${idx}`} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        borderRadius: 10,
                        border: '1px solid #E5E7EB',
                        background: '#fff',
                        maxWidth: '100%',
                    }}>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>
                        {isImageMime(f.type) ? 'Image' : 'File'}
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: '#374151',
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }} title={f.name}>
                        {f.name}
                      </span>
                      <button type="button" onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))} style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#9CA3AF',
                        fontSize: 14,
                        lineHeight: 1,
                        padding: 0,
                    }} aria-label="Remove attachment" title="Remove">
                        ×
                      </button>
                    </div>))}
                </div>)}
              <textarea ref={inputRef} value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message… (Enter for new line, Ctrl+Enter or ⌘+Enter to send)" rows={2} style={{
                width: '100%',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
                fontFamily: 'inherit',
                color: '#374151',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                background: '#FAFAFA',
                marginBottom: 10,
            }} onFocus={(e) => (e.currentTarget.style.borderColor = '#3B4FD8')} onBlur={(e) => (e.currentTarget.style.borderColor = '#E5E7EB')}/>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" title="Attach PDF or Word documents" aria-label="Attach PDF or Word documents" onClick={() => filePickRef.current?.click()} style={{
                background: 'none',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                cursor: 'pointer',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
            }}>
                    <AttachFileIcon />
                  </button>
                  <input ref={filePickRef} type="file" multiple accept={DOCUMENT_ATTACH_ACCEPT} style={{ display: 'none' }} onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length)
                    appendPendingAttachments(files);
                e.target.value = '';
            }}/>
                  <button type="button" title="Add images" aria-label="Add images" onClick={() => imagePickRef.current?.click()} style={{
                background: 'none',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                cursor: 'pointer',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
            }}>
                    <AttachImagesIcon />
                  </button>
                  <input ref={imagePickRef} type="file" multiple accept={IMAGE_ATTACH_ACCEPT} style={{ display: 'none' }} onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length)
                    appendPendingAttachments(files);
                e.target.value = '';
            }}/>
                  <div style={{position:'relative'}}>
                    <button type='button' title='Add emoji' onClick={()=>setShowEmojiPicker((v)=>!v)} style={{background:'none',border:'1px solid #E5E7EB',borderRadius:8,cursor:'pointer',padding:'4px 8px',display:'flex',alignItems:'center'}}>
                      <span style={{fontSize:18}}>{String.fromCodePoint(0x1F60A)}</span>
                    </button>
                    {showEmojiPicker && <div style={{position:'absolute',bottom:44,right:0,zIndex:100}}><EmojiPicker onEmojiClick={(ed)=>{setMessageText((p)=>p+ed.emoji);setShowEmojiPicker(false);}}/></div>}
                  </div>
                </div>
                <button type="button" onClick={() => void handleSend()} disabled={sending || (!messageText.trim() && pendingFiles.length === 0)} style={{
                padding: '9px 28px',
                background: sending ||
                    (!messageText.trim() && pendingFiles.length === 0)
                    ? '#D1D5DB'
                    : 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: sending ||
                    (!messageText.trim() && pendingFiles.length === 0)
                    ? 'default'
                    : 'pointer',
                fontFamily: 'inherit',
            }}>
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>)}
      </div>

      {deleteTarget && (<DeleteModal onDeleteForEveryone={() => void confirmDeleteForEveryone()} onDeleteForMe={() => {
        if (!deleteTarget) return;
        const key = 'deleted-for-me';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([...existing, deleteTarget.id]));
        setThread((prev) => prev.filter((m) => m.id !== deleteTarget.id));
        setDeleteTarget(null);
      }} onCancel={() => setDeleteTarget(null)}/>)}
    </DashLayout>);
}
export default function MessagesPage(props: MessagesPageProps) {
    return (<Suspense fallback={null}>
      <MessagesPageInner {...props}/>
    </Suspense>);
}
