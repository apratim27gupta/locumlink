'use client';
import { ReactNode } from 'react';
export type AuthSplitVariant = 'signup' | 'verify';
interface Props {
    children: ReactNode;
    variant?: AuthSplitVariant;
}
export default function AuthSplitLayout({ children, variant = 'signup' }: Props) {
    const cardClass = variant === 'verify'
        ? 'auth-bg__card auth-bg__card--verify'
        : 'auth-bg__card auth-bg__card--signup';
    return (
        <div className="auth-page">
            <div className={cardClass}>{children}</div>
        </div>
    );
}
