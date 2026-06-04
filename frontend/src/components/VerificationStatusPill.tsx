import type { ProfileVerificationBadge } from '@/lib/profileVerificationBadge';

type Props = ProfileVerificationBadge;

export default function VerificationStatusPill({
    label,
    background,
    color,
    border,
}: Props) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3px 10px',
                borderRadius: 999,
                background,
                border: `1px solid ${border}`,
                color,
                fontSize: 12,
                fontWeight: 700,
                lineHeight: '16px',
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </span>
    );
}
