import FacebookIcon from '@/components/icons/FacebookIcon';
import LinkedInIcon from '@/components/icons/LinkedInIcon';
import { FACEBOOK_URL, LINKEDIN_URL } from '@/lib/support';

type SocialLinksProps = {
    className?: string;
    iconSize?: number;
};

export function SocialLinks({ className, iconSize = 18 }: SocialLinksProps) {
    return (
        <div className={className ?? 'site-social-links'} role="group" aria-label="Social media">
            <a
                href={LINKEDIN_URL}
                className="site-social-link"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LocumLink on LinkedIn"
            >
                <LinkedInIcon size={iconSize} />
            </a>
            <a
                href={FACEBOOK_URL}
                className="site-social-link"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LocumLink on Facebook"
            >
                <FacebookIcon size={iconSize} />
            </a>
        </div>
    );
}
