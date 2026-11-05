'use client';

import { useEffect } from 'react';

/** Scrolls to #hash video cards on /how-to after mount. */
export default function HowToHashScroll() {
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!hash) return;
    window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);
  return null;
}
