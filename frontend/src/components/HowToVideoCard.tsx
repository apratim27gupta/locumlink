'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { howToVideoSrc, howToVideoUploadHint, type HowToVideo } from '@/lib/howToVideos';

type HowToVideoCardProps = {
  video: HowToVideo;
  index: number;
};

export default function HowToVideoCard({ video, index }: HowToVideoCardProps) {
  const publicSrc = howToVideoSrc(video);
  const apiSrc = `/api/how-to-videos/${encodeURIComponent(video.id)}`;
  const embedUrl = video.embedUrl || null;
  const titleId = useId();

  // Catalog demos are expected in GCS. Do not fetch()-probe availability:
  // cross-origin Range probes fail in some browsers / service-worker setups
  // (staging showed every card as "coming soon" after that change).
  // Safari also stalls on preload=metadata for large non-faststart MP4s, so the
  // card never mounts a <video> — playback starts only in the lightbox.
  const [src, setSrc] = useState(video.providerSrc || publicSrc);
  const [usedFallback, setUsedFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxVideoRef = useRef<HTMLVideoElement>(null);

  const ready = Boolean(embedUrl) || !failed;
  const canOpen = Boolean(embedUrl) || !failed;

  useEffect(() => {
    const syncSelected = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      setSelected(hash === video.id);
    };
    syncSelected();
    window.addEventListener('hashchange', syncSelected);
    return () => window.removeEventListener('hashchange', syncSelected);
  }, [video.id]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const v = lightboxVideoRef.current;
    if (v) {
      void v.play().catch(() => {});
    }
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [lightboxOpen, src]);

  function openLightbox() {
    if (!canOpen) return;
    setLightboxOpen(true);
  }

  function onLightboxError() {
    if (!usedFallback && src !== apiSrc) {
      setUsedFallback(true);
      setSrc(apiSrc);
      return;
    }
    setFailed(true);
    setLightboxOpen(false);
  }

  const lightbox =
    lightboxOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="how-to-video-lightbox"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setLightboxOpen(false);
            }}
          >
            <div
              className="how-to-video-lightbox__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="how-to-video-lightbox__top">
                <h2 id={titleId} className="how-to-video-lightbox__title">
                  {video.title}
                </h2>
                <button
                  type="button"
                  className="how-to-video-lightbox__close"
                  aria-label="Close video"
                  onClick={() => setLightboxOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="how-to-video-lightbox__stage">
                {embedUrl ? (
                  <iframe
                    className="how-to-video-lightbox__media"
                    src={embedUrl}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    key={src}
                    ref={lightboxVideoRef}
                    className="how-to-video-lightbox__media"
                    controls
                    controlsList="nodownload"
                    playsInline
                    autoPlay
                    preload="auto"
                    title={video.title}
                    onError={onLightboxError}
                  >
                    <source src={src} type="video/mp4" />
                  </video>
                )}
              </div>
              <p className="how-to-video-lightbox__desc">{video.description}</p>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section
        id={video.id}
        className={
          selected ? 'how-to-video-card how-to-video-card--selected' : 'how-to-video-card'
        }
        aria-labelledby={`${video.id}-title`}
      >
        <div className="how-to-video-card__player">
          {embedUrl ? (
            <iframe
              className="how-to-video-card__embed"
              src={embedUrl}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              tabIndex={-1}
            />
          ) : null}
          {!ready ? (
            <div className="how-to-video-card__placeholder">
              <span className="how-to-video-card__num">{String(index + 1).padStart(2, '0')}</span>
              <span className="how-to-video-card__soon">Demo video coming soon</span>
              <span className="how-to-video-card__file-hint">
                Upload to <code>{howToVideoUploadHint(video)}</code>
              </span>
            </div>
          ) : null}
          {canOpen ? (
            <button
              type="button"
              className="how-to-video-card__play"
              onClick={openLightbox}
              aria-label={`Play ${video.title} in larger view`}
            >
              <span className="how-to-video-card__play-icon" aria-hidden />
              <span className="how-to-video-card__play-label">Watch</span>
            </button>
          ) : null}
        </div>
        <div className="how-to-video-card__body">
          <div className="how-to-video-card__chips">
            <span className="how-to-video-card__audience">{video.audience}</span>
            {video.durationHint ? (
              <span className="how-to-video-card__duration">{video.durationHint}</span>
            ) : null}
          </div>
          <h2 id={`${video.id}-title`} className="how-to-video-card__title">
            {video.title}
          </h2>
          <p className="how-to-video-card__desc">{video.description}</p>
        </div>
      </section>
      {lightbox}
    </>
  );
}
