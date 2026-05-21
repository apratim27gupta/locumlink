'use client';
export type ProfileStatusGlyphVariant =
    | 'incomplete'
    | 'verified'
    | 'underReview'
    | 'pendingStaff'
    | 'rejected'
    | 'suspended';
type Props = {
    variant: ProfileStatusGlyphVariant;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
};
export function ProfileStatusGlyph({ variant, size = 48, className, style, }: Props) {
    const dim = { width: size, height: size, display: 'block', flexShrink: 0 } as const;
    if (variant === 'pendingStaff') {
        return (<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={className} style={{ ...dim, ...style }}>
        <circle cx="24" cy="24" r="22" fill="#FEF3C7" stroke="#FBBF24" strokeWidth="2"/>
        <rect x="14" y="12" width="20" height="26" rx="2.5" fill="#fff" stroke="#D97706" strokeWidth="1.5"/>
        <path d="M17.5 19h13M17.5 24h13M17.5 29h9" stroke="#B45309" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>);
    }
    if (variant === 'verified') {
        return (<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={className} style={{ ...dim, ...style }}>
        <circle cx="24" cy="24" r="22" fill="#DCFCE7" stroke="#22C55E" strokeWidth="2"/>
        <path d="M15 24.5l5.5 5.5L34 17" stroke="#15803D" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>);
    }
    if (variant === 'underReview') {
        return (<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={className} style={{ ...dim, ...style }}>
        <circle cx="24" cy="24" r="22" fill="#EFF6FF" stroke="#93C5FD" strokeWidth="2"/>
        <circle cx="24" cy="24" r="10" stroke="#2563EB" strokeWidth="1.8"/>
        <path d="M24 16v8l5 3.5" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>);
    }
    if (variant === 'rejected') {
        return (<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={className} style={{ ...dim, ...style }}>
        <circle cx="24" cy="24" r="22" fill="#FEE2E2" stroke="#FCA5A5" strokeWidth="2"/>
        <path d="M17 17l14 14M31 17L17 31" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>);
    }
    if (variant === 'suspended') {
        return (<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={className} style={{ ...dim, ...style }}>
        <circle cx="24" cy="24" r="22" fill="#FEF3C7" stroke="#FCD34D" strokeWidth="2"/>
        <path d="M24 14v14M24 32v2" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>);
    }
    return (<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={className} style={{ ...dim, ...style }}>
      <circle cx="24" cy="24" r="22" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="2"/>
      <ellipse cx="24" cy="33" rx="11" ry="8" fill="#3B4FD8"/>
      <circle cx="24" cy="17" r="6.5" fill="#3B4FD8"/>
      <circle cx="35" cy="35" r="7" fill="#fff" stroke="#6366F1" strokeWidth="1.5"/>
      <path d="M35 32v6M32 35h6" stroke="#6366F1" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>);
}
