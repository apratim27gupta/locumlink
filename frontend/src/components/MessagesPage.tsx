'use client';
import EmojiPicker from 'emoji-picker-react';
import { useEffect, useState, useRef, useCallback, useMemo, Suspense, type MouseEvent as ReactMouseEvent, } from 'react';
import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';
import { onPwaRefresh } from '@/lib/pwaEvents';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Image from 'next/image';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { fetchAllPaginated, hostApi, locumApi, messageApi, uploadFile, type ApplicationRecord, type BlockStatus, type Conversation, type ConversationPartner, type MyApplication, type ReportReason, type ThreadMessage, type ThreadPartner, } from '@/lib/api';
import { getEmail, getToken } from '@/lib/auth';
import { subscribeProfileUpdated } from '@/lib/profileUpdatedEvent';
import { dispatchMessagesUpdated } from '@/lib/messagesUpdatedEvent';
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
const EMPTY_BLOCK_STATUS: BlockStatus = {
    blockedByMe: false,
    blockedByPartner: false,
    isMessagingBlocked: false,
};
const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
    { value: 'HARASSMENT', label: 'Harassment or abusive behavior' },
    { value: 'SPAM', label: 'Spam or unwanted messages' },
    { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
    { value: 'FRAUD', label: 'Fraud or misrepresentation' },
    { value: 'OTHER', label: 'Other' },
];
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
type MessagePartner = ConversationPartner | ThreadPartner;

function getSpecializations(partner: MessagePartner | null): string[] {
    if (!partner)
        return [];
    const locumProfile = partner.locumProfile as ThreadPartner['locumProfile'];
    if (locumProfile?.specializationText)
        return locumProfile.specializationText
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
            .slice(0, 4);
    if (locumProfile?.specialty)
        return [locumProfile.specialty.replace(/_/g, ' ')];
    return [];
}
function getLocation(partner: MessagePartner | null): string {
    if (!partner)
        return '';
    const city =
        (partner.locumProfile as ThreadPartner['locumProfile'])?.city
        ?? (partner.hostProfile as ThreadPartner['hostProfile'])?.city
        ?? '';
    const prov =
        (partner.locumProfile as ThreadPartner['locumProfile'])?.province
        ?? (partner.hostProfile as ThreadPartner['hostProfile'])?.province
        ?? '';
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
      <div className="messages-delete-modal" style={{
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
function BlockUserModal({ partnerName, onConfirm, onCancel, busy, }: {
    partnerName: string;
    onConfirm: () => void;
    onCancel: () => void;
    busy: boolean;
}) {
    return (<>
      <div onClick={onCancel} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 500,
        }}/>
      <div className="messages-delete-modal" style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#fff',
            borderRadius: 12,
            padding: '24px 28px',
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
            zIndex: 501,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            fontFamily: 'Inter, sans-serif',
        }}>
        <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#0f1523',
            marginBottom: 10,
        }}>
          Block {partnerName}?
        </div>
        <p style={{
            fontSize: 14,
            color: '#6B7280',
            lineHeight: 1.5,
            margin: '0 0 20px',
        }}>
          They won&apos;t be able to send you messages, and you won&apos;t be able to message them. You can unblock them anytime.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" disabled={busy} onClick={onConfirm} style={{
            padding: '10px 16px',
            background: '#DC2626',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: busy ? 0.7 : 1,
        }}>
            {busy ? 'Blocking…' : 'Block user'}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} style={{
            padding: '8px',
            background: 'none',
            border: 'none',
            color: '#9CA3AF',
            fontSize: 13,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
        }}>
            Cancel
          </button>
        </div>
      </div>
    </>);
}
function ReportUserModal({ partnerName, mode, onConfirm, onCancel, busy, }: {
    partnerName: string;
    mode: 'report' | 'block-and-report';
    onConfirm: (reason: ReportReason, details: string) => void;
    onCancel: () => void;
    busy: boolean;
}) {
    const [reason, setReason] = useState<ReportReason>('HARASSMENT');
    const [details, setDetails] = useState('');
    const isBlockAndReport = mode === 'block-and-report';
    return (<>
      <div onClick={onCancel} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 500,
        }}/>
      <div className="messages-delete-modal" style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#fff',
            borderRadius: 12,
            padding: '24px 28px',
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
            zIndex: 501,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            fontFamily: 'Inter, sans-serif',
        }}>
        <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#0f1523',
            marginBottom: 10,
        }}>
          {isBlockAndReport ? `Block and report ${partnerName}?` : `Report ${partnerName}?`}
        </div>
        <p style={{
            fontSize: 14,
            color: '#6B7280',
            lineHeight: 1.5,
            margin: '0 0 16px',
        }}>
          {isBlockAndReport
                ? `We'll review this report, and you won't receive messages from ${partnerName}.`
                : 'Our admin team will review this report. The other user will not see who reported them.'}
        </p>
        <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 700,
            color: '#374151',
            marginBottom: 6,
        }}>
          Reason
        </label>
        <select value={reason} disabled={busy} onChange={(e) => setReason(e.target.value as ReportReason)} style={{
            width: '100%',
            border: '1px solid #D1D5DB',
            borderRadius: 8,
            padding: '9px 10px',
            fontSize: 14,
            fontFamily: 'inherit',
            marginBottom: 12,
            background: '#fff',
        }}>
          {REPORT_REASONS.map((item) => (<option key={item.value} value={item.value}>{item.label}</option>))}
        </select>
        <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 700,
            color: '#374151',
            marginBottom: 6,
        }}>
          Details (optional)
        </label>
        <textarea value={details} disabled={busy} maxLength={2000} onChange={(e) => setDetails(e.target.value)} rows={4} placeholder="Add context for the admin team" style={{
            width: '100%',
            border: '1px solid #D1D5DB',
            borderRadius: 8,
            padding: '9px 10px',
            fontSize: 14,
            fontFamily: 'inherit',
            marginBottom: 16,
            resize: 'vertical',
            boxSizing: 'border-box',
        }}/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" disabled={busy} onClick={() => onConfirm(reason, details)} style={{
            padding: '10px 16px',
            background: isBlockAndReport ? '#DC2626' : '#B45309',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: busy ? 0.7 : 1,
        }}>
            {busy ? (isBlockAndReport ? 'Blocking and reporting…' : 'Reporting…') : (isBlockAndReport ? 'Block and report' : 'Submit report')}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} style={{
            padding: '8px',
            background: 'none',
            border: 'none',
            color: '#9CA3AF',
            fontSize: 13,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
        }}>
            Cancel
          </button>
        </div>
      </div>
    </>);
}
function UnblockUserModal({ partnerName, onConfirm, onCancel, busy, }: {
    partnerName: string;
    onConfirm: () => void;
    onCancel: () => void;
    busy: boolean;
}) {
    return (<>
      <div onClick={onCancel} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            zIndex: 500,
        }}/>
      <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#fff',
            borderRadius: 16,
            padding: 28,
            width: 420,
            maxWidth: 'calc(100vw - 32px)',
            zIndex: 501,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            fontFamily: 'Inter, sans-serif',
        }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0B0F1F', margin: '0 0 8px' }}>
          Unblock {partnerName}?
        </h2>
        <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, margin: '0 0 24px' }}>
          You will be able to send and receive messages from this user again.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" disabled={busy} onClick={onCancel} style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #E5E7EB',
            background: '#fff',
            fontFamily: 'inherit',
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? 'default' : 'pointer',
        }}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#1B31D2',
            color: '#fff',
            fontFamily: 'inherit',
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
        }}>
            {busy ? 'Unblocking…' : 'Unblock'}
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
    const [partner, setPartner] = useState<MessagePartner | null>(null);
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
    const [blockStatus, setBlockStatus] = useState<BlockStatus>(EMPTY_BLOCK_STATUS);
    const [threadMenuOpen, setThreadMenuOpen] = useState(false);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [showUnblockModal, setShowUnblockModal] = useState(false);
    const [blockBusy, setBlockBusy] = useState(false);
    const [reportMode, setReportMode] = useState<'report' | 'block-and-report' | null>(null);
    const [reportBusy, setReportBusy] = useState(false);
    const [myApplications, setMyApplications] = useState<MyApplication[]>([]);
    const [myListPreviewName, setMyListPreviewName] = useState<string | null>(null);
    const [myCpsnsVerified, setMyCpsnsVerified] = useState(false);
    const [listPanelWidth, setListPanelWidth] = useState(readStoredMessagesListWidth);
    const userClearedRef = useRef(false);
    const syncPartnerFromConversations = useCallback((
        convs: Conversation[],
        partnerId: string | null,
    ) => {
        if (!partnerId)
            return;
        const match = convs.find((c) => c.partnerId === partnerId);
        if (match)
            setPartner(match.partner);
    }, []);
    useEffect(() => {
        setMyListPreviewName(null);
        setMyCpsnsVerified(false);
    }, [pathname]);
    const refreshMyListPreviewName = useCallback(async () => {
        if (authLoading || !getToken())
            return;
        try {
            if (role === 'host') {
                const p = await hostApi.getProfile();
                if (!p)
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
                if (!exists || !profile?.firstName?.trim())
                    return;
                setMyCpsnsVerified(
                    isCpsnsVerificationApproved(profile.cpsnsVerificationStatus),
                );
                setMyListPreviewName(`Dr ${profile.firstName} ${profile.lastName ?? ''}`.trim());
            }
        }
        catch {
        }
    }, [authLoading, role]);
    useEffect(() => {
        void refreshMyListPreviewName();
    }, [refreshMyListPreviewName, userId, pathname]);
    const [composeJobPostingId, setComposeJobPostingId] = useState<string | null>(null);
    const [threadHostApplication, setThreadHostApplication] = useState<{
        id: string;
        status: ApplicationRecord['status'];
    } | null>(null);
    const [confirmLocumBusy, setConfirmLocumBusy] = useState(false);
    const [showConfirmJobOverlay, setShowConfirmJobOverlay] = useState(false);
    const [confirmJobOptions, setConfirmJobOptions] = useState<
        Array<{ appId: string; jobId: string; jobTitle: string; appliedAt: string }>
    >([]);
    const [selectedConfirmJob, setSelectedConfirmJob] = useState<{
        appId: string;
        jobId: string;
        jobTitle: string;
    } | null>(null);
    const [confirmStep, setConfirmStep] = useState<'select' | 'confirm'>('select');
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const threadScrollRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const filePickRef = useRef<HTMLInputElement>(null);
    const imagePickRef = useRef<HTMLInputElement>(null);
    const threadSinceRef = useRef<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const threadMenuRef = useRef<HTMLDivElement>(null);
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
        if (!threadMenuOpen)
            return;
        function onClickOutside(e: MouseEvent) {
            if (threadMenuRef.current && !threadMenuRef.current.contains(e.target as Node)) {
                setThreadMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [threadMenuOpen]);
    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearchQuery(search.trim()), 280);
        return () => window.clearTimeout(t);
    }, [search]);
    const loadMyApplications = useCallback(async () => {
        if (authLoading || role !== 'locum' || !getToken())
            return;
        try {
            const applications = await fetchAllPaginated((cursor) =>
                locumApi.getMyApplications({ cursor, limit: 100 }),
            );
            setMyApplications(applications);
        }
        catch {
            setMyApplications([]);
        }
    }, [authLoading, role]);
    useEffect(() => {
        void loadMyApplications();
    }, [loadMyApplications, pathname]);
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
            syncPartnerFromConversations(data, selectedPartnerId);
            dispatchMessagesUpdated();
            if (!urlPartnerId && !selectedPartnerId && data.length > 0 && window.innerWidth > 768 && !userClearedRef.current) {
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
    }, [urlPartnerId, debouncedSearchQuery, selectedPartnerId, syncPartnerFromConversations]);
    const loadThread = useCallback(async (partnerId: string) => {
        setLoadingThread(true);
        try {
            const { items, partner: p, blockStatus: status } = await messageApi.getThread(partnerId, { limit: 100 });
            const hiddenIds = new Set(JSON.parse(localStorage.getItem('deleted-for-me') || '[]'));
            const visible = items.filter((m: ThreadMessage) => !hiddenIds.has(m.id));
            setThread(visible);
            const last = visible[visible.length - 1];
            threadSinceRef.current = last?.sentAt ?? null;
            setPartner(p);
            setBlockStatus(status ?? EMPTY_BLOCK_STATUS);
            setConversations((prev) => prev.map((c) => c.partnerId === partnerId ? { ...c, unreadCount: 0, blockStatus: status ?? c.blockStatus } : c));
            dispatchMessagesUpdated();
        }
        catch {
        }
        finally {
            setLoadingThread(false);
        }
    }, []);
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
        if (!selectedPartnerId || authLoading || !getToken())
            return;
        void loadThread(selectedPartnerId);
    }, [selectedPartnerId, loadThread, authLoading]);
    useEffect(() => {
        return subscribeProfileUpdated(() => {
            void refreshMyListPreviewName();
            void loadMyApplications();
            void loadConversations({ skipTopLoader: true });
            if (selectedPartnerId)
                void loadThread(selectedPartnerId);
        });
    }, [
        refreshMyListPreviewName,
        loadMyApplications,
        loadConversations,
        loadThread,
        selectedPartnerId,
    ]);
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
        setBlockStatus(EMPTY_BLOCK_STATUS);
        setThreadMenuOpen(false);
    }, [selectedPartnerId]);
    const pollMessages = useCallback(async () => {
        if (!selectedPartnerId || !getToken())
            return;
        const since = threadSinceRef.current ?? undefined;
        try {
            const [threadResult, { conversations: convs }] = await Promise.all([
                since
                    ? messageApi.getThread(selectedPartnerId, { skipTopLoader: true, since })
                    : Promise.resolve({ items: [] as ThreadMessage[], nextCursor: null, hasNextPage: false, partner: null }),
                messageApi.getConversations({
                    skipTopLoader: true,
                    q: debouncedSearchQuery || undefined,
                }),
            ]);
            const hiddenIds2 = new Set(JSON.parse(localStorage.getItem('deleted-for-me') || '[]'));
            const incoming = threadResult.items.filter((m: ThreadMessage) => !hiddenIds2.has(m.id));
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
            syncPartnerFromConversations(convs, selectedPartnerId);
            const match = convs.find((c) => c.partnerId === selectedPartnerId);
            if (match?.blockStatus)
                setBlockStatus(match.blockStatus);
            dispatchMessagesUpdated();
        }
        catch {
        }
    }, [selectedPartnerId, debouncedSearchQuery, syncPartnerFromConversations]);
    useVisibilityPolling(() => {
        void pollMessages();
    }, 10_000, Boolean(selectedPartnerId) && !authLoading && Boolean(getToken()));
    useEffect(() => {
        if (!selectedPartnerId || !getToken()) return;
        return onPwaRefresh(() => {
            void pollMessages();
        });
    }, [selectedPartnerId, pollMessages]);
    useEffect(() => {
        if (role !== 'host' || !selectedPartnerId || !composeJobPostingId) {
            setThreadHostApplication(null);
            return;
        }
        let cancelled = false;
        void hostApi
            .getApplications(composeJobPostingId, { limit: 100 })
            .then(({ items: applications }) => {
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
            void loadConversations({ skipTopLoader: true });
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
    async function handleConfirmButtonClick() {
        if (role !== 'host' || !selectedPartnerId || confirmLocumBusy)
            return;
        setConfirmLocumBusy(true);
        try {
            const { items: allJobs } = await hostApi.getJobs({ limit: 100 });
            const options: Array<{
                appId: string;
                jobId: string;
                jobTitle: string;
                appliedAt: string;
            }> = [];
            for (const job of allJobs) {
                const { items: apps } = await hostApi.getApplications(job.id, { limit: 100 });
                const locumApp = apps.find((a) => a.locumProfile.userId === selectedPartnerId &&
                    (a.status === 'APPLIED' || a.status === 'SHORTLISTED'));
                if (locumApp) {
                    options.push({
                        appId: locumApp.id,
                        jobId: job.id,
                        jobTitle: (job as { title?: string }).title ?? job.id,
                        appliedAt: (locumApp as { appliedAt?: string }).appliedAt ?? '',
                    });
                }
            }
            if (options.length === 0) {
                window.alert('No pending applications found for this locum.');
                return;
            }
            const preSelected = options.find((o) => o.jobId === composeJobPostingId) ?? null;
            setConfirmJobOptions(options);
            setSelectedConfirmJob(preSelected);
            setConfirmStep('select');
            setShowConfirmJobOverlay(true);
        }
        catch (e: unknown) {
            window.alert(e instanceof Error ? e.message : 'Could not load jobs.');
        }
        finally {
            setConfirmLocumBusy(false);
        }
    }
    async function handleConfirmLocumFromThread(jobId: string, appId: string) {
        setConfirmLocumBusy(true);
        try {
            await hostApi.updateApplication(jobId, appId, 'CONFIRMED');
            if (jobId === composeJobPostingId) {
                setThreadHostApplication((prev) => prev ? { ...prev, status: 'CONFIRMED' } : null);
            }
            void loadConversations({ skipTopLoader: true });
            setShowConfirmJobOverlay(false);
            setSelectedConfirmJob(null);
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
    async function handleBlockUser() {
        if (!selectedPartnerId || blockBusy)
            return;
        setBlockBusy(true);
        try {
            await messageApi.blockUser(selectedPartnerId);
            const nextStatus: BlockStatus = {
                blockedByMe: true,
                blockedByPartner: false,
                isMessagingBlocked: true,
            };
            setBlockStatus(nextStatus);
            setConversations((prev) => prev.map((c) => c.partnerId === selectedPartnerId ? { ...c, blockStatus: nextStatus } : c));
            setShowBlockModal(false);
            setThreadMenuOpen(false);
            void loadConversations({ skipTopLoader: true });
        }
        catch (e: unknown) {
            window.alert(e instanceof Error ? e.message : 'Could not block this user.');
        }
        finally {
            setBlockBusy(false);
        }
    }
    async function handleReportUser(reason: ReportReason, details: string) {
        if (!selectedPartnerId || reportBusy || !reportMode)
            return;
        setReportBusy(true);
        try {
            const shouldBlock = reportMode === 'block-and-report';
            await messageApi.reportUser(selectedPartnerId, reason, details, { block: shouldBlock });
            if (shouldBlock) {
                const nextStatus: BlockStatus = {
                    blockedByMe: true,
                    blockedByPartner: false,
                    isMessagingBlocked: true,
                };
                setBlockStatus(nextStatus);
                setConversations((prev) => prev.map((c) => c.partnerId === selectedPartnerId ? { ...c, blockStatus: nextStatus } : c));
                void loadConversations({ skipTopLoader: true });
            }
            setReportMode(null);
            setThreadMenuOpen(false);
            window.alert(shouldBlock
                ? 'User blocked and report submitted. Our team will review it.'
                : 'Report submitted. Our team will review it.');
        }
        catch (e: unknown) {
            window.alert(e instanceof Error ? e.message : 'Could not submit this report.');
        }
        finally {
            setReportBusy(false);
        }
    }
    async function handleUnblockUser() {
        if (!selectedPartnerId || blockBusy)
            return;
        setBlockBusy(true);
        try {
            await messageApi.unblockUser(selectedPartnerId);
            const nextStatus = EMPTY_BLOCK_STATUS;
            setBlockStatus(nextStatus);
            setConversations((prev) => prev.map((c) => c.partnerId === selectedPartnerId ? { ...c, blockStatus: nextStatus } : c));
            setShowUnblockModal(false);
            setThreadMenuOpen(false);
            void loadConversations({ skipTopLoader: true });
        }
        catch (e: unknown) {
            window.alert(e instanceof Error ? e.message : 'Could not unblock this user.');
        }
        finally {
            setBlockBusy(false);
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
        if (window.innerWidth > 768 && !userClearedRef.current) {
            const first = locumApplicationSidebarRows[0];
            setSelectedPartnerId(first.jobPosting.hostProfile.userId);
            setComposeJobPostingId(first.jobPosting.id);
        }
    }, [
        authLoading,
        role,
        urlPartnerId,
        selectedPartnerId,
        loadingConvs,
        conversations.length,
        locumApplicationSidebarRows,
    ]);
    // Mobile: when back button clears selectedPartnerId, don't re-select
    const specializations = getSpecializations(partner);
    const location = getLocation(partner);
    const partnerName = partner ? getDisplayName(partner as AnyUser) : '';
    const clinicName = partner ? getClinicName(partner as AnyUser) : '';
    function senderLabel(msg: ThreadMessage, isMine: boolean): string {
        if (isMine)
            return myListPreviewName ?? getDisplayName(msg.sender as AnyUser);
        if (partner && msg.senderId === partner.id)
            return partnerName || getDisplayName(msg.sender as AnyUser);
        return getDisplayName(msg.sender as AnyUser);
    }
    const showHostThreadConfirm = role === 'host' &&
        partner?.locumProfile != null &&
        composeJobPostingId != null &&
        threadHostApplication != null &&
        threadHostApplication.status !== 'REJECTED' &&
        threadHostApplication.status !== 'WITHDRAWN';
    const hostThreadNeedsConfirm = Boolean(showHostThreadConfirm &&
        (threadHostApplication?.status === 'APPLIED' || threadHostApplication?.status === 'SHORTLISTED'));
    const hostThreadAlreadyConfirmed = Boolean(showHostThreadConfirm && threadHostApplication?.status === 'CONFIRMED');
    const isMessagingBlocked = blockStatus.isMessagingBlocked;
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
            height: 'calc(100dvh - 200px)',
            minHeight: 500,
        }}>
        
        <div className="messages-list-panel" style={{
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
                          <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        minWidth: 0,
                        flex: 1,
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
                            {name}
                          </span>
                          {conv.blockStatus?.blockedByMe ? (<span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        background: 'rgba(209, 213, 219, 0.2)',
                        borderRadius: 40,
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'rgba(11, 15, 31, 0.7)',
                        flexShrink: 0,
                    }}>
                              Blocked
                            </span>) : null}
                          </div>
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
                            <Image src="/brief-case.svg" alt="" width={12} height={12} style={{
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
                              <Image src="/brief-case.svg" alt="" width={12} height={12} style={{
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
          </div>) : (<div className="messages-chat-panel messages-chat-panel--open" style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 0,
                position: 'relative',
            }}>
            <button
              onClick={() => { userClearedRef.current = true; setSelectedPartnerId(null); }}
              className="messages-back-btn"
              style={{
                display: 'none',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                color: '#1B31D2',
                fontFamily: 'inherit',
                borderBottom: '1px solid #E5E7EB',
                width: '100%',
                textAlign: 'left',
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Back to conversations
            </button>
            
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
                    
                    {role === 'locum' && clinicName ? (<div style={{
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
                  {!loadingThread && partner ? (<div style={{
                        flexShrink: 0,
                        paddingTop: 2,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                    }}>
                      {(hostThreadNeedsConfirm || hostThreadAlreadyConfirmed) ? (hostThreadNeedsConfirm ? (<button type="button" onClick={() => void handleConfirmButtonClick()} disabled={confirmLocumBusy} style={{
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
                        </span>)) : null}
                      <div style={{ position: 'relative', flexShrink: 0 }} ref={threadMenuRef}>
                        <button type="button" aria-label="Conversation options" onClick={() => setThreadMenuOpen((v) => !v)} style={{
                            background: '#F9FAFB',
                            border: '1px solid #E5E7EB',
                            borderRadius: 6,
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontSize: 16,
                            color: '#374151',
                            lineHeight: 1,
                            minWidth: 36,
                            fontFamily: 'inherit',
                        }} title="Conversation options">
                          ⋮
                        </button>
                        {threadMenuOpen && (<div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: 4,
                            background: '#fff',
                            border: '1px solid #E5E7EB',
                            borderRadius: 8,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                            zIndex: 50,
                            minWidth: 160,
                            overflow: 'hidden',
                        }}>
                          {blockStatus.blockedByMe ? (<button type="button" onClick={() => {
                                setThreadMenuOpen(false);
                                setShowUnblockModal(true);
                            }} style={{
                            display: 'block',
                            width: '100%',
                            padding: '10px 14px',
                            background: 'none',
                            border: 'none',
                            textAlign: 'left',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#374151',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}>
                              Unblock user
                            </button>) : (<>
                            <button type="button" onClick={() => {
                                setThreadMenuOpen(false);
                                setReportMode('report');
                            }} style={{
                            display: 'block',
                            width: '100%',
                            padding: '10px 14px',
                            background: 'none',
                            border: 'none',
                            textAlign: 'left',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#B45309',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}>
                              Report user
                            </button>
                            <button type="button" onClick={() => {
                                setThreadMenuOpen(false);
                                setReportMode('block-and-report');
                            }} style={{
                            display: 'block',
                            width: '100%',
                            padding: '10px 14px',
                            background: 'none',
                            border: 'none',
                            textAlign: 'left',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#DC2626',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}>
                              Block and report
                            </button>
                            <button type="button" onClick={() => {
                                setThreadMenuOpen(false);
                                setShowBlockModal(true);
                            }} style={{
                            display: 'block',
                            width: '100%',
                            padding: '10px 14px',
                            background: 'none',
                            border: 'none',
                            textAlign: 'left',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#DC2626',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}>
                              Block user
                            </button>
                          </>)}
                        </div>)}
                      </div>
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
                                    {senderLabel(msg, isMine)}
                                  </span>
                                </NameWithVerifiedShield>
                              ) : (
                                <span style={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: '#0f1523',
                                }}>
                                  {senderLabel(msg, isMine)}
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
              {isMessagingBlocked && (<div style={{
                    marginBottom: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    fontSize: 12,
                    color: '#92400E',
                    lineHeight: 1.5,
                }}>
                  {blockStatus.blockedByMe ? (<>
                      You blocked {partnerName || 'this user'}.{' '}
                      <button type="button" onClick={() => setShowUnblockModal(true)} style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#1B31D2',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        textDecoration: 'underline',
                    }}>
                        Unblock
                      </button>
                      {' '}to send messages again.
                    </>) : 'You can\u2019t send messages in this conversation.'}
                </div>)}
              {!isMessagingBlocked && pendingFiles.length > 0 && (<div style={{
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
              {!isMessagingBlocked && (<>
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
                    : 'linear-gradient(270deg, #3A65DB 0%, #0F2A7A 100%)',
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
              </>)}
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

      {showBlockModal && (<BlockUserModal partnerName={partnerName || 'this user'} busy={blockBusy} onConfirm={() => void handleBlockUser()} onCancel={() => !blockBusy && setShowBlockModal(false)}/>)}

      {showUnblockModal && (<UnblockUserModal partnerName={partnerName || 'this user'} busy={blockBusy} onConfirm={() => void handleUnblockUser()} onCancel={() => !blockBusy && setShowUnblockModal(false)}/>)}

      {reportMode && (<ReportUserModal partnerName={partnerName || 'this user'} mode={reportMode} busy={reportBusy} onConfirm={(reason, details) => void handleReportUser(reason, details)} onCancel={() => !reportBusy && setReportMode(null)}/>)}

      {showConfirmJobOverlay && (<div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
        }}>
          <div style={{
                background: '#fff',
                borderRadius: 16,
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                width: '100%',
                maxWidth: 420,
                padding: 28,
                fontFamily: 'inherit',
            }}>
            {confirmStep === 'select' && (<>
                <h2 style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: '#111827',
                    margin: '0 0 6px',
                }}>
                  Select Job to Confirm
                </h2>
                <p style={{
                    fontSize: 13,
                    color: '#6B7280',
                    margin: '0 0 18px',
                }}>
                  This locum has applied to multiple jobs. Select which job
                  you want to confirm them for.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
                  {confirmJobOptions.map((opt) => (<button key={opt.jobId} type="button" onClick={() => setSelectedConfirmJob(opt)} style={{
                        textAlign: 'left',
                        padding: '12px 16px',
                        borderRadius: 10,
                        border: `2px solid ${selectedConfirmJob?.jobId === opt.jobId
                            ? '#14B8A6'
                            : '#E5E7EB'}`,
                        background: selectedConfirmJob?.jobId === opt.jobId
                            ? '#F0FDFA'
                            : '#fff',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                    }}>
                      <div style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#111827',
                            fontFamily: 'inherit',
                        }}>
                        {opt.jobTitle}
                      </div>
                      {opt.appliedAt ? (<div style={{
                            fontSize: 12,
                            color: '#9CA3AF',
                            marginTop: 3,
                            fontFamily: 'inherit',
                        }}>
                          Applied{' '}
                          {new Date(opt.appliedAt).toLocaleDateString('en-CA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                        })}
                        </div>) : null}
                    </button>))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setShowConfirmJobOverlay(false)} style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 8,
                        border: '1px solid #E5E7EB',
                        background: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#6B7280',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}>
                    Cancel
                  </button>
                  <button type="button" disabled={!selectedConfirmJob} onClick={() => setConfirmStep('confirm')} style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 8,
                        border: 'none',
                        background: selectedConfirmJob
                            ? 'linear-gradient(180deg,#2DD4BF 0%,#0D9488 100%)'
                            : '#D1D5DB',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#fff',
                        cursor: selectedConfirmJob ? 'pointer' : 'default',
                        fontFamily: 'inherit',
                    }}>
                    Next
                  </button>
                </div>
              </>)}

            {confirmStep === 'confirm' && selectedConfirmJob && (<>
                <h2 style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: '#111827',
                    margin: '0 0 10px',
                }}>
                  Are you sure?
                </h2>
                <p style={{
                    fontSize: 14,
                    color: '#374151',
                    margin: '0 0 24px',
                    lineHeight: 1.5,
                }}>
                  Confirm this locum doctor for{' '}
                  <span style={{ fontWeight: 700, color: '#111827' }}>
                    {selectedConfirmJob.jobTitle}
                  </span>
                  ?
                </p>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setConfirmStep('select')} style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 8,
                        border: '1px solid #E5E7EB',
                        background: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#6B7280',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}>
                    Back
                  </button>
                  <button type="button" disabled={confirmLocumBusy} onClick={() => void handleConfirmLocumFromThread(selectedConfirmJob.jobId, selectedConfirmJob.appId)} style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 8,
                        border: 'none',
                        background: confirmLocumBusy
                            ? '#94D3AF'
                            : 'linear-gradient(180deg,#22C55E 0%,#16A34A 100%)',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#fff',
                        cursor: confirmLocumBusy ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                    }}>
                    {confirmLocumBusy ? 'Confirming…' : 'Confirm'}
                  </button>
                </div>
              </>)}
          </div>
        </div>)}
    </DashLayout>);
}
export default function MessagesPage(props: MessagesPageProps) {
    return (<Suspense fallback={null}>
      <MessagesPageInner {...props}/>
    </Suspense>);
}
