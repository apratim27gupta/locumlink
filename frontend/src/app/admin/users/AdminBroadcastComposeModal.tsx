'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bold, ChevronDown, ChevronRight, Italic, Underline, XCircle } from 'lucide-react';

export type BroadcastChannel = 'notification' | 'email';

export type BroadcastResult = {
  ok: boolean;
  queued?: boolean;
  duplicate?: boolean;
  sentNotification: number;
  sentEmail: number;
  recipientCount: number;
  failed: Array<{ userId: string; error: string }>;
};

export type BroadcastDraftSeed = {
  subject: string;
  bodyHtml: string;
  channels: BroadcastChannel[];
};

export type BroadcastRecipient = {
  id: string;
  email: string;
  role: string;
};

type Props = {
  open: boolean;
  /** Selected recipients shown as removable chips (may be a subset of count). */
  recipients: BroadcastRecipient[];
  /** Total selected count (can exceed `recipients` when some are off-page). */
  recipientCount: number;
  onRemoveRecipient: (id: string) => void;
  onClearRecipients: () => void;
  /** Step back to the table checklist to add/remove recipients, keeping text. */
  onEditRecipients: (current: {
    subject: string;
    bodyHtml: string;
    channels: BroadcastChannel[];
  }) => void;
  sending: boolean;
  /** Prefill the composer when editing an existing draft. */
  initialDraft?: BroadcastDraftSeed | null;
  /** True while a draft save is in flight. */
  savingDraft?: boolean;
  onClose: () => void;
  onSend: (payload: {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    channels: BroadcastChannel[];
    idempotencyKey: string;
  }) => Promise<void>;
  /** Persist the current content as a draft. Enables the "Save as draft" flow. */
  onSaveDraft?: (payload: {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    channels: BroadcastChannel[];
  }) => Promise<void>;
};

function stripHtml(html: string): string {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.innerText || el.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

const FONT_SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'X-Large', value: '6' },
];

const activeBtnStyle: CSSProperties = {
  background: '#E0E7FF',
  color: '#3730A3',
};

export default function AdminBroadcastComposeModal({
  open,
  recipients,
  recipientCount,
  onRemoveRecipient,
  onClearRecipients,
  onEditRecipients,
  sending,
  initialDraft,
  savingDraft = false,
  onClose,
  onSend,
  onSaveDraft,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const idempotencyKeyRef = useRef<string>('');
  const [subject, setSubject] = useState('');
  const [channelNotification, setChannelNotification] = useState(true);
  const [channelEmail, setChannelEmail] = useState(true);
  const [fontSize, setFontSize] = useState('3');
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false });
  const [localErr, setLocalErr] = useState<string | null>(null);
  // Shown when the admin tries to leave with unsaved text.
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Content changed since the last open/seed/save. Drives the leave guard so we
  // never re-prompt right after a save.
  const [dirty, setDirty] = useState(false);
  // Brief "Saved ✓" acknowledgement before the modal closes on save.
  const [justSaved, setJustSaved] = useState(false);
  // Recipients list is collapsed by default; expand to see every chip.
  const [recipientsExpanded, setRecipientsExpanded] = useState(false);

  const markDirty = useCallback(() => {
    setDirty(true);
    setJustSaved(false);
  }, []);

  const syncFormatState = useCallback(() => {
    try {
      setFmt({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch {
      /* ignore when selection is outside editor */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const seedChannels = initialDraft?.channels;
    setSubject(initialDraft?.subject ?? '');
    setChannelNotification(seedChannels ? seedChannels.includes('notification') : true);
    setChannelEmail(seedChannels ? seedChannels.includes('email') : true);
    setFontSize('3');
    setFmt({ bold: false, italic: false, underline: false });
    setLocalErr(null);
    setConfirmLeave(false);
    setDirty(false);
    setJustSaved(false);
    setRecipientsExpanded(false);
    idempotencyKeyRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `bcast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const seedHtml = initialDraft?.bodyHtml?.trim();
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = seedHtml || '<p><br></p>';
      }
    });
    // Re-seed only when the modal opens or a different draft is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDraft]);

  useEffect(() => {
    if (!open) return;
    const onSel = () => syncFormatState();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [open, syncFormatState]);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncFormatState();
    markDirty();
  }

  async function handleSend() {
    setLocalErr(null);
    const channels: BroadcastChannel[] = [];
    if (channelNotification) channels.push('notification');
    if (channelEmail) channels.push('email');
    if (channels.length === 0) {
      setLocalErr('Select at least one channel');
      return;
    }
    const trimmedSubject = subject.trim();
    if (!trimmedSubject) {
      setLocalErr('Subject is required');
      return;
    }
    const bodyHtml = (editorRef.current?.innerHTML ?? '').trim();
    const bodyText = stripHtml(bodyHtml);
    if (!bodyText) {
      setLocalErr('Message body is required');
      return;
    }
    try {
      await onSend({
        subject: trimmedSubject,
        bodyHtml,
        bodyText,
        channels,
        idempotencyKey: idempotencyKeyRef.current,
      });
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Failed to send');
    }
  }

  function currentContent() {
    const bodyHtml = (editorRef.current?.innerHTML ?? '').trim();
    const bodyText = stripHtml(bodyHtml);
    const channels: BroadcastChannel[] = [];
    if (channelNotification) channels.push('notification');
    if (channelEmail) channels.push('email');
    return { subject: subject.trim(), bodyHtml, bodyText, channels };
  }

  /** Has the admin typed anything worth keeping? */
  function hasContent() {
    const { subject: s, bodyText } = currentContent();
    return Boolean(s || bodyText);
  }

  function editRecipients() {
    const { subject: s, bodyHtml, channels } = currentContent();
    onEditRecipients({ subject: s, bodyHtml, channels });
  }

  /** Save; returns true on success so callers can then close. */
  async function handleSaveDraft(): Promise<boolean> {
    if (!onSaveDraft) return false;
    setLocalErr(null);
    const { subject: s, bodyHtml, bodyText, channels } = currentContent();
    try {
      await onSaveDraft({ subject: s, bodyHtml, bodyText, channels });
      setDirty(false);
      setJustSaved(true);
      return true;
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Failed to save draft');
      return false;
    }
  }

  // Footer "Save as draft": save, flash "Saved ✓", then close.
  async function saveDraftFromButton() {
    const ok = await handleSaveDraft();
    if (!ok) return;
    setConfirmLeave(false);
    window.setTimeout(() => onClose(), 650);
  }

  // Leaving: only prompt when there are genuinely unsaved changes.
  function requestClose() {
    if (sending || savingDraft) return;
    if (onSaveDraft && dirty && hasContent()) {
      setConfirmLeave(true);
      return;
    }
    onClose();
  }

  async function saveDraftAndClose() {
    const ok = await handleSaveDraft();
    setConfirmLeave(false);
    if (ok) onClose();
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay active"
      style={{ zIndex: 1200 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      onKeyDown={() => {}}
      role="presentation"
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-broadcast-title"
        style={{ maxWidth: 640 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="admin-broadcast-title" className="modal-title">
              Send message
            </h2>
            <p className="modal-subtitle">Compose a broadcast to the selected users</p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={requestClose}
            disabled={sending || savingDraft}
            aria-label="Close"
          >
            <XCircle size={20} color="#64748b" />
          </button>
        </div>
        <div className="modal-body">
          {localErr ? (
            <div className="error-banner" style={{ marginBottom: 12 }}>
              {localErr}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: recipientsExpanded && recipientCount > 0 ? 6 : 14,
              gap: 8,
            }}
          >
            <button
              type="button"
              aria-expanded={recipientsExpanded}
              disabled={recipientCount === 0}
              onClick={() => setRecipientsExpanded((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: recipientCount === 0 ? 'default' : 'pointer',
                minWidth: 0,
              }}
            >
              {recipientCount > 0 ? (
                recipientsExpanded ? (
                  <ChevronDown size={15} color="#64748b" />
                ) : (
                  <ChevronRight size={15} color="#64748b" />
                )
              ) : null}
              <span
                className="text-xs font-medium"
                style={{ color: recipientCount === 0 ? '#B91C1C' : '#334155' }}
              >
                Recipients ({recipientCount})
              </span>
              {recipientCount > 0 && !recipientsExpanded ? (
                <span
                  className="text-xs text-muted"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 220,
                  }}
                >
                  — {recipients.slice(0, 2).map((r) => r.email).join(', ')}
                  {recipientCount > 2 ? ` +${recipientCount - 2} more` : ''}
                </span>
              ) : null}
            </button>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '2px 10px', fontSize: 12 }}
                disabled={sending || savingDraft}
                onClick={editRecipients}
              >
                {recipientCount > 0 ? 'Add / change' : 'Choose recipients'}
              </button>
              {recipientCount > 0 ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '2px 10px', fontSize: 12 }}
                  disabled={sending || savingDraft}
                  onClick={onClearRecipients}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
          {recipientCount === 0 ? (
            <p
              className="text-sm"
              style={{ margin: '0 0 14px', color: '#B91C1C' }}
            >
              No recipients selected. Use “Choose recipients” to pick users
              from the table, then come back here.
            </p>
          ) : recipientsExpanded ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                maxHeight: 160,
                overflowY: 'auto',
                padding: 8,
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                marginBottom: 14,
                background: '#F8FAFC',
              }}
            >
              {recipients.map((r) => (
                <span
                  key={r.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 6px 3px 10px',
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: 999,
                    fontSize: 12,
                    maxWidth: '100%',
                  }}
                  title={`${r.email} · ${r.role}`}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 220,
                    }}
                  >
                    {r.email}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${r.email}`}
                    disabled={sending || savingDraft}
                    onClick={() => onRemoveRecipient(r.id)}
                    style={{
                      display: 'inline-flex',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                      color: '#64748b',
                    }}
                  >
                    <XCircle size={14} />
                  </button>
                </span>
              ))}
              {recipientCount > recipients.length ? (
                <span
                  className="text-xs text-muted"
                  style={{ alignSelf: 'center', padding: '0 4px' }}
                >
                  +{recipientCount - recipients.length} more on other pages
                </span>
              ) : null}
            </div>
          ) : null}

          <label className="text-xs font-medium text-muted" htmlFor="broadcast-subject">
            Subject
          </label>
          <input
            id="broadcast-subject"
            type="text"
            className="input"
            style={{ marginTop: 4, marginBottom: 14 }}
            maxLength={200}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              markDirty();
            }}
            placeholder="Message subject"
            disabled={sending}
          />

          <div className="text-xs font-medium text-muted" style={{ marginBottom: 4 }}>
            Message
          </div>
          <div
            style={{
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center',
                padding: '8px 10px',
                borderBottom: '1px solid #E5E7EB',
                background: '#F8FAFC',
              }}
            >
              <button
                type="button"
                className="icon-btn"
                title="Bold"
                aria-pressed={fmt.bold}
                disabled={sending}
                style={fmt.bold ? activeBtnStyle : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCommand('bold')}
              >
                <Bold size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Italic"
                aria-pressed={fmt.italic}
                disabled={sending}
                style={fmt.italic ? activeBtnStyle : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCommand('italic')}
              >
                <Italic size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Underline"
                aria-pressed={fmt.underline}
                disabled={sending}
                style={fmt.underline ? activeBtnStyle : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCommand('underline')}
              >
                <Underline size={16} />
              </button>
              <select
                className="input"
                style={{
                  width: 'auto',
                  minWidth: 108,
                  padding: '4px 36px 4px 10px',
                  fontSize: 13,
                  cursor: sending ? 'not-allowed' : 'pointer',
                }}
                value={fontSize}
                disabled={sending}
                onChange={(e) => {
                  setFontSize(e.target.value);
                  runCommand('fontSize', e.target.value);
                }}
                aria-label="Font size"
              >
                {FONT_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div
              ref={editorRef}
              contentEditable={!sending}
              suppressContentEditableWarning
              role="textbox"
              aria-multiline
              aria-label="Message body"
              onInput={markDirty}
              onKeyUp={syncFormatState}
              onMouseUp={syncFormatState}
              style={{
                minHeight: 160,
                maxHeight: 280,
                overflowY: 'auto',
                padding: 12,
                outline: 'none',
                fontSize: 15,
                lineHeight: 1.5,
              }}
            />
          </div>

          <div className="text-xs font-medium text-muted" style={{ marginBottom: 8 }}>
            Channels
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={channelNotification}
                disabled={sending}
                onChange={(e) => {
                  setChannelNotification(e.target.checked);
                  markDirty();
                }}
              />
              In-app notification
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={channelEmail}
                disabled={sending}
                onChange={(e) => {
                  setChannelEmail(e.target.checked);
                  markDirty();
                }}
              />
              Email
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: 12 }}
              disabled={sending || savingDraft}
              onClick={requestClose}
            >
              Cancel
            </button>
            {onSaveDraft ? (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: 12 }}
                disabled={sending || savingDraft || !hasContent()}
                onClick={() => void saveDraftFromButton()}
              >
                {savingDraft ? 'Saving…' : justSaved ? 'Saved ✓' : 'Save as draft'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: 12 }}
              disabled={sending || savingDraft || recipientCount === 0}
              onClick={() => void handleSend()}
              title={recipientCount === 0 ? 'Select at least one recipient' : undefined}
            >
              {sending ? 'Sending…' : `Send${recipientCount > 0 ? ` (${recipientCount})` : ''}`}
            </button>
          </div>
        </div>

        {confirmLeave ? (
          <div
            className="modal-overlay active"
            style={{ zIndex: 1300 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmLeave(false);
            }}
            onKeyDown={() => {}}
            role="presentation"
          >
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Save this message as a draft?"
              style={{ maxWidth: 420 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="modal-body" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>
                  Save this message?
                </h3>
                <p style={{ margin: '0 0 20px', color: '#475569', fontSize: 14 }}>
                  You have an unsent message. Save it as a draft to finish later,
                  or discard it.
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: 12 }}
                    disabled={savingDraft}
                    onClick={() => {
                      setConfirmLeave(false);
                      onClose();
                    }}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: 12 }}
                    disabled={savingDraft}
                    onClick={() => void saveDraftAndClose()}
                  >
                    {savingDraft ? 'Saving…' : 'Save as draft'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
