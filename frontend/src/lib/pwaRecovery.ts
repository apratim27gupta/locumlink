const RECOVERY_FLAG = 'll-pwa-recovery';

const CHUNK_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i;

/** Unregister service workers and wipe Cache Storage (post-deploy stale shell recovery). */
export async function clearPwaCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

/** One-shot recovery: clear SW/caches then hard-reload. */
export async function recoverFromStalePwa(): Promise<void> {
  await clearPwaCaches();
  window.location.reload();
}

function readRecoveryFlag(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_FLAG) === '1';
  } catch {
    return false;
  }
}

function markRecoveryAttempted(): void {
  try {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
  } catch {
    /* ignore */
  }
}

/** Returns true when a one-time auto-recovery reload was started. */
export function tryRecoverFromLoadError(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (readRecoveryFlag()) return false;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);

  if (!CHUNK_ERROR_PATTERN.test(message)) return false;

  markRecoveryAttempted();
  void recoverFromStalePwa();
  return true;
}

export function installPwaLoadErrorRecovery(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    if (tryRecoverFromLoadError(event.message)) {
      event.preventDefault();
    }
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    if (tryRecoverFromLoadError(event.reason)) {
      event.preventDefault();
    }
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
