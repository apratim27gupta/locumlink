'use client';

import { useCallback, useEffect, useState } from 'react';
import { NEWS_UPDATES } from '@/lib/newsUpdates';
import WhatsNewModal from '@/components/WhatsNewModal';

export default function NewsUpdatesPage() {
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  const openWhatsNew = useCallback(() => setWhatsNewOpen(true), []);
  const closeWhatsNew = useCallback(() => {
    setWhatsNewOpen(false);
    if (typeof window !== 'undefined' && window.location.hash === '#release') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const maybeOpen = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash === 'release' || hash === 'whats-new') setWhatsNewOpen(true);
    };
    maybeOpen();
    window.addEventListener('hashchange', maybeOpen);
    return () => window.removeEventListener('hashchange', maybeOpen);
  }, []);

  return (
    <>
      <WhatsNewModal open={whatsNewOpen} onClose={closeWhatsNew} />
      <ul className="news-updates-list">
        {NEWS_UPDATES.map((item) => (
          <li key={item.id} className="news-updates-item">
            <time className="news-updates-item__date" dateTime={item.date}>
              {item.dateLabel}
            </time>
            {item.opensWhatsNewModal ? (
              <button
                type="button"
                className="news-updates-item__link"
                onClick={openWhatsNew}
              >
                {item.title}
              </button>
            ) : (
              <span className="news-updates-item__link news-updates-item__link--static">
                {item.title}
              </span>
            )}
            <p className="news-updates-item__summary">{item.summary}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
