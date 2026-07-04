export type NativeShellInfo = {
  platform: string;
  pushToken: string | null;
};

declare global {
  interface Window {
    __LOCUMLINK_NATIVE__?: NativeShellInfo;
  }
}

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__LOCUMLINK_NATIVE__);
}

export function getNativePushToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.__LOCUMLINK_NATIVE__?.pushToken ?? null;
}

export function getNativePlatform(): 'ios' | 'android' | null {
  if (typeof window === 'undefined') return null;
  const platform = window.__LOCUMLINK_NATIVE__?.platform;
  if (platform === 'ios' || platform === 'android') return platform;
  return null;
}
