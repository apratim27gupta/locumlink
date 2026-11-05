'use client';

import { useEffect, useState } from 'react';
import { howToVideoSrc, howToVideoUploadHint, type HowToVideo } from '@/lib/howToVideos';

type HowToVideoCardProps = {
  video: HowToVideo;
  index: number;
};

export default function HowToVideoCard({ video, index }: HowToVideoCardProps) {
  const publicSrc = howToVideoSrc(video);
  const apiSrc = `/api/how-to-videos/${encodeURIComponent(video.id)}`;
  const embedUrl = video.embedUrl || null;

  const [src, setSrc] = useState(video.providerSrc || publicSrc);
  const [usedFallback, setUsedFallback] = useState(false);
  const [ready, setReady] = useState(Boolean(embedUrl));
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    const syncSelected = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      setSelected(hash === video.id);
    };
    syncSelected();
    window.addEventListener('hashchange', syncSelected);
    return () => window.removeEventListener('hashchange', syncSelected);
  }, [video.id]);

  const showPlaceholder = !embedUrl && !ready;

  return (
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
          />
        ) : !failed ? (
          <video
            key={src}
            controls={ready}
            controlsList="nodownload"
            playsInline
            preload="metadata"
            src={src}
            title={video.title}
            className={
              ready
                ? 'how-to-video-card__video'
                : 'how-to-video-card__video how-to-video-card__video--pending'
            }
            onLoadedData={() => setReady(true)}
            onError={() => {
              if (!usedFallback && src !== apiSrc) {
                setUsedFallback(true);
                setReady(false);
                setSrc(apiSrc);
                return;
              }
              setFailed(true);
            }}
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
  );
}
