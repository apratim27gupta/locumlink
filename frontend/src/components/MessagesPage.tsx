'use client';
import { useEffect, useState, useRef, useCallback, useMemo, Suspense, } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { hostApi, locumApi, messageApi, uploadFile, type Conversation, type MyApplication, type ThreadMessage, type ThreadPartner, } from '@/lib/api';
import { getEmail, getToken } from '@/lib/auth';
import { beforeClientNavigation } from '@/lib/topLoader';
import { useAuth } from '@/providers/AuthProvider';
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
];
const QUICK_EMOJIS = [
    '👍',
    '❤️',
    '😊',
    '👋',
    '🙏',
    '✅',
    '🎉',
    '😂',
    '💬',
    '👏',
] as const;
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
function VerifiedIcon() {
    return (<Image src="/clinic-verified.png" alt="Verified" width={16} height={16} style={{ flexShrink: 0, objectFit: 'contain', opacity: 1 }}/>);
}
function EmojiIcon() {
    return (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="#6B7280" strokeWidth="1.4"/>
      <circle cx="7.5" cy="8.5" r="1" fill="#6B7280"/>
      <circle cx="12.5" cy="8.5" r="1" fill="#6B7280"/>
      <path d="M6.5 12.5c.8 1.5 2.1 2 3.5 2s2.7-.5 3.5-2" stroke="#6B7280" strokeWidth="1.4" strokeLinecap="round"/>
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
            marginBottom: 8,
        }}>
          Delete message?
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
          Choose how to delete this message.
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
            <div style={{
            fontSize: 11,
            fontWeight: 400,
            opacity: 0.85,
            marginTop: 2,
        }}>
              Removed from both sides — shows &quot;message deleted&quot;
            </div>
          </button>
          <button onClick={onDeleteForMe} style={{
            padding: '10px 16px',
            background: '#F3F4F6',
            color: '#374151',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
        }}>
            Delete for me
            <div style={{
            fontSize: 11,
            fontWeight: 400,
            color: '#9CA3AF',
            marginTop: 2,
        }}>
              Only removed from your view
            </div>
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
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [loadingThread, setLoadingThread] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBody, setEditBody] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ThreadMessage | null>(null);
    const [myApplications, setMyApplications] = useState<MyApplication[]>([]);
    const [myListPreviewName, setMyListPreviewName] = useState<string | null>(null);
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
                    setMyListPreviewName(`Dr ${profile.firstName} ${profile.lastName ?? ''}`.trim());
                }
            }
            catch {
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [authLoading, role, userId]);
    const [composeJobPostingId, setComposeJobPostingId] = useState<string | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const filePickRef = useRef<HTMLInputElement>(null);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
        if (!emojiPickerOpen)
            return;
        function onDocMouseDown(e: MouseEvent) {
            const el = emojiPickerRef.current;
            if (el && !el.contains(e.target as Node))
                setEmojiPickerOpen(false);
        }
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [emojiPickerOpen]);
    const loadConversations = useCallback(async () => {
        try {
            const { conversations: data } = await messageApi.getConversations();
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
    }, [urlPartnerId]);
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
    }, [authLoading, router, loadConversations]);
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
            setThread(messages);
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
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [thread]);
    useEffect(() => {
        if (!selectedPartnerId || authLoading || !getToken())
            return;
        pollRef.current = setInterval(async () => {
            if (!getToken())
                return;
            try {
                const [{ messages }, { conversations: convs }] = await Promise.all([
                    messageApi.getThread(selectedPartnerId, { skipTopLoader: true }),
                    messageApi.getConversations({ skipTopLoader: true }),
                ]);
                setThread(messages);
                setConversations(convs.map((c) => c.partnerId === selectedPartnerId ? { ...c, unreadCount: 0 } : c));
            }
            catch {
            }
        }, 5000);
        return () => {
            if (pollRef.current)
                clearInterval(pollRef.current);
        };
    }, [selectedPartnerId, authLoading]);
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
            setThread((prev) => [...prev, message as ThreadMessage]);
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
    function insertEmoji(emoji: string) {
        const ta = inputRef.current;
        if (ta) {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            setMessageText((prev) => prev.slice(0, start) + emoji + prev.slice(end));
            setEmojiPickerOpen(false);
            requestAnimationFrame(() => {
                ta.focus();
                const pos = start + [...emoji].length;
                ta.setSelectionRange(pos, pos);
            });
        }
        else {
            setMessageText((prev) => prev + emoji);
            setEmojiPickerOpen(false);
        }
    }
    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
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
    function confirmDeleteForMe() {
        if (!deleteTarget)
            return;
        setThread((prev) => prev.filter((m) => m.id !== deleteTarget.id));
        setDeleteTarget(null);
    }
    const filteredConvs = useMemo(() => {
        if (!search.trim())
            return conversations;
        const q = search.toLowerCase();
        return conversations.filter((c) => {
            const display = getDisplayName(c.partner).toLowerCase();
            const practice = (c.partner.hostProfile?.practiceName ?? '').toLowerCase();
            const jobTitle = (c.lastMessage.jobPosting?.title ?? '').toLowerCase();
            const body = (c.lastMessage.body ?? '').toLowerCase();
            return (display.includes(q) ||
                practice.includes(q) ||
                jobTitle.includes(q) ||
                body.includes(q));
        });
    }, [conversations, search]);
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
        if (!search.trim())
            return locumApplicationSidebarRows;
        const q = search.toLowerCase();
        return locumApplicationSidebarRows.filter((a) => a.jobPosting.title.toLowerCase().includes(q) ||
            a.jobPosting.hostProfile.practiceName.toLowerCase().includes(q));
    }, [locumApplicationSidebarRows, search]);
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
            width: 300,
            flexShrink: 0,
            borderRight: '1px solid #E5E7EB',
            display: 'flex',
            flexDirection: 'column',
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
              <input type="text" placeholder="Search message" value={search} onChange={(e) => setSearch(e.target.value)} style={{
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

          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingConvs ? (<div style={{
                padding: 24,
                textAlign: 'center',
                fontSize: 12,
                color: '#9CA3AF',
            }}>
                Loading…
              </div>) : (<>
                {filteredConvs.map((conv) => {
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
                        maxWidth: 140,
                    }}>
                            {name}
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
                            <Image src="/brief-case.png" alt="" width={18} height={18} style={{
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
                              <Image src="/brief-case.png" alt="" width={24} height={24} style={{
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
                {filteredConvs.length === 0 &&
                filteredLocumAppRows.length === 0 && (<div style={{ padding: '48px 24px', textAlign: 'center' }}>
                      {urlPartnerId ? (<>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            👋
                          </div>
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
                        </>) : role === 'locum' && search.trim() ? (<>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            🔍
                          </div>
                          <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: 6,
                    }}>
                            No matching chats or applications
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Try a different search term
                          </div>
                        </>) : role === 'locum' &&
                    locumApplicationSidebarRows.length === 0 &&
                    myApplications.length > 0 ? (<>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            💬
                          </div>
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
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            💬
                          </div>
                          <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: 6,
                    }}>
                            No applications yet
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Apply to a job from Browse to message clinics here
                          </div>
                        </>) : (<>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            💬
                          </div>
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
            <div style={{ fontSize: 36 }}>✉️</div>
            <div style={{ fontSize: 13 }}>
              Select a conversation to start messaging
            </div>
          </div>) : (<div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                position: 'relative',
            }}>
            
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E5E7EB',
                flexShrink: 0,
            }}>
              {loadingThread ? (<div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</div>) : (<div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    width: '100%',
                    maxWidth: 705,
                    fontFamily: 'Inter, sans-serif',
                }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    
                    {clinicName ? (<div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '8px 12px',
                        background: 'rgba(209, 213, 219, 0.2)',
                        borderRadius: 40,
                        width: 'fit-content',
                    }}>
                        <span style={{
                        fontSize: 16,
                        fontWeight: 600,
                        lineHeight: '150%',
                        color: 'rgba(11, 15, 31, 0.7)',
                        textTransform: 'capitalize',
                    }}>
                          {clinicName}
                        </span>
                      </div>) : null}

                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                    fontSize: 20,
                    fontWeight: 600,
                    lineHeight: '100%',
                    color: '#151414',
                }}>
                        {partnerName}
                      </span>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, color: '#0F2A7A' }} aria-hidden>
                        <path d="M10 2l2.09 4.26L17 7.27l-3.5 3.41.83 4.82L10 13.27l-4.33 2.23.83-4.82L3 7.27l4.91-.01L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M7.5 10l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>

                    
                    {location ? (<span style={{
                        fontSize: 18,
                        fontWeight: 400,
                        lineHeight: '150%',
                        color: '#6B7280',
                        textTransform: 'capitalize',
                    }}>
                        {location}
                      </span>) : null}
                  </div>

                  
                  {specializations.length > 0 ? (<div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 10,
                    }}>
                      {specializations.map((s) => (<div key={s} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px 12px',
                            background: 'rgba(58, 101, 219, 0.07)',
                            borderRadius: 8,
                            fontSize: 16,
                            fontWeight: 500,
                            lineHeight: '150%',
                            color: 'rgba(58, 101, 219, 0.8)',
                            textTransform: 'capitalize',
                            whiteSpace: 'nowrap',
                        }}>
                          {s}
                        </div>))}
                    </div>) : null}
                </div>)}
            </div>

            
            <div style={{
                flex: 1,
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
                  No messages yet. Say hello! 👋
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
                              <span style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#0f1523',
                    }}>
                                {getDisplayName(msg.sender as AnyUser)}
                              </span>
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
                                        {isImageMime(a.mimeType) ? '🖼️' : '📄'}
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
              <div ref={bottomRef}/>
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
                        {isImageMime(f.type) ? '🖼️' : '📄'}
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
              <textarea ref={inputRef} value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message… (Enter to send, Shift+Enter for new line)" rows={2} style={{
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
                <div ref={emojiPickerRef} style={{ position: 'relative', display: 'flex', gap: 12 }}>
                  <button type="button" title="Attach files" onClick={() => filePickRef.current?.click()} style={{
                background: 'none',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                cursor: 'pointer',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
            }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>📎</span>
                  </button>
                  <input ref={filePickRef} type="file" multiple accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: 'none' }} onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) {
                    setPendingFiles((prev) => [...prev, ...files]);
                }
                e.target.value = '';
            }}/>
                  <button type="button" title="Add emoji" aria-expanded={emojiPickerOpen} aria-haspopup="dialog" onClick={() => setEmojiPickerOpen((o) => !o)} style={{
                background: emojiPickerOpen ? '#EEF0FB' : 'none',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                cursor: 'pointer',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
            }}>
                    <EmojiIcon />
                  </button>
                  {emojiPickerOpen && (<div role="dialog" aria-label="Quick emoji" style={{
                    position: 'absolute',
                    left: 0,
                    bottom: '100%',
                    marginBottom: 8,
                    padding: 10,
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: 10,
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
                    zIndex: 200,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 6,
                    minWidth: 200,
                }}>
                      {QUICK_EMOJIS.map((emoji) => (<button key={emoji} type="button" onClick={() => insertEmoji(emoji)} style={{
                        fontSize: 22,
                        lineHeight: 1,
                        padding: '6px 4px',
                        border: 'none',
                        borderRadius: 8,
                        background: '#F9FAFB',
                        cursor: 'pointer',
                    }}>
                          {emoji}
                        </button>))}
                    </div>)}
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

      {deleteTarget && (<DeleteModal onDeleteForEveryone={() => void confirmDeleteForEveryone()} onDeleteForMe={confirmDeleteForMe} onCancel={() => setDeleteTarget(null)}/>)}
    </DashLayout>);
}
export default function MessagesPage(props: MessagesPageProps) {
    return (<Suspense fallback={null}>
      <MessagesPageInner {...props}/>
    </Suspense>);
}
