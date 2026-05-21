'use client';

import type { LocumProfile } from '@/types';
import { getLocumAccountNotice } from '@/lib/locumAccountNotice';

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

export default function LocumAccountNotice({
    profile,
    marginBottom = 14,
}: {
    profile: LocumProfile | null | undefined;
    marginBottom?: number;
}) {
    const notice = getLocumAccountNotice(profile);
    if (!notice) return null;
    const palette = styles[notice.variant];
    return (
        <div
            role="alert"
            style={{
                boxSizing: 'border-box',
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                marginBottom,
                fontSize: 12,
                lineHeight: 1.5,
                ...palette,
            }}
        >
            <strong>{notice.title}:</strong> {notice.message}
        </div>
    );
}
