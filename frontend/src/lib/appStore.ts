const DEFAULT_APP_STORE_URL =
  'https://apps.apple.com/us/app/locumlink-canada/id6789087433';

/** App Store listing URL. Override with NEXT_PUBLIC_APP_STORE_URL if needed. */
export function getAppStoreUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim();
  return url && url.length > 0 ? url : DEFAULT_APP_STORE_URL;
}

export function hasAppStoreUrl(): boolean {
  return Boolean(getAppStoreUrl());
}
