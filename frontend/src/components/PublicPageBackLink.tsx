'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { isValidPublicPageFrom } from '@/lib/support';

export function PublicPageBackLink() {
    const searchParams = useSearchParams();
    const from = searchParams.get('from');
    const backHref = isValidPublicPageFrom(from) ? from : '/home';
    const backLabel = isValidPublicPageFrom(from) ? '← Back' : '← Back to home';

    return (
        <p className="support-page__back">
            <Link href={backHref} className="support-text-link">
                {backLabel}
            </Link>
        </p>
    );
}
