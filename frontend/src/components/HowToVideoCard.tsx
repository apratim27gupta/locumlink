'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { howToVideoSrc, howToVideoUploadHint, type HowToVideo } from '@/lib/howToVideos';

type HowToVideoCardProps = {
  video: HowToVideo;
  index: number;
};

/** Tiny ranged GET — works with GCS CORS and does not need a faststart moov atom. */
async function probeVideoAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      mode: 'cors',
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

export default function HowToVideoCard({ video, index }: HowToVideoCardProps) {
  const publicSrc = howToVideoSrc(video);
  const apiSrc = `/api/how-to-videos/${encodeURIComponent(video.id)}`;
  const embedUrl = video.embedUrl || null;
  const titleId = useId();

  const [src, setSrc] = useState(video.providerSrc || publicSrc);
  const [ready, setReady] = useState(Boolean(embedUrl));
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const syncSelected = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      setSelected(hash === video.id);
    };
    syncSelected();
    window.addEventListener('hashchange', syncSelected);
    return () => window.removeEventListener('hashchange', syncSelected);
  }, [video.id]);

  // Do not use <video preload="metadata"> for availability — Safari stalls on
  // large non-faststart MP4s (moov at end). Probe with a 1-byte range instead.
  useEffect(() => {
    if (embedUrl) return;

    let cancelled = false;
    const primary = video.providerSrc || publicSrc;

    (async () => {
      if (await probeVideoAvailable(primary)) {
        if (!cancelled) {
          setSrc(primary);
          setReady(true);
          setFailed(false);
        }
        return;
      }
      if (primary !== apiSrc && (await probeVideoAvailable(apiSrc))) {
        if (!cancelled) {
          setSrc(apiSrc);
          setReady(true);
          setFailed(false);
        }
        return;
      }
      if (!cancelled) {
        setFailed(true);
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [embedUrl, video.providerSrc, publicSrc, apiSrc]);

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
  }, [lightboxOpen]);

  const showPlaceholder = !embedUrl && !ready;
  const canOpen = Boolean(embedUrl) || (ready && !failed);

  function openLightbox() {
    if (!canOpen) return;
    setLightboxOpen(true);
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
                    ref={lightboxVideoRef}
                    className="how-to-video-lightbox__media"
                    controls
                    controlsList="nodownload"
                    playsInline
                    autoPlay
                    preload="auto"
                    title={video.title}
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
          {showPlaceholder ? (
            <div className="how-to-video-card__placeholder">
              <span className="how-to-video-card__num">{String(index + 1).padStart(2, '0')}</span>
              <span className="how-to-video-card__soon">
                {failed ? 'Demo video coming soon' : 'Checking for video…'}
              </span>
              {failed ? (
                <span className="how-to-video-card__file-hint">
                  Upload to <code>{howToVideoUploadHint(video)}</code>
                </span>
              ) : null}
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
