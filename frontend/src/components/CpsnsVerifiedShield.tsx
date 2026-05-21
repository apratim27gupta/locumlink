'use client';

export function CpsnsVerifiedShield({
    size = 22,
    stroke = '#1B31D2',
}: {
    size?: number;
    stroke?: string;
}) {
    return (
        <span
            style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
            title="CPSNS verified"
            aria-label="CPSNS verified"
        >
            <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
            >
                <path
                    d="M12 3.25 19 5.9v5.25c0 4.45-2.82 7.95-7 9.6-4.18-1.65-7-5.15-7-9.6V5.9l7-2.65Z"
                    stroke={stroke}
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                />
                <path
                    d="M8.6 12.1 10.9 14.4 15.7 9.6"
                    stroke={stroke}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </span>
    );
}
