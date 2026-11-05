'use client';

import { useEffect } from 'react';

/** Scrolls to #hash video cards on /how-it-works and keeps the target highlighted. */
export default function HowToHashScroll() {
  useEffect(() => {
    const focusHash = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (!hash) return;
      const el = document.getElementById(hash);
      if (!el) return;
      window.requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        el.classList.add('how-to-video-card--selected');
        document
          .querySelectorAll('.how-to-video-card--selected')
          .forEach((node) => {
            if (node !== el) node.classList.remove('how-to-video-card--selected');
          });
      });
    };

    focusHash();
    window.addEventListener('hashchange', focusHash);
    return () => window.removeEventListener('hashchange', focusHash);
  }, []);
  return null;
}
