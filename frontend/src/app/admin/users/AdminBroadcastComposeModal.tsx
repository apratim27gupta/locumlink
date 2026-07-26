'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bold, Italic, Underline, XCircle } from 'lucide-react';

export type BroadcastChannel = 'notification' | 'email';

export type BroadcastResult = {
  ok: boolean;
  sentNotification: number;
  sentEmail: number;
  recipientCount: number;
  failed: Array<{ userId: string; error: string }>;
};

type Props = {
  open: boolean;
  recipientLabel: string;
  sending: boolean;
  onClose: () => void;
  onSend: (payload: {
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
  recipientLabel,
  sending,
  onClose,
  onSend,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState('');
  const [channelNotification, setChannelNotification] = useState(true);
  const [channelEmail, setChannelEmail] = useState(true);
  const [fontSize, setFontSize] = useState('3');
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false });
  const [localErr, setLocalErr] = useState<string | null>(null);

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
    setSubject('');
    setChannelNotification(true);
    setChannelEmail(true);
    setFontSize('3');
    setFmt({ bold: false, italic: false, underline: false });
    setLocalErr(null);
    requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.innerHTML = '<p><br></p>';
    });
  }, [open]);

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
      await onSend({ subject: trimmedSubject, bodyHtml, bodyText, channels });
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Failed to send');
    }
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay active"
      style={{ zIndex: 1200 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
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
            <p className="modal-subtitle">{recipientLabel}</p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={sending}
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
            onChange={(e) => setSubject(e.target.value)}
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
                onChange={(e) => setChannelNotification(e.target.checked)}
              />
              In-app notification
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={channelEmail}
                disabled={sending}
                onChange={(e) => setChannelEmail(e.target.checked)}
              />
              Email
            </label>
          </div>

          <div className="grid-2">
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: 12 }}
              disabled={sending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: 12 }}
              disabled={sending}
              onClick={() => void handleSend()}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
