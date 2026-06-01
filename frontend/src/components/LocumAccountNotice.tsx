'use client';

import Link from 'next/link';
import type { LocumProfile } from '@/types';
import { getLocumAccountNotice } from '@/lib/locumAccountNotice';
import { contactSupportMailtoHref } from '@/lib/support';

const styles = {
    suspended: {
        background: '#FEF3C7',
        border: '1px solid #FCD34D',
        color: '#92400E',
    },
    rejected: {
        background: '#FFF7ED',
        border: '1px solid #FDBA74',
        color: '#9A3412',
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
            <strong>{notice.title}</strong>
            <div style={{ marginTop: 4 }}>{notice.message}</div>
            {notice.detail && (
                <div style={{ marginTop: 6, fontSize: 11 }}>
                    <strong>Reason:</strong> {notice.detail}
                </div>
            )}
            {notice.variant === 'rejected' && (
                <Link
                    href="/locum/profile"
                    style={{
                        display: 'inline-block',
                        marginTop: 8,
                        fontWeight: 600,
                        color: 'inherit',
                        textDecoration: 'underline',
                    }}
                >
                    Complete Verification
                </Link>
            )}
            {notice.variant === 'suspended' && (
                <a
                    href={contactSupportMailtoHref()}
                    style={{
                        display: 'inline-block',
                        marginTop: 8,
                        fontWeight: 600,
                        color: 'inherit',
                        textDecoration: 'underline',
                    }}
                >
                    Contact Support
                </a>
            )}
        </div>
    );
}
