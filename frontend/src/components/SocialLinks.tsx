import { FACEBOOK_URL, LINKEDIN_URL } from '@/lib/support';

type SocialLinksProps = {
  className?: string;
  /** Display size in px for each logo image. */
  iconSize?: number;
};

export function SocialLinks({ className, iconSize = 36 }: SocialLinksProps) {
  return (
    <div className={className ?? 'site-social-links'} role="group" aria-label="Social media">
      <a
        href={LINKEDIN_URL}
        className="site-social-link"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LocumLink on LinkedIn"
      >
        {/* Official LinkedIn brand mark (square) */}
        <img
          src="/icons/linkedin.svg"
          alt=""
          width={iconSize}
          height={iconSize}
          decoding="async"
          style={{ width: iconSize, height: iconSize }}
        />
      </a>
      <a
        href={FACEBOOK_URL}
        className="site-social-link site-social-link--circle"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LocumLink on Facebook"
      >
        {/* Current official Facebook brand mark (circle) */}
        <img
          src="/icons/facebook.svg"
          alt=""
          width={iconSize}
          height={iconSize}
          decoding="async"
          style={{ width: iconSize, height: iconSize }}
        />
      </a>
    </div>
  );
}
