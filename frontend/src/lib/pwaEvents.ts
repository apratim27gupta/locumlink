/** Dispatched when the PWA should refresh live data (push, foreground, SW update). */
export const PWA_REFRESH_EVENT = 'll-pwa-refresh';

export function dispatchPwaRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PWA_REFRESH_EVENT));
}

export function onPwaRefresh(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => handler();
  window.addEventListener(PWA_REFRESH_EVENT, wrapped);
  return () => window.removeEventListener(PWA_REFRESH_EVENT, wrapped);
}
