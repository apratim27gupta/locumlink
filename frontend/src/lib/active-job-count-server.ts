/** Server-only: fetch active job count from Nest (single source of truth). */
export async function getActiveJobPostingCount(): Promise<number> {
    const base = (
        process.env.API_INTERNAL_URL ??
        process.env.NEST_INTERNAL_URL ??
        process.env.NEXT_PUBLIC_API_URL ??
        'http://127.0.0.1:3000'
    ).replace(/\/$/, '');

    try {
        const res = await fetch(`${base}/api/locum/jobs/browse-count`, { cache: 'no-store' });
        if (!res.ok) {
            return 0;
        }
        const data = (await res.json()) as { count?: unknown };
        return typeof data.count === 'number' ? data.count : 0;
    } catch {
        return 0;
    }
}
