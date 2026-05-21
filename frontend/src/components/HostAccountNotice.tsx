'use client';

import type { HostProfile } from '@/types';
import { getHostAccountNotice } from '@/lib/hostAccountNotice';

const styles = {
    suspended: {
        background: '#FEF3C7',
        border: '1px solid #FCD34D',
        color: '#92400E',
    },
    rejected: {
        background: '#FEE2E2',
        border: '1px solid #FECACA',
        color: '#991B1B',
    },
} as const;

export default function HostAccountNotice({
    profile,
}: {
    profile: HostProfile | null | undefined;
}) {
    const notice = getHostAccountNotice(profile);
    if (!notice) return null;
    const palette = styles[notice.variant];
    return (
        <div
            role="alert"
            style={{
                boxSizing: 'border-box',
                width: '100%',
                padding: '14px 16px',
                borderRadius: 8,
                marginBottom: 20,
                ...palette,
            }}
        >
            <p
                style={{
                    margin: 0,
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    fontSize: 14,
                    lineHeight: 1.4,
                }}
            >
                {notice.title}
            </p>
            <p
                style={{
                    margin: '6px 0 0',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 400,
                    fontSize: 13,
                    lineHeight: 1.5,
                }}
            >
                {notice.message}
            </p>
        </div>
    );
}
