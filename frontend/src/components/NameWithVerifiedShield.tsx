'use client';

import type { CSSProperties, ReactNode } from 'react';
import { CpsnsVerifiedShield } from '@/components/CpsnsVerifiedShield';

export function NameWithVerifiedShield({
    children,
    verified,
    shieldSize = 22,
    shieldStroke,
    style,
    gap = 6,
}: {
    children: ReactNode;
    verified?: boolean;
    shieldSize?: number;
    shieldStroke?: string;
    style?: CSSProperties;
    gap?: number;
}) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap,
                flexWrap: 'wrap',
                ...style,
            }}
        >
            {children}
            {verified ? (
                <CpsnsVerifiedShield size={shieldSize} stroke={shieldStroke} />
            ) : null}
        </span>
    );
}
