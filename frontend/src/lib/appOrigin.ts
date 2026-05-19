/** App origin for OAuth redirects — use localhost in dev even if opened via VM IP. */
export function getAppOrigin(): string {
    const fromEnv = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
    if (fromEnv)
        return fromEnv;
    if (typeof window !== 'undefined')
        return window.location.origin;
    return 'http://localhost:3001';
}
