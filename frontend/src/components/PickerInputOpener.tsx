'use client';

import { useEffect } from 'react';

const PICKER_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week']);

/** Opens the native picker when a date/time input is clicked anywhere, not just on its icon. */
export default function PickerInputOpener() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (!PICKER_TYPES.has(el.type) || el.disabled || el.readOnly) return;
      try {
        el.showPicker?.();
      } catch {
        // showPicker throws if the browser blocks it (e.g. not user-activated); the icon still works.
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return (
    <style>{`
      input:is([type='date'], [type='time'], [type='datetime-local'], [type='month'], [type='week']):not(:disabled):not([readonly]) {
        cursor: pointer;
      }
    `}</style>
  );
}
