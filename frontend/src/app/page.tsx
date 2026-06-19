import { redirect } from 'next/navigation';

type RootProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Supabase may redirect to Site URL with ?code= — forward to the real callback route. */
export default async function Root({ searchParams }: RootProps) {
    const sp = await searchParams;
    if (sp.code || sp.error || sp.error_description) {
        const qs = new URLSearchParams();
        for (const [key, val] of Object.entries(sp)) {
            if (typeof val === 'string')
                qs.set(key, val);
        }
        redirect(`/auth/callback?${qs.toString()}`);
    }
    const qs = new URLSearchParams();
    for (const [key, val] of Object.entries(sp)) {
        if (typeof val === 'string') qs.set(key, val);
    }
    const suffix = qs.toString();
    redirect(suffix ? `/home?${suffix}` : '/home');
}
