'use client';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/providers/AuthProvider';
import { PwaLifecycle } from '@/components/PwaLifecycle';

export function Providers({ children }: {
    children: ReactNode;
}) {
    return (
        <AuthProvider>
            <PwaLifecycle />
            {children}
        </AuthProvider>
    );
}
