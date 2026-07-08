'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { isValidPublicPageFrom } from '@/lib/support';

export function PublicPageBackLink({ className }: { className?: string }) {
    const searchParams = useSearchParams();
    const from = searchParams.get('from');
    const backHref = isValidPublicPageFrom(from) ? from : '/home';
    const backLabel = isValidPublicPageFrom(from) ? '← Back' : '← Back to home';

    return (
        <p className={className ?? 'support-page__back support-page__back--top'}>
            <Link href={backHref} className="support-text-link">
                {backLabel}
            </Link>
        </p>
    );
}
