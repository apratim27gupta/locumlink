import { getActiveJobPostingCount } from '@/lib/active-job-count-server';
import HomePageClient from './home-page-client';

export const dynamic = 'force-dynamic';

export default async function HomePage(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const initialActiveJobCount = await getActiveJobPostingCount();
    return <HomePageClient {...props} initialActiveJobCount={initialActiveJobCount} />;
}
