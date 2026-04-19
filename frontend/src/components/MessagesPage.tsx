'use client';

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import {
  hostApi,
  locumApi,
  messageApi,
  type Conversation,
  type MyApplication,
  type ThreadMessage,
  type ThreadPartner,
} from '@/lib/api';
import { getEmail, getToken } from '@/lib/auth';
import { useAuth } from '@/providers/AuthProvider';

// ── Nav ───────────────────────────────────────────────────────────────────────

const HOST_NAV = [
  {
    label: 'My Postings',
    href: '/host/dashboard',
    icon: <NavIcon name="postings" />,
  },
  { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile" /> },
  {
    label: 'Messages',
    href: '/host/messages',
    icon: <NavIcon name="messages" />,
  },
  {
    label: 'Resources',
    href: '/host/resources',
    icon: <NavIcon name="resources" />,
  },
];
const LOCUM_NAV = [
  {
    label: 'Browse Opportunities',
    href: '/locum/browse',
    icon: <NavIcon name="browse" />,
  },
  {
    label: 'My Applications',
    href: '/locum/dashboard',
    icon: <NavIcon name="postings" />,
  },
  {
    label: 'Profile',
    href: '/locum/profile',
    icon: <NavIcon name="profile" />,
  },
  {
    label: 'Messages',
    href: '/locum/messages',
    icon: <NavIcon name="messages" />,
  },
  {
    label: 'Resources',
    href: '/locum/resources',
    icon: <NavIcon name="resources" />,
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

// ── Types ─────────────────────────────────────────────────────────────────────

type AnyUser = {
  id: string;
  email: string;
  role: string;
  locumProfile: { firstName: string | null; lastName: string | null } | null;
  hostProfile: {
    contactFirstName: string | null;
    contactLastName: string | null;
    practiceName: string;
  } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDisplayName(user: AnyUser): string {
  if (user.locumProfile?.firstName)
    return `Dr ${user.locumProfile.firstName} ${user.locumProfile.lastName ?? ''}`.trim();
  if (user.hostProfile?.contactFirstName)
    return `Dr ${user.hostProfile.contactFirstName} ${user.hostProfile.contactLastName ?? ''}`.trim();
  if (user.hostProfile?.practiceName) return user.hostProfile.practiceName;
  return user.email.split('@')[0];
}

function getClinicName(user: AnyUser): string {
  return user.hostProfile?.practiceName ?? '';
}

function getSpecializations(partner: ThreadPartner | null): string[] {
  if (!partner) return [];
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
  if (!partner) return '';
  const city = partner.locumProfile?.city ?? partner.hostProfile?.city ?? '';
  const prov =
    partner.locumProfile?.province ?? partner.hostProfile?.province ?? '';
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
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtConvDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0)
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Avatar glyphs — /public/avatar-locum.png, avatar-clinic.png ─────────────

/** Default avatar asset size — wrapper matches this */
const AVATAR_GLYPH_PX = 16;

function AvatarGlyph({
  variant,
  size = AVATAR_GLYPH_PX,
}: {
  variant: 'locum' | 'clinic';
  size?: number;
}) {
  const src =
    variant === 'locum' ? '/avatar-locum.png' : '/avatar-clinic.png';
  return (
    <img
      src={src}
      alt={variant === 'locum' ? 'Locum' : 'Clinic'}
      width={size}
      height={size}
      draggable={false}
      style={{
        display: 'block',
        width: size,
        height: size,
        objectFit: 'contain',
        opacity: 1,
      }}
    />
  );
}

/** Host/clinic vs locum — must not use `!== null` alone (undefined would wrongly count as “has locum”). */
function isLocumUser(user: AnyUser): boolean {
  const r = String(user.role ?? '').toUpperCase();
  if (r === 'HOST') return false;
  if (r === 'LOCUM') return true;
  if (user.hostProfile != null) return false;
  if (user.locumProfile != null) return true;
  return false;
}

// ── Tiny SVG icons ────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="#9CA3AF" strokeWidth="1.4" />
      <path
        d="M10 10l3.5 3.5"
        stroke="#9CA3AF"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function VerifiedIcon() {
  return (
    <Image
      src="/clinic-verified.png"
      alt="Verified"
      width={16}
      height={16}
      style={{ flexShrink: 0, objectFit: 'contain', opacity: 1 }}
    />
  );
}
function EmojiIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="#6B7280" strokeWidth="1.4" />
      <circle cx="7.5" cy="8.5" r="1" fill="#6B7280" />
      <circle cx="12.5" cy="8.5" r="1" fill="#6B7280" />
      <path
        d="M6.5 12.5c.8 1.5 2.1 2 3.5 2s2.7-.5 3.5-2"
        stroke="#6B7280"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  user,
  size = AVATAR_GLYPH_PX,
  variant,
}: {
  user: AnyUser;
  /** Outer circle and image — default matches glyph pixels */
  size?: number;
  /** When set (from Messages page role), overrides inferred role from API user object */
  variant?: 'locum' | 'clinic';
}) {
  const locum =
    variant != null ? variant === 'locum' : isLocumUser(user);
  return (
    <div
      style={{
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
      }}
    >
      <AvatarGlyph variant={locum ? 'locum' : 'clinic'} size={size} />
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({
  onDeleteForEveryone,
  onDeleteForMe,
  onCancel,
}: {
  onDeleteForEveryone: () => void;
  onDeleteForMe: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 500,
        }}
      />
      <div
        style={{
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
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#0f1523',
            marginBottom: 8,
          }}
        >
          Delete message?
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
          Choose how to delete this message.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onDeleteForEveryone}
            style={{
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
            }}
          >
            Delete for everyone
            <div
              style={{
                fontSize: 11,
                fontWeight: 400,
                opacity: 0.85,
                marginTop: 2,
              }}
            >
              Removed from both sides — shows &quot;message deleted&quot;
            </div>
          </button>
          <button
            onClick={onDeleteForMe}
            style={{
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
            }}
          >
            Delete for me
            <div
              style={{
                fontSize: 11,
                fontWeight: 400,
                color: '#9CA3AF',
                marginTop: 2,
              }}
            >
              Only removed from your view
            </div>
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '8px',
              background: 'none',
              border: 'none',
              color: '#9CA3AF',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── Inner component (needs Suspense boundary for useSearchParams) ─────────────

export interface MessagesPageProps {
  role: 'host' | 'locum';
}

function MessagesPageInner({ role }: MessagesPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams(); // ← reads ?partnerId=
  const { isLoading: authLoading, userId } = useAuth();
  const navItems = role === 'host' ? HOST_NAV : LOCUM_NAV;
  const activeHref = role === 'host' ? '/host/messages' : '/locum/messages';

  /** Partner is always the other side; avoids wrong glyph if `role`/profiles on user JSON are incomplete */
  const partnerAvatarVariant: 'locum' | 'clinic' =
    role === 'locum' ? 'clinic' : 'locum';
  const myAvatarVariant: 'locum' | 'clinic' =
    role === 'locum' ? 'locum' : 'clinic';

  // If we arrived from the applicants page via ?partnerId=xxx, pre-select that partner
  const urlPartnerId = searchParams.get('partnerId');

  // Core state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    urlPartnerId, // ← initialise from URL so thread opens immediately
  );
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [partner, setPartner] = useState<ThreadPartner | null>(null);
  const [messageText, setMessageText] = useState('');
  const [search, setSearch] = useState('');

  // Loading / sending
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<ThreadMessage | null>(null);

  /** Locum: applications (for shortlisted clinics you can message) */
  const [myApplications, setMyApplications] = useState<MyApplication[]>([]);

  /** Signed-in user’s doctor-style name for “last message from me” list previews */
  const [myListPreviewName, setMyListPreviewName] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (authLoading || !getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        if (role === 'host') {
          const p = await hostApi.getProfile();
          if (cancelled || !p) return;
          if (p.contactFirstName?.trim()) {
            setMyListPreviewName(
              `Dr ${p.contactFirstName} ${p.contactLastName ?? ''}`.trim(),
            );
          } else if (p.clinicName?.trim()) {
            setMyListPreviewName(p.clinicName.trim());
          }
        } else {
          const { exists, profile } = await locumApi.getProfile();
          if (cancelled || !exists || !profile?.firstName?.trim()) return;
          setMyListPreviewName(
            `Dr ${profile.firstName} ${profile.lastName ?? ''}`.trim(),
          );
        }
      } catch {
        /* offline / 401 — leave null; fall back to email local part in UI */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, role, userId]);
  /** Job context for the next outgoing message (shortlist or last conv job) */
  const [composeJobPostingId, setComposeJobPostingId] = useState<string | null>(
    null,
  );

  // Context menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpenId]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = emojiPickerRef.current;
      if (el && !el.contains(e.target as Node)) setEmojiPickerOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [emojiPickerOpen]);

  // ── Load conversations ────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const { conversations: data } = await messageApi.getConversations();
      setConversations(data);
      // Only auto-select first conv when NO partner was passed via URL
      if (!urlPartnerId && !selectedPartnerId && data.length > 0) {
        const first = data[0];
        setSelectedPartnerId(first.partnerId);
        setComposeJobPostingId(first.lastMessage.jobPosting?.id ?? null);
      }
    } catch {
      /* silently fail */
    } finally {
      setLoadingConvs(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPartnerId]); // ← selectedPartnerId intentionally excluded to avoid re-render loop

  useEffect(() => {
    if (authLoading) return;
    if (!getToken()) {
      setLoadingConvs(false);
      router.replace('/auth');
      return;
    }
    void loadConversations();
  }, [authLoading, router, loadConversations]);

  useEffect(() => {
    if (authLoading || role !== 'locum' || !getToken()) return;
    void locumApi
      .getMyApplications()
      .then(({ applications }) => setMyApplications(applications))
      .catch(() => setMyApplications([]));
  }, [authLoading, role]);

  // ── Load thread ───────────────────────────────────────────────────────────

  const loadThread = useCallback(async (partnerId: string) => {
    setLoadingThread(true);
    try {
      const { messages, partner: p } = await messageApi.getThread(partnerId);
      setThread(messages);
      setPartner(p);
      setConversations((prev) =>
        prev.map((c) =>
          c.partnerId === partnerId ? { ...c, unreadCount: 0 } : c,
        ),
      );
    } catch {
      /* silently fail */
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedPartnerId || authLoading || !getToken()) return;
    void loadThread(selectedPartnerId);
  }, [selectedPartnerId, loadThread, authLoading]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  // Poll every 5s
  useEffect(() => {
    if (!selectedPartnerId || authLoading || !getToken()) return;
    pollRef.current = setInterval(async () => {
      if (!getToken()) return;
      try {
        const [{ messages }, { conversations: convs }] = await Promise.all([
          messageApi.getThread(selectedPartnerId),
          messageApi.getConversations(),
        ]);
        setThread(messages);
        setConversations(
          convs.map((c) =>
            c.partnerId === selectedPartnerId ? { ...c, unreadCount: 0 } : c,
          ),
        );
      } catch {
        /* silently fail */
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedPartnerId, authLoading]);

  // ── Send ──────────────────────────────────────────────────────────────────

  async function handleSend() {
    const body = messageText.trim();
    if (!body || !selectedPartnerId || sending) return;
    setSending(true);
    setMessageText('');
    try {
      const { message } = await messageApi.sendMessage(
        selectedPartnerId,
        body,
        composeJobPostingId ?? undefined,
      );
      setThread((prev) => [...prev, message as ThreadMessage]);
      void loadConversations();
    } catch {
      setMessageText(body);
    } finally {
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
    } else {
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

  // ── Edit ──────────────────────────────────────────────────────────────────

  function startEdit(msg: ThreadMessage) {
    setEditingId(msg.id);
    setEditBody(msg.body);
    setMenuOpenId(null);
  }

  async function saveEdit() {
    if (!editingId || !editBody.trim()) return;
    setSavingEdit(true);
    try {
      const { message: updated } = await messageApi.editMessage(
        editingId,
        editBody.trim(),
      );
      setThread((prev) =>
        prev.map((m) => (m.id === editingId ? { ...m, ...updated } : m)),
      );
      setEditingId(null);
    } catch {
      /* body stays editable */
    } finally {
      setSavingEdit(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBody('');
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function confirmDeleteForEveryone() {
    if (!deleteTarget) return;
    try {
      const { message: updated } = await messageApi.deleteMessage(
        deleteTarget.id,
      );
      setThread((prev) =>
        prev.map((m) => (m.id === deleteTarget.id ? { ...m, ...updated } : m)),
      );
    } catch {
      /* silently fail */
    } finally {
      setDeleteTarget(null);
    }
  }

  function confirmDeleteForMe() {
    if (!deleteTarget) return;
    setThread((prev) => prev.filter((m) => m.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const display = getDisplayName(c.partner).toLowerCase();
      const practice = (c.partner.hostProfile?.practiceName ?? '').toLowerCase();
      const jobTitle = (c.lastMessage.jobPosting?.title ?? '').toLowerCase();
      const body = (c.lastMessage.body ?? '').toLowerCase();
      return (
        display.includes(q) ||
        practice.includes(q) ||
        jobTitle.includes(q) ||
        body.includes(q)
      );
    });
  }, [conversations, search]);

  const hostIdsWithConvs = useMemo(
    () => new Set(conversations.map((c) => c.partnerId)),
    [conversations],
  );

  /** Locum: applied + shortlisted jobs (hosts without an existing conv row). */
  const locumApplicationSidebarRows = useMemo(() => {
    if (role !== 'locum') return [];
    const rows = myApplications.filter(
      (a) =>
        (a.status === 'SHORTLISTED' || a.status === 'APPLIED') &&
        !hostIdsWithConvs.has(a.jobPosting.hostProfile.userId),
    );
    const rank = (s: MyApplication['status']) =>
      s === 'SHORTLISTED' ? 0 : s === 'APPLIED' ? 1 : 2;
    return [...rows].sort((a, b) => {
      const d = rank(a.status) - rank(b.status);
      if (d !== 0) return d;
      return (
        new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );
    });
  }, [role, myApplications, hostIdsWithConvs]);

  const filteredLocumAppRows = useMemo(() => {
    if (!search.trim()) return locumApplicationSidebarRows;
    const q = search.toLowerCase();
    return locumApplicationSidebarRows.filter(
      (a) =>
        a.jobPosting.title.toLowerCase().includes(q) ||
        a.jobPosting.hostProfile.practiceName.toLowerCase().includes(q),
    );
  }, [locumApplicationSidebarRows, search]);

  useEffect(() => {
    if (authLoading || role !== 'locum') return;
    if (urlPartnerId) return;
    if (selectedPartnerId) return;
    if (loadingConvs) return;
    if (conversations.length > 0) return;
    if (locumApplicationSidebarRows.length === 0) return;
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashLayout
      navItems={navItems}
      activeHref={activeHref}
      topbarFirstName={undefined}
      topbarLastName={undefined}
    >
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#0f1523',
          marginBottom: 4,
        }}
      >
        Messaging
      </h1>
      <p style={{ fontSize: 12, color: '#8892a4', marginBottom: 16 }}>
        Define and manage organizational, hierarchy, departments, and
        relationships with AI-powered insights
      </p>

      <div
        style={{
          display: 'flex',
          border: '1px solid #E5E7EB',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#fff',
          height: 'calc(100vh - 200px)',
          minHeight: 500,
        }}
      >
        {/* ── LEFT: conversation list ────────────────────────────────────── */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            borderRight: '1px solid #E5E7EB',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid #F3F4F6',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '8px 12px',
              }}
            >
              <SearchIcon />
              <input
                type="text"
                placeholder="Search message"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 13,
                  color: '#374151',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingConvs ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#9CA3AF',
                }}
              >
                Loading…
              </div>
            ) : (
              <>
                {filteredConvs.map((conv) => {
                const isSelected = conv.partnerId === selectedPartnerId;
                const name = getDisplayName(conv.partner);
                const jobTitle = conv.lastMessage.jobPosting?.title ?? null;
                const isDeleted = !!conv.lastMessage.deletedAt;
                const lastPreviewFromPartner =
                  conv.lastMessage.senderId === conv.partnerId;
                const listPreviewSenderLabel = lastPreviewFromPartner
                  ? name
                  : (myListPreviewName ?? getEmail()?.split('@')[0] ?? '');

                return (
                  <div
                    key={conv.partnerId}
                    onClick={() => {
                      setSelectedPartnerId(conv.partnerId);
                      setComposeJobPostingId(
                        conv.lastMessage.jobPosting?.id ?? null,
                      );
                    }}
                    style={{
                      padding: '14px',
                      borderBottom: '1px solid #F3F4F6',
                      cursor: 'pointer',
                      background: isSelected ? '#EEF0FB' : '#fff',
                      borderLeft: isSelected
                        ? '3px solid #3B4FD8'
                        : '3px solid transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <Avatar
                        user={conv.partner}
                        variant={partnerAvatarVariant}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 2,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#0f1523',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 140,
                            }}
                          >
                            {name}
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              flexShrink: 0,
                            }}
                          >
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                              {fmtConvDate(conv.lastMessage.sentAt)}
                            </span>
                            {conv.unreadCount > 0 && (
                              <span
                                style={{
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
                                }}
                              >
                                {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            minWidth: 0,
                            fontSize: 12,
                            fontStyle: isDeleted ? 'italic' : 'normal',
                            marginBottom: jobTitle ? 6 : 0,
                          }}
                        >
                          {isDeleted ? (
                            <span style={{ color: '#9CA3AF' }}>
                              Message deleted
                            </span>
                          ) : listPreviewSenderLabel ? (
                            <>
                              <span
                                style={{
                                  flexShrink: 0,
                                  fontWeight: 600,
                                  color: '#374151',
                                }}
                              >
                                {listPreviewSenderLabel}:
                              </span>
                              <span
                                style={{
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  color: '#6B7280',
                                  marginLeft: 4,
                                }}
                              >
                                {conv.lastMessage.body}
                              </span>
                            </>
                          ) : (
                            <span
                              style={{
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: '#6B7280',
                              }}
                            >
                              {conv.lastMessage.body}
                            </span>
                          )}
                        </div>
                        {jobTitle && (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: '#F3F4F6',
                              border: '1px solid #E5E7EB',
                              borderRadius: 6,
                              padding: '3px 8px',
                              maxWidth: '100%',
                              overflow: 'hidden',
                            }}
                          >
                            <Image
                              src="/brief-case.png"
                              alt=""
                              width={24}
                              height={24}
                              style={{
                                flexShrink: 0,
                                display: 'block',
                              }}
                            />
                            <span
                              style={{
                                fontSize: 11,
                                color: '#374151',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                              }}
                            >
                              {jobTitle}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
                {role === 'locum' &&
                  filteredLocumAppRows.map((app) => {
                    const hostId = app.jobPosting.hostProfile.userId;
                    const isSelected = selectedPartnerId === hostId;
                    const practice = app.jobPosting.hostProfile.practiceName;
                    const jobTitle = app.jobPosting.title;
                    const isShortlisted = app.status === 'SHORTLISTED';
                    return (
                      <div
                        key={app.id}
                        onClick={() => {
                          setSelectedPartnerId(hostId);
                          setComposeJobPostingId(app.jobPosting.id);
                        }}
                        style={{
                          padding: '14px',
                          borderBottom: '1px solid #F3F4F6',
                          cursor: 'pointer',
                          background: isSelected ? '#EEF0FB' : '#fff',
                          borderLeft: isSelected
                            ? '3px solid #3B4FD8'
                            : '3px solid transparent',
                          transition: 'background 0.1s',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
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
                            }}
                          >
                            <AvatarGlyph variant="clinic" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 2,
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: '#0f1523',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  minWidth: 0,
                                }}
                              >
                                {practice}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: isShortlisted ? '#059669' : '#1D4ED8',
                                  background: isShortlisted ? '#ECFDF5' : '#EFF6FF',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  flexShrink: 0,
                                }}
                              >
                                {isShortlisted ? 'Shortlisted' : 'Applied'}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: '#6B7280',
                                marginBottom: 6,
                              }}
                            >
                              Tap to message about this job
                            </div>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#F3F4F6',
                                border: '1px solid #E5E7EB',
                                borderRadius: 6,
                                padding: '3px 8px',
                                maxWidth: '100%',
                                overflow: 'hidden',
                              }}
                            >
                              <Image
                                src="/brief-case.png"
                                alt=""
                                width={24}
                                height={24}
                                style={{
                                  flexShrink: 0,
                                  display: 'block',
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 11,
                                  color: '#374151',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  minWidth: 0,
                                }}
                              >
                                {jobTitle}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {filteredConvs.length === 0 &&
                  filteredLocumAppRows.length === 0 && (
                    <div
                      style={{ padding: '48px 24px', textAlign: 'center' }}
                    >
                      {urlPartnerId ? (
                        <>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            👋
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: '#374151',
                              marginBottom: 6,
                            }}
                          >
                            Start the conversation
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Type a message below to reach out
                          </div>
                        </>
                      ) : role === 'locum' && search.trim() ? (
                        <>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            🔍
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: '#374151',
                              marginBottom: 6,
                            }}
                          >
                            No matching chats or applications
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Try a different search term
                          </div>
                        </>
                      ) : role === 'locum' &&
                        locumApplicationSidebarRows.length === 0 &&
                        myApplications.length > 0 ? (
                        <>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            💬
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: '#374151',
                              marginBottom: 6,
                            }}
                          >
                            No active applications to show
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Confirmed or closed applications are not listed here
                          </div>
                        </>
                      ) : role === 'locum' ? (
                        <>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            💬
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: '#374151',
                              marginBottom: 6,
                            }}
                          >
                            No applications yet
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Apply to a job from Browse to message clinics here
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>
                            💬
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: '#374151',
                              marginBottom: 6,
                            }}
                          >
                            No messages yet
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Messages will appear here
                          </div>
                        </>
                      )}
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: thread + send ───────────────────────────────────────── */}
        {!selectedPartnerId ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9CA3AF',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 36 }}>✉️</div>
            <div style={{ fontSize: 13 }}>
              Select a conversation to start messaging
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              position: 'relative',
            }}
          >
            {/* Thread header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E5E7EB',
                flexShrink: 0,
              }}
            >
              {loadingThread ? (
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</div>
              ) : (
                <>
                  {clinicName && (
                    <div
                      style={{
                        fontSize: 12,
                        color: '#3B4FD8',
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {clinicName}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: '#0f1523',
                      }}
                    >
                      {partnerName}
                    </span>
                    <VerifiedIcon />
                  </div>
                  {location && (
                    <div
                      style={{
                        fontSize: 12,
                        color: '#6B7280',
                        marginBottom: 8,
                      }}
                    >
                      {location}
                    </div>
                  )}
                  {specializations.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {specializations.map((s) => (
                        <span
                          key={s}
                          style={{
                            padding: '4px 10px',
                            border: '1px solid #E5E7EB',
                            borderRadius: 6,
                            fontSize: 12,
                            color: '#3B4FD8',
                            background: '#F5F6FF',
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Message thread */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {loadingThread ? (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#9CA3AF',
                    paddingTop: 40,
                  }}
                >
                  Loading messages…
                </div>
              ) : thread.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#9CA3AF',
                    paddingTop: 40,
                  }}
                >
                  No messages yet. Say hello! 👋
                </div>
              ) : (
                thread.map((msg, idx) => {
                  // In a 1:1 thread, the other person is selectedPartnerId; your messages
                  // are everything else. Do not compare to Supabase user.id — Nest stores
                  // Prisma User.id on messages, which can differ from Supabase's id.
                  const isMine = msg.senderId !== selectedPartnerId;
                  const isDeleted = !!msg.deletedAt;
                  const isEdited = !!msg.editedAt && !isDeleted;
                  const isEditing = editingId === msg.id;
                  const hasMenu = menuOpenId === msg.id;
                  const showDate =
                    idx === 0 ||
                    fmtDate(msg.sentAt) !== fmtDate(thread[idx - 1].sentAt);

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            margin: '16px 0 12px',
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              height: 1,
                              background: '#F3F4F6',
                            }}
                          />
                          <span
                            style={{
                              fontSize: 11,
                              color: '#9CA3AF',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {fmtDate(msg.sentAt)}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: 1,
                              background: '#F3F4F6',
                            }}
                          />
                        </div>
                      )}

                      <div
                        style={{
                          marginBottom: 16,
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 4,
                          }}
                        >
                          <Avatar
                            user={msg.sender as AnyUser}
                            variant={
                              isMine ? myAvatarVariant : partnerAvatarVariant
                            }
                          />

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 0,
                                gap: 8,
                              }}
                            >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: '#0f1523',
                                }}
                              >
                                {getDisplayName(msg.sender as AnyUser)}
                              </span>
                              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                                {fmtTime(msg.sentAt)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  color: '#9CA3AF',
                                }}
                              >
                                {fmtDate(msg.sentAt)}
                              </span>
                              {isMine && !isDeleted && !isEditing && (
                                <div
                                  style={{
                                    position: 'relative',
                                    flexShrink: 0,
                                  }}
                                  ref={hasMenu ? menuRef : undefined}
                                >
                                  <button
                                    type="button"
                                    aria-label="Message options"
                                    onClick={() =>
                                      setMenuOpenId(hasMenu ? null : msg.id)
                                    }
                                    style={{
                                      background: '#F9FAFB',
                                      border: '1px solid #E5E7EB',
                                      borderRadius: 6,
                                      padding: '4px 8px',
                                      cursor: 'pointer',
                                      fontSize: 16,
                                      color: '#374151',
                                      lineHeight: 1,
                                      minWidth: 32,
                                    }}
                                    title="Edit or delete message"
                                  >
                                    ⋮
                                  </button>
                                  {hasMenu && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        right: 0,
                                        top: '100%',
                                        marginTop: 4,
                                        background: '#fff',
                                        border: '1px solid #E5E7EB',
                                        borderRadius: 8,
                                        boxShadow:
                                          '0 8px 24px rgba(0,0,0,0.12)',
                                        zIndex: 100,
                                        minWidth: 130,
                                        overflow: 'hidden',
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => startEdit(msg)}
                                        style={{
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
                                        }}
                                        onMouseEnter={(e) =>
                                          (e.currentTarget.style.background =
                                            '#F9FAFB')
                                        }
                                        onMouseLeave={(e) =>
                                          (e.currentTarget.style.background =
                                            'none')
                                        }
                                      >
                                        Edit
                                      </button>
                                      <div
                                        style={{
                                          height: 1,
                                          background: '#F3F4F6',
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDeleteTarget(msg);
                                          setMenuOpenId(null);
                                        }}
                                        style={{
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
                                        }}
                                        onMouseEnter={(e) =>
                                          (e.currentTarget.style.background =
                                            '#FEF2F2')
                                        }
                                        onMouseLeave={(e) =>
                                          (e.currentTarget.style.background =
                                            'none')
                                        }
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          </div>
                        </div>

                        <div
                          style={{
                            paddingLeft: AVATAR_GLYPH_PX + 10,
                          }}
                        >
                          {isDeleted ? (
                            <span
                              style={{
                                fontSize: 13,
                                color: '#9CA3AF',
                                fontStyle: 'italic',
                              }}
                            >
                              This message was deleted
                            </span>
                          ) : isEditing ? (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              }}
                            >
                              <textarea
                                autoFocus
                                value={editBody}
                                onChange={(e) => setEditBody(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    void saveEdit();
                                  }
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                rows={2}
                                style={{
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
                                }}
                              />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => void saveEdit()}
                                  disabled={savingEdit || !editBody.trim()}
                                  style={{
                                    padding: '5px 14px',
                                    background: '#3B4FD8',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 6,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                  }}
                                >
                                  {savingEdit ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  style={{
                                    padding: '5px 14px',
                                    background: '#F3F4F6',
                                    color: '#374151',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: 6,
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                fontSize: 14,
                                color: '#374151',
                                lineHeight: 1.6,
                                wordBreak: 'break-word',
                              }}
                            >
                              {msg.body}
                              {isEdited && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: '#9CA3AF',
                                    marginLeft: 6,
                                    fontStyle: 'italic',
                                  }}
                                >
                                  edited
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Send box */}
            <div
              style={{
                borderTop: '1px solid #E5E7EB',
                padding: '12px 16px',
                flexShrink: 0,
              }}
            >
              <textarea
                ref={inputRef}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                rows={2}
                style={{
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
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#3B4FD8')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#E5E7EB')}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  ref={emojiPickerRef}
                  style={{ position: 'relative', display: 'flex', gap: 12 }}
                >
                  <button
                    type="button"
                    title="Add emoji"
                    aria-expanded={emojiPickerOpen}
                    aria-haspopup="dialog"
                    onClick={() => setEmojiPickerOpen((o) => !o)}
                    style={{
                      background: emojiPickerOpen ? '#EEF0FB' : 'none',
                      border: '1px solid #E5E7EB',
                      borderRadius: 8,
                      cursor: 'pointer',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <EmojiIcon />
                  </button>
                  {emojiPickerOpen && (
                    <div
                      role="dialog"
                      aria-label="Quick emoji"
                      style={{
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
                      }}
                    >
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => insertEmoji(emoji)}
                          style={{
                            fontSize: 22,
                            lineHeight: 1,
                            padding: '6px 4px',
                            border: 'none',
                            borderRadius: 8,
                            background: '#F9FAFB',
                            cursor: 'pointer',
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={sending || !messageText.trim()}
                  style={{
                    padding: '9px 28px',
                    background:
                      sending || !messageText.trim()
                        ? '#D1D5DB'
                        : 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor:
                      sending || !messageText.trim() ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteModal
          onDeleteForEveryone={() => void confirmDeleteForEveryone()}
          onDeleteForMe={confirmDeleteForMe}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </DashLayout>
  );
}

// ── Export wrapped in Suspense (required by Next.js for useSearchParams) ──────

export default function MessagesPage(props: MessagesPageProps) {
  return (
    <Suspense fallback={null}>
      <MessagesPageInner {...props} />
    </Suspense>
  );
}
