'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { beforeClientNavigation } from '@/lib/topLoader';
import { ROLE_ACCENT, ROLE_GUIDE } from '@/lib/roleAccent';
import type { Role } from '@/lib/auth';

type SignInRoleDropdownProps = {
  interactive?: boolean;
  /** Extra query params (e.g. next=) appended after role/mode. */
  extraParams?: Record<string, string>;
  className?: string;
};

const OPTIONS: Array<{ role: Role; label: string }> = [
  { role: 'clinic', label: 'Host' },
  { role: 'locum', label: 'Locum' },
];

export default function SignInRoleDropdown({
  interactive = true,
  extraParams,
  className,
}: SignInRoleDropdownProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function go(role: Role) {
    setOpen(false);
    const qs = new URLSearchParams({
      mode: 'signin',
      role,
      locked: 'true',
      ...extraParams,
    });
    const href = `/auth?${qs.toString()}`;
    beforeClientNavigation(href);
    router.push(href);
  }

  return (
    <div
      ref={rootRef}
      className={`signin-role-dropdown ${className ?? ''}`.trim()}
      style={{ position: 'relative' }}
    >
      <button
        type="button"
        className={`btn-signin ${!interactive ? 'btn-signin--disabled' : ''}`}
        disabled={!interactive}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (!interactive) return;
          setOpen((v) => !v);
        }}
      >
        Sign in
      </button>
      {open && interactive ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Sign in as"
          className="signin-role-dropdown__menu"
        >
          {OPTIONS.map(({ role, label }) => {
            const accent = ROLE_ACCENT[role];
            return (
              <button
                key={role}
                type="button"
                role="menuitem"
                className="signin-role-dropdown__item"
                title={ROLE_GUIDE[role]}
                aria-label={`${label}. ${ROLE_GUIDE[role]}`}
                onClick={() => go(role)}
                style={{
                  color: accent.primary,
                  borderColor: accent.primary,
                  background: '#fff',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
