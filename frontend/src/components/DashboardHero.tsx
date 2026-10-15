'use client';

import Image from 'next/image';

type DashboardHeroProps = {
  variant: 'host' | 'locum';
  displayName?: string | null;
};

const COPY = {
  host: {
    eyebrow: 'Host Portal',
    title: 'Welcome back!',
    subtitle:
      'Find qualified locum candidates and keep your clinic covered with confidence.',
    src: '/locumlink_host_hero_banner.jpg',
    alt: 'Lighthouse on the Nova Scotia coast at sunset',
  },
  locum: {
    eyebrow: 'Locum Portal',
    titleFallback: 'Welcome back',
    subtitle:
      'Find and manage locum opportunities that fit your schedule.',
    src: '/locumlink_locum_hero_banner.jpg',
    alt: 'Stethoscope on a clinic desk',
  },
} as const;

export default function DashboardHero({ variant, displayName }: DashboardHeroProps) {
  const isHost = variant === 'host';
  const title = isHost
    ? COPY.host.title
    : displayName?.trim()
      ? `Welcome back, ${displayName.trim()}`
      : COPY.locum.titleFallback;
  const copy = isHost ? COPY.host : COPY.locum;

  return (
    <div className="dash-hero-wrap">
      <section
        className={`dash-hero dash-hero--${variant}`}
        aria-label={isHost ? 'Host portal welcome' : 'Locum portal welcome'}
      >
        <Image
          className="dash-hero-image"
          src={copy.src}
          alt={copy.alt}
          fill
          priority
          sizes="(max-width: 768px) 100vw, calc(100vw - 242px)"
        />
        <div className="dash-hero-wash" aria-hidden />
        <div className="dash-hero-copy">
          <p className="dash-hero-eyebrow">{copy.eyebrow}</p>
          <h1 className="dash-hero-title">{title}</h1>
          <p className="dash-hero-subtitle">{copy.subtitle}</p>
        </div>
      </section>
    </div>
  );
}
