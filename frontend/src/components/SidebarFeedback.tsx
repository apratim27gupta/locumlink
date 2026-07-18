'use client';

import { useState, type FormEvent } from 'react';
import { submitFeedback } from '@/lib/api';

type SidebarFeedbackProps = {
  onNavigate?: () => void;
};

export default function SidebarFeedback({ onNavigate }: SidebarFeedbackProps) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');
    try {
      await submitFeedback(trimmed);
      setDone(true);
      setMessage('');
      onNavigate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send feedback.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-sidebar-feedback">
      <div className="dash-sidebar-feedback-title">Feedback</div>
      {done ? (
        <p className="dash-sidebar-feedback-success">
          Thank you — your feedback has been recorded.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="dash-sidebar-feedback-form">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Share feedback with LocumLink…"
            rows={3}
            maxLength={2000}
            disabled={busy}
            className="dash-sidebar-feedback-input"
          />
          {error ? (
            <p className="dash-sidebar-feedback-error">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !message.trim()}
            className="dash-sidebar-feedback-submit"
          >
            {busy ? 'Sending…' : 'Submit'}
          </button>
        </form>
      )}
    </div>
  );
}
