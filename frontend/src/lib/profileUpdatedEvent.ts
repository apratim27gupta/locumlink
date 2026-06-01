export const PROFILE_UPDATED_EVENT = 'll-profile-updated';

export function dispatchProfileUpdated(): void {
    if (typeof window === 'undefined')
        return;
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
}

export function subscribeProfileUpdated(handler: () => void): () => void {
    if (typeof window === 'undefined')
        return () => { };
    window.addEventListener(PROFILE_UPDATED_EVENT, handler);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler);
}
