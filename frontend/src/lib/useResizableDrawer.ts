'use client';

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';

type Options = {
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
};

function clampWidth(w: number, min: number, max: number): number {
  const viewportMax =
    typeof window === 'undefined' ? max : Math.min(max, window.innerWidth - 24);
  return Math.min(Math.max(w, min), Math.max(min, viewportMax));
}

/** Width state + left-edge drag handle for right-anchored drawers; width persists per storage key. */
export function useResizableDrawer({
  storageKey,
  defaultWidth,
  minWidth = 360,
  maxWidth = 1000,
}: Options) {
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) {
        setWidth(clampWidth(saved, minWidth, maxWidth));
      }
    } catch {
      /* ignore */
    }
    const onResize = () => setWidth((w) => clampWidth(w, minWidth, maxWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [storageKey, minWidth, maxWidth]);

  const onHandleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = width;
      let latestW = startW;
      const onMove = (ev: MouseEvent) => {
        latestW = clampWidth(startW + (startX - ev.clientX), minWidth, maxWidth);
        setWidth(latestW);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try {
          localStorage.setItem(storageKey, String(latestW));
        } catch {
          /* ignore */
        }
      };
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [width, minWidth, maxWidth, storageKey],
  );

  const handleStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 8,
    zIndex: 5,
    cursor: 'ew-resize',
    background: 'transparent',
  };

  return { width, onHandleMouseDown, handleStyle };
}
