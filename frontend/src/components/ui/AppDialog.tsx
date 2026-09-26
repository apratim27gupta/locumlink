'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

type Tone = 'default' | 'danger';

type DialogBase = {
  title?: string;
  message: string;
  confirmLabel?: string;
  tone?: Tone;
};

type AlertRequest = DialogBase & { kind: 'alert'; resolve: () => void };
type ConfirmRequest = DialogBase & {
  kind: 'confirm';
  cancelLabel?: string;
  resolve: (ok: boolean) => void;
};
type PromptRequest = DialogBase & {
  kind: 'prompt';
  cancelLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  resolve: (value: string | null) => void;
};
type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest;

let queue: DialogRequest[] = [];
const listeners = new Set<(q: DialogRequest[]) => void>();

function emit() {
  for (const l of listeners) l(queue);
}

function enqueue(req: DialogRequest) {
  queue = [...queue, req];
  emit();
}

function dequeue(req: DialogRequest) {
  queue = queue.filter((r) => r !== req);
  emit();
}

export type AlertOptions = Omit<DialogBase, 'message'>;
export type ConfirmOptions = DialogBase & { cancelLabel?: string };
export type PromptOptions = ConfirmOptions & {
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
};

/** In-app replacement for `window.alert`. */
export function showAlert(message: string, options: AlertOptions = {}): Promise<void> {
  return new Promise((resolve) =>
    enqueue({ kind: 'alert', message, ...options, resolve }),
  );
}

/** In-app replacement for `window.confirm`; resolves `true` when confirmed. */
export function showConfirm(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options;
  return new Promise((resolve) => enqueue({ kind: 'confirm', ...opts, resolve }));
}

/** In-app replacement for `window.prompt`; resolves `null` when cancelled. */
export function showPrompt(options: PromptOptions | string): Promise<string | null> {
  const opts = typeof options === 'string' ? { message: options } : options;
  return new Promise((resolve) => enqueue({ kind: 'prompt', ...opts, resolve }));
}

const secondaryBtn: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  background: '#fff',
  color: '#0F2A7A',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function primaryBtn(tone: Tone): CSSProperties {
  return {
    padding: '10px 18px',
    borderRadius: 8,
    border: 'none',
    background: tone === 'danger' ? '#B91C1C' : '#1522A6',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

function defaultTitle(req: DialogRequest): string {
  if (req.title) return req.title;
  if (req.kind === 'confirm') return 'Are you sure?';
  if (req.kind === 'prompt') return 'Add a note';
  return 'Notice';
}

export function AppDialogHost() {
  const [items, setItems] = useState<DialogRequest[]>(queue);
  const [value, setValue] = useState('');
  const primaryRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const current = items[0];

  useEffect(() => {
    if (!current) return;
    if (current.kind === 'prompt') {
      setValue(current.defaultValue ?? '');
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      requestAnimationFrame(() => primaryRef.current?.focus());
    }
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!current) return null;

  function cancel() {
    if (!current) return;
    dequeue(current);
    if (current.kind === 'alert') current.resolve();
    else if (current.kind === 'confirm') current.resolve(false);
    else current.resolve(null);
  }

  function accept() {
    if (!current) return;
    dequeue(current);
    if (current.kind === 'alert') current.resolve();
    else if (current.kind === 'confirm') current.resolve(true);
    else current.resolve(value);
  }

  const tone = current.tone ?? 'default';
  const confirmLabel =
    current.confirmLabel ?? (current.kind === 'alert' ? 'OK' : 'Confirm');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={cancel}
    >
      <form
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 440,
          width: '100%',
          padding: '22px 22px 18px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          fontFamily: 'Inter, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          accept();
        }}
      >
        <h2
          id="app-dialog-title"
          style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: '#111827' }}
        >
          {defaultTitle(current)}
        </h2>
        <p
          style={{
            margin: '0 0 18px',
            fontSize: 14,
            color: '#374151',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          {current.message}
        </p>
        {current.kind === 'prompt' ? (
          current.multiline ? (
            <textarea
              ref={inputRef}
              value={value}
              placeholder={current.placeholder}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              style={inputStyle}
            />
          ) : (
            <input
              ref={inputRef}
              value={value}
              placeholder={current.placeholder}
              onChange={(e) => setValue(e.target.value)}
              style={inputStyle}
            />
          )
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {current.kind !== 'alert' ? (
            <button type="button" onClick={cancel} style={secondaryBtn}>
              {current.cancelLabel ?? 'Cancel'}
            </button>
          ) : null}
          <button ref={primaryRef} type="submit" style={primaryBtn(tone)}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  fontSize: 14,
  fontFamily: 'inherit',
  marginBottom: 16,
  resize: 'vertical',
};
