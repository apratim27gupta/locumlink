'use client';

import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { landingApi } from '@/lib/api';

type RequestDemoModalProps = {
  open: boolean;
  onClose: () => void;
};

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; message: string }
  | { kind: 'duplicate'; message: string }
  | { kind: 'error'; message: string };

export default function RequestDemoModal({ open, onClose }: RequestDemoModalProps) {
  const titleId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setState({ kind: 'idle' });
      setEmail('');
      setPhone('');
      setNotes('');
    }
  }, [open]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: 'loading' });
    try {
      await landingApi.requestDemo({
        email: email.trim(),
        phone: phone.trim(),
        notes: notes.trim() || undefined,
      });
      setState({
        kind: 'success',
        message: 'Thanks - we received your demo request and will be in touch soon.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      if (/already have a demo request/i.test(message)) {
        setState({
          kind: 'duplicate',
          message:
            'We already have a demo request for this email. Our team will be in touch.',
        });
      } else {
        setState({ kind: 'error', message });
      }
    }
  }

  const done = state.kind === 'success' || state.kind === 'duplicate';

  return (
    <div
      className="request-demo-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="request-demo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          type="button"
          className="request-demo-modal__close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <h2 id={titleId} className="request-demo-modal__title">
          Request a demo
        </h2>
        <p className="request-demo-modal__lead">
          For clinics and partners. Leave your email and phone and we’ll schedule a short
          walkthrough.
        </p>

        {done ? (
          <div
            className={
              state.kind === 'duplicate'
                ? 'request-demo-modal__alert request-demo-modal__alert--warn'
                : 'request-demo-modal__alert request-demo-modal__alert--ok'
            }
          >
            {state.message}
          </div>
        ) : (
          <form className="request-demo-modal__form" onSubmit={onSubmit}>
            <label className="request-demo-modal__label" htmlFor="demo-email">
              Email
            </label>
            <input
              ref={emailRef}
              id="demo-email"
              type="email"
              required
              autoComplete="email"
              className="request-demo-modal__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="request-demo-modal__label" htmlFor="demo-phone">
              Phone
            </label>
            <input
              id="demo-phone"
              type="tel"
              required
              autoComplete="tel"
              minLength={7}
              className="request-demo-modal__input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <label className="request-demo-modal__label" htmlFor="demo-notes">
              Notes <span className="request-demo-modal__optional">(optional)</span>
            </label>
            <textarea
              id="demo-notes"
              className="request-demo-modal__textarea"
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Clinic name, preferred times, team size…"
            />
            {state.kind === 'error' ? (
              <p className="request-demo-modal__alert request-demo-modal__alert--err">
                {state.message}
              </p>
            ) : null}
            <button
              type="submit"
              className="request-demo-modal__submit"
              disabled={state.kind === 'loading'}
            >
              {state.kind === 'loading' ? 'Sending…' : 'Submit request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
