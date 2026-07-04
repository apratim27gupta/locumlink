'use client';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/providers/AuthProvider';
import { PwaLifecycle } from '@/components/PwaLifecycle';
import { NativePushBridge } from '@/components/NativePushBridge';

export function Providers({ children }: {
    children: ReactNode;
}) {
    return (
        <AuthProvider>
            <PwaLifecycle />
            <NativePushBridge />
            {children}
        </AuthProvider>
    );
}
