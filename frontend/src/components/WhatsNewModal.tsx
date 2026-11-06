'use client';

import { useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { WHATS_NEW_RELEASE, featureHowToHref } from '@/lib/whatsNewRelease';
import { HOW_IT_WORKS_PAGE_HREF } from '@/lib/howToVideos';

type WhatsNewModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function WhatsNewModal({ open, onClose }: WhatsNewModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const { fees } = WHATS_NEW_RELEASE;

  return (
    <div
      className="whats-new-modal-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="whats-new-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          ref={closeRef}
          type="button"
          className="whats-new-modal__close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <header className="whats-new-modal__hero">
          <div className="whats-new-modal__hero-top">
            <div className="whats-new-modal__brand">
              <Logo white size="md" />
              <span className="whats-new-modal__tagline">{WHATS_NEW_RELEASE.tagline}</span>
            </div>
            <div className="whats-new-modal__release-meta">
              <span className="whats-new-modal__bulletin-label">
                {WHATS_NEW_RELEASE.bulletinLabel}
              </span>
              <span className="whats-new-modal__release-date">{WHATS_NEW_RELEASE.dateLabel}</span>
            </div>
          </div>
          <p className="whats-new-modal__section-label">{WHATS_NEW_RELEASE.sectionLabel}</p>
          <h2 id={titleId} className="whats-new-modal__headline">
            {WHATS_NEW_RELEASE.headline}
          </h2>
          <p className="whats-new-modal__hero-lead">{WHATS_NEW_RELEASE.intro}</p>
        </header>

        <div className="whats-new-modal__body">
          <div className="whats-new-modal__highlights">
            {WHATS_NEW_RELEASE.highlights.map((h) => (
              <div key={h.label} className="whats-new-modal__highlight">
                <span className="whats-new-modal__highlight-label">{h.label}</span>
                <span className="whats-new-modal__highlight-detail">{h.detail}</span>
              </div>
            ))}
          </div>

          <div className="whats-new-modal__section-head">
            <h3 className="whats-new-modal__section-title">Release features</h3>
            
          </div>

          <div className="whats-new-modal__table-wrap">
            <table className="whats-new-modal__table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">User</th>
                  <th scope="col">Feature</th>
                  <th scope="col">What users can do</th>
                  <th scope="col">How-to video</th>
                </tr>
              </thead>
              <tbody>
                {WHATS_NEW_RELEASE.features.map((row) => {
                  const href = featureHowToHref(row);
                  return (
                    <tr key={row.num}>
                      <td>{row.num}</td>
                      <td>
                        <span
                          className={`whats-new-modal__user whats-new-modal__user--${row.user.toLowerCase()}`}
                        >
                          {row.user}
                        </span>
                      </td>
                      <td>{row.feature}</td>
                      <td>{row.whatUsersCanDo}</td>
                      <td>
                        {href ? (
                          <Link href={href} className="whats-new-modal__video-link" onClick={onClose}>
                            Watch demo
                          </Link>
                        ) : (
                          <span className="whats-new-modal__video-soon">Soon</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="whats-new-modal__fees-panel">
            <h3 className="whats-new-modal__fees-title">{fees.title}</h3>
            <p className="whats-new-modal__fees-body">{fees.body}</p>
          </div>
          <p className="whats-new-modal__fees-example">
            <span className="whats-new-modal__fees-example-label">* {fees.exampleLabel}</span>{' '}
            {fees.example}
          </p>

          <p className="whats-new-modal__thanks">
            {WHATS_NEW_RELEASE.thanks}
            <br />
            <span className="whats-new-modal__founder">- {WHATS_NEW_RELEASE.founder}</span>
          </p>
        </div>

        <footer className="whats-new-modal__cta">
          <div className="whats-new-modal__cta-copy">
            <p className="whats-new-modal__cta-title">{WHATS_NEW_RELEASE.cta.title}</p>
            <p className="whats-new-modal__cta-body">{WHATS_NEW_RELEASE.cta.body}</p>
            <a
              href={WHATS_NEW_RELEASE.cta.url}
              className="whats-new-modal__cta-url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {WHATS_NEW_RELEASE.cta.urlLabel}
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
